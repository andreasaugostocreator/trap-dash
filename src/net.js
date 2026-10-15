// The link between the two players. Two transports run side by side:
//  - direct: WebRTC through PeerJS (lowest lag; often blocked on mobile data by carrier NAT)
//  - relay:  a public MQTT broker over a secure WebSocket (works on any network, a bit more lag)
// Joining succeeds as soon as either one works. Messages go direct when that link is open, else through the relay.
// Test overrides: ?peerhost=127.0.0.1&peerport=9000 (own PeerJS server), ?relay=ws://127.0.0.1:8883 (own broker),
// ?nop2p / ?norelay to switch one transport off.
import { Relay, BROKERS } from './relay.js';

const PREFIX = 'trapdash-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
const rid = () => Math.random().toString(36).slice(2, 10);
const Q = () => new URLSearchParams(location.search);
const topic = (code, to) => `trapdash/v1/${code}/${to}`;

function peerOptions() {
  const q = Q(), host = q.get('peerhost');
  if (host) return { debug: 1, host, port: +(q.get('peerport') || 9000), path: '/', secure: false, config: { iceServers: [] } };
  return { debug: 1, config: { iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ] } };
}
const useP2P = () => !!window.Peer && !Q().has('nop2p');
const useRelay = () => !Q().has('norelay');
const relayUrls = () => (Q().get('relay') ? [Q().get('relay')] : BROKERS);

export class Net {
  constructor() { this.onMessage = () => {}; this.onLost = () => {}; this.onPeer = () => {}; this.onBack = () => {}; this.reset(); }

  reset() {
    this.peer = null; this.conn = null; this.relay = null; this.code = ''; this.role = null;
    this.guest = null; this.gid = null; this.lastHeard = 0; clearInterval(this.ping); this.ping = null; this.waiting = false;
  }

  get connected() { return !!this.ping; }
  get lag() { return Math.min(0.3, (this.rtt || 150) / 2000); }   // one-way delay estimate, seconds
  get link() { return this.conn && this.conn.open ? 'direct' : 'relay'; }

