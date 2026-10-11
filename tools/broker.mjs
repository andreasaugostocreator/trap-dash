// A local PeerJS broker for testing online play offline: node tools/broker.mjs, then open ?peerhost=localhost&peerport=9000
import http from 'http';
import express from 'express';
import { ExpressPeerServer } from 'peer';
const app = express(), server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/' }));
server.listen(9000, '127.0.0.1', () => console.log('PeerJS broker on http://127.0.0.1:9000'));
