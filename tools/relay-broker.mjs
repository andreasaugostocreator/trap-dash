// A local MQTT-over-WebSocket broker for testing the relay link offline:
// node tools/relay-broker.mjs, then open the game with ?relay=ws://127.0.0.1:8883
import { WebSocketServer, createWebSocketStream } from 'ws';
import aedesPkg from 'aedes';
const aedes = (aedesPkg.createBroker || aedesPkg)();
const wss = new WebSocketServer({ host: '127.0.0.1', port: 8883, handleProtocols: p => (p.has('mqtt') ? 'mqtt' : false) });
wss.on('connection', ws => aedes.handle(createWebSocketStream(ws)));
console.log('MQTT relay on ws://127.0.0.1:8883');