  // ---------- host: open a room and wait for a friend on either transport
  async host(want = null) {   // want: reopen a party under its old code (the host came back)
    this.close(true);
    const code = want || newCode();
    this.code = code; this.role = 'host';
    const tries = [];
    if (useRelay()) tries.push(this.startRelay(() => this.relay.subscribe(topic(code, 'host'))));
    if (useP2P()) tries.push(new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + code, peerOptions());
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; resolve(); });
      peer.on('connection', conn => {
        const gid = conn.metadata && conn.metadata.gid;
        if (this.guest && gid !== this.guest) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
        conn.on('open', () => { this.useConn(conn); this.welcome(gid); });
      });
      peer.on('error', e => { if (!opened) reject(e); else console.warn('peer', e.type); });
      peer.on('disconnected', () => { if (opened && !peer.destroyed && this.peer === peer) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
    }));
    if (!tries.length) throw new Error('offline');
    await Promise.any(tries).catch(() => { throw new Error('offline'); });
    return code;
  }

  // A guest said hello (through either transport). The same guest coming back after a drop is a reconnect.
  welcome(gid) {
    const fresh = this.guest !== gid, back = !fresh && this.waiting;
    this.guest = gid; this.waiting = false;
    this.relaySend({ t: 'welcome' });
    if (fresh) { this.startLiveness(); this.onPeer(); }
    else if (back) { this.startLiveness(); this.onBack(); }
  }

  // ---------- guest: knock on the relay and try a direct link at the same time
  join(code, gid) {
    this.close(true);
    this.code = code; this.role = 'guest'; this.gid = gid || rid();
    return new Promise((resolve, reject) => {
      let done = false, noHost = false, knock = null;
      const finish = err => {
        if (done) return; done = true; clearTimeout(fail); clearInterval(knock);
        if (err) { this.close(true); reject(err); } else { this.startLiveness(); resolve(); }
      };
      const fail = setTimeout(() => finish(noHost ? Object.assign(new Error('no host'), { type: 'peer-unavailable' }) : new Error('timeout')), 15000);
      if (useRelay()) this.startRelay(() => {
        this.relay.subscribe(topic(code, 'g/' + this.gid));
        const k = () => this.relay.publish(topic(code, 'host'), { gid: this.gid, m: { t: 'knock' } });
        k(); knock = setInterval(k, 1000);
      }, m => { if (m.t === 'welcome') finish(); if (m.t === 'full') finish(Object.assign(new Error('full'), { type: 'full' })); }).catch(() => {});
      if (useP2P()) {
        const peer = new window.Peer(undefined, peerOptions());
        this.peer = peer;
        peer.on('open', () => {
          const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { gid: this.gid } });
          conn.on('open', () => { this.useConn(conn); finish(); });
        });
        peer.on('error', e => { if (e.type === 'peer-unavailable') noHost = true; else console.warn('peer', e.type); });
      }
    });
  }

  // ---------- transports
  async startRelay(onReady, onSpecial) {
    const r = new Relay();
    this.relay = r;
    r.onMessage = (t, env) => {
      if (this.relay !== r || !env || !env.m) return;
      if (this.role === 'host') {
        if (env.m.t === 'knock') {
          if (this.guest && this.guest !== env.gid) { r.publish(topic(this.code, 'g/' + env.gid), { m: { t: 'full' } }); return; }
          this.welcome(env.gid); return;
        }
        if (env.gid !== this.guest) return;
      }
      if (onSpecial) onSpecial(env.m);
      if (env.m.t !== 'welcome') this.deliver(env.m);
    };
    r.onClose = () => { if (this.relay === r && this.role) setTimeout(() => this.relay === r && this.restartRelay(r), 1000); };
    await r.connect(relayUrls());
    onReady();
  }
  async restartRelay(old) {     // mobile networks drop sockets; reconnect quietly and resubscribe
    try { await old.connect([old.url]); for (const s of old.subs) old.subscribe(s); } catch { /* the liveness check will notice */ }
  }

  useConn(conn) {
    this.conn = conn;
    conn.on('data', m => this.deliver(m));
    conn.on('close', () => { if (this.conn === conn) this.conn = null; });   // fall back to the relay
    conn.on('error', () => { if (this.conn === conn) this.conn = null; });
  }

  deliver(m) {
    this.lastHeard = performance.now();
    if (m && m.t === 'ping' && m.ts) { this.send({ t: 'pong', ts: m.ts }); return; }
    if (m && m.t === 'pong') { const rtt = performance.now() - m.ts; this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt; return; }
    if (!m || m.t === 'ping' || m.t === 'knock') return;
    this.onMessage(m);
  }

  relaySend(m) {
    if (!this.relay || !this.relay.open) return;
    if (this.role === 'host') { if (this.guest) this.relay.publish(topic(this.code, 'g/' + this.guest), { m }); }
    else this.relay.publish(topic(this.code, 'host'), { gid: this.gid, m });
  }

  send(m) {
    if (this.conn && this.conn.open) { try { this.conn.send(m); return; } catch (e) { console.warn(e); } }
    this.relaySend(m);
  }

  startLiveness() {
    this.lastHeard = performance.now();
    clearInterval(this.ping);
    this.ping = setInterval(() => {
      this.send({ t: 'ping', ts: performance.now() });
      if (performance.now() - this.lastHeard > 10000) this.lost();
    }, 1500);
  }

  // Nothing heard for a while. The host keeps the guest's place (waiting) so the same guest can come back.
  lost() {
    if (!this.ping) return;
    clearInterval(this.ping); this.ping = null;
    if (this.role === 'host') { this.waiting = true; if (this.conn) { try { this.conn.close(); } catch { /* gone */ } this.conn = null; } }
    this.onLost();
  }

  // The host's room stays open after a guest leaves; a guest disconnects fully.
  dropGuest() { this.guest = null; this.waiting = false; clearInterval(this.ping); this.ping = null; if (this.conn) { try { this.conn.close(); } catch { /* gone */ } this.conn = null; } }

  close(quiet) {
    if (!quiet && this.ping) this.send({ t: 'bye' });
    clearInterval(this.ping); this.ping = null;
    const { conn, peer, relay } = this;
    setTimeout(() => {
      try { conn && conn.close(); } catch { /* gone */ }
      try { peer && peer.destroy(); } catch { /* gone */ }
      try { relay && relay.close(); } catch { /* gone */ }
    }, quiet ? 0 : 250);
    this.reset();
  }
}
