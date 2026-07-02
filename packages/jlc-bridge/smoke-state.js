// Bigger smoke test: pcb_get_state — proves real EDA data flows back, not just ping echo
import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:18800/ws/bridge');
const cmdId = `state_${Date.now()}`;
const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 10000);

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'command', id: cmdId, timestamp: Date.now(),
    payload: { action: 'get_state', params: {} },
  }));
});
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === 'result' && m.payload?.commandId === cmdId) {
    clearTimeout(t);
    console.log(JSON.stringify(m.payload, null, 2).slice(0, 2000));
    ws.close(); process.exit(0);
  }
});
ws.on('error', e => { console.log('ERR', e.message); process.exit(3); });
