const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:4000/?session=test-session-12345');

ws.on('open', () => {
  console.log('WS Connected ====================');
});

ws.on('message', (data) => {
  console.log('WS Message Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});
