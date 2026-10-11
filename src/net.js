// Two-player link over WebRTC (PeerJS). The host registers "trapdash-<CODE>" on the PeerJS broker and the
// friend connects to it; after that, messages go straight between the two browsers.
// For local testing: ?peerhost=127.0.0.1&peerport=9000 uses your own `peerjs` server instead of the public one.
const PREFIX = 'trapdash-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

function peerOptions() {
  const q = new URLSearchParams(location.search), host = q.get('peerhost');
  const o = { debug: 1 };
  if (host) Object.assign(o, { host, port: +(q.get('peerport') || 9000), path: '/', secure: false, config: { iceServers: [] } });
  return o;
}

export class Net {
  constructor() { this.peer = null; this.conn = null; this.lastHeard = 0; this.onMessage = () => {}; this.onLost = () => {}; this.onPeer = () => {}; }

  // Resolves with the room code once the room is open. onPeer fires when the friend arrives.
  host(tries = 4) {
    if (tries === 4) this.opened = false;   // opened: the room got registered with the broker at least once
    return new Promise((resolve, reject) => {
      const code = newCode();
      const peer = new window.Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      peer.on('open', () => { this.opened = true; resolve(code); });
      peer.on('connection', conn => {
        if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
        this.attach(conn, () => this.onPeer());
      });
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && tries > 0) { peer.destroy(); this.host(tries - 1).then(resolve, reject); return; }
        if (!this.opened) { peer.destroy(); reject(e); } else console.warn('peer error', e.type);
      });
      peer.on('disconnected', () => { if (this.opened && !peer.destroyed && this.peer === peer) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000); });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(undefined, peerOptions());
      this.peer = peer;
      const fail = setTimeout(() => reject(new Error('timeout')), 12000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this.attach(conn, () => { clearTimeout(fail); resolve(); });
      });
      peer.on('error', e => { clearTimeout(fail); reject(e); });
    });
  }

  attach(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastHeard = performance.now();
      clearInterval(this.ping);
      this.ping = setInterval(() => {
        this.send({ t: 'ping' });
        if (performance.now() - this.lastHeard > 9000) this.lost();
      }, 1500);
      onOpen();
    });
    conn.on('data', m => { this.lastHeard = performance.now(); if (m && m.t !== 'ping') this.onMessage(m); });
    conn.on('close', () => this.lost());
    conn.on('error', () => this.lost());
  }

  lost() { if (!this.conn) return; this.conn = null; clearInterval(this.ping); this.onLost(); }
  get connected() { return !!(this.conn && this.conn.open); }
  send(m) { if (this.conn && this.conn.open) try { this.conn.send(m); } catch (e) { console.warn(e); } }
  close() {
    clearInterval(this.ping); this.opened = false;
    const c = this.conn; this.conn = null;
    try { if (c) { c.send({ t: 'bye' }); setTimeout(() => c.close(), 100); } } catch { /* already gone */ }
    const p = this.peer; this.peer = null; setTimeout(() => p && p.destroy(), 300);
  }
}
