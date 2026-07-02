// WebSocket relay: bridges jlc-bridge (EDA extension) <-> jlcmcp (Claude Code) on /ws/bridge.
// Classifies each connection by its first message: bridge sends 'hello', mcp sends 'command'.
import { WebSocketServer } from 'ws';

const PORT = 18800;
const PATH = '/ws/bridge';

function ts() { return new Date().toISOString().slice(11, 23); }
function log(...a) { console.log(`[${ts()}]`, ...a); }

let bridgeSocket = null;
const mcpSockets = new Set();
const pendingCommands = new Map();

const wss = new WebSocketServer({ port: PORT, path: PATH });

wss.on('connection', (ws, req) => {
  log(`new connection from ${req.socket.remoteAddress}`);
  let role = null;

  ws.on('message', (data) => {
    const text = data.toString();
    let msg;
    try { msg = JSON.parse(text); } catch { log('bad json:', text.slice(0,100)); return; }

    if (!role) {
      if (msg.type === 'hello') {
        role = 'bridge';
        if (bridgeSocket && bridgeSocket !== ws) { try { bridgeSocket.close(); } catch {} }
        bridgeSocket = ws;
        log(`role=bridge ${msg.name} v${msg.version}`);
        return;
      }
      if (msg.type === 'command') {
        role = 'mcp';
        mcpSockets.add(ws);
        log('role=mcp');
        // fall through to forward
      } else {
        role = 'unknown';
        log(`role=unknown (first msg type=${msg.type})`);
        return;
      }
    }

    if (role === 'bridge') {
      // bridge sending result/event/pong back — fan out to mcp clients
      if (msg.type === 'result' && msg.payload?.commandId) {
        const client = pendingCommands.get(msg.payload.commandId);
        if (client && client.readyState === 1) {
          log(`bridge -> mcp: result id=${msg.payload.commandId} success=${msg.payload.success}`);
          client.send(text);
        } else {
          log(`bridge result id=${msg.payload.commandId} but no waiting mcp client`);
        }
        pendingCommands.delete(msg.payload.commandId);
      } else {
        // event / pong — broadcast to all mcp clients
        for (const c of mcpSockets) if (c.readyState === 1) c.send(text);
      }
      return;
    }

    if (role === 'mcp') {
      if (msg.type === 'command' && msg.id) {
        pendingCommands.set(msg.id, ws);
        if (bridgeSocket && bridgeSocket.readyState === 1) {
          log(`mcp -> bridge: ${msg.payload?.action} (id=${msg.id})`);
          bridgeSocket.send(text);
        } else {
          log(`mcp -> bridge: bridge not connected, dropping ${msg.id}`);
          ws.send(JSON.stringify({
            type: 'result',
            payload: { commandId: msg.id, success: false, error: 'bridge not connected' },
          }));
          pendingCommands.delete(msg.id);
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws === bridgeSocket) { log('bridge disconnected'); bridgeSocket = null; }
    else if (mcpSockets.has(ws)) {
      log('mcp disconnected');
      mcpSockets.delete(ws);
      for (const [id, c] of pendingCommands) if (c === ws) pendingCommands.delete(id);
    }
  });
  ws.on('error', (e) => log(`ws error (${role}):`, e.message));
});

log(`relay listening on ws://127.0.0.1:${PORT}${PATH}`);
log('classifies by first msg: bridge=hello, mcp=command');
