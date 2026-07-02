// Smoke test: bypass MCP, send pcb_ping straight through relay -> file -> bridge -> file -> relay
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:18800/ws/bridge');
const cmdId = `smoke_${Date.now()}`;

const timeout = setTimeout(() => {
  console.log('TIMEOUT: no result in 10s — bridge file polling not picking up command.json');
  process.exit(2);
}, 10000);

ws.on('open', () => {
  console.log(`connected. sending ping (id=${cmdId})...`);
  ws.send(JSON.stringify({
    type: 'command',
    id: cmdId,
    timestamp: Date.now(),
    payload: { action: 'ping', params: {} },
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'result' && msg.payload?.commandId === cmdId) {
    clearTimeout(timeout);
    console.log('GOT RESULT:', JSON.stringify(msg.payload, null, 2));
    ws.close();
    process.exit(msg.payload.success ? 0 : 1);
  }
});

ws.on('error', (e) => {
  console.log('ERR', e.message);
  process.exit(3);
});
