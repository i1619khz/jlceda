import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:18800/ws/bridge');
ws.on('open', () => {
  console.log('OK connected');
  ws.send(JSON.stringify({ type: 'hello', name: 'test' }));
  setTimeout(() => process.exit(0), 500);
});
ws.on('error', (e) => console.log('ERR', e.message));
