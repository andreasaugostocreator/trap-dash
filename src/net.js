// The link between the players. Two transports run side by side:
//  - direct: WebRTC through PeerJS (lowest lag; often blocked on mobile data by carrier NAT)
//  - relay:  a public MQTT broker over a secure WebSocket (works on any network, a bit more lag)
// Joining succeeds as soon as either one works. Messages go direct when that link is open, else through the relay.
// The host is the hub: up to maxGuests guests (players and spectators) each have their own link to it, and the host
// forwards what the others need (main.js decides what goes where). A guest only ever talks to the host.
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
const LOST_AFTER = 10000;

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
  constructor() {
    this.onMessage = () => {}; this.onLost = () => {}; this.onPeer = () => {}; this.onBack = () => {};
    this.maxGuests = 1;   // how many guests the host lets in (main.js raises it for bigger parties and spectators)
    this.reset();
  }

  reset() {
    this.peer = null; this.conn = null; this.relay = null; this.code = ''; this.role = null;
    this.guests = new Map();   // host: gid -> { conn, lastHeard, waiting, rtt }
    this.gid = null; this.lastHeard = 0; clearInterval(this.ping); this.ping = null; this.rtt = 0;
  }

  // the first guest (the two-player party's friend), kept for the code that only knows one
  get guest() { const g = [...this.guests.keys()][0]; return g || null; }
  get waiting() { const g = this.guests.get(this.guest); return !!(g && g.waiting); }
  get connected() { return this.role === 'host' ? [...this.guests.values()].some(g => !g.waiting) : !!this.ping; }
  get lag() { return Math.min(0.3, (this.rtt || 150) / 2000); }   // one-way delay estimate, seconds
  rttOf(gid) { const g = this.guests.get(gid); return g ? g.rtt : 0; }
  linkOf(gid) { const g = this.guests.get(gid); return g && g.conn && g.conn.open ? 'direct' : 'relay'; }
  get link() { return this.role === 'host' ? this.linkOf(this.guest) : this.conn && this.conn.open ? 'direct' : 'relay'; }
  heardFrom(gid) { const g = this.guests.get(gid); return g ? g.lastHeard : 0; }

  // ---------- host: open a room and wait for guests on either transport
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
        conn.on('open', () => {
          if (!this.admit(gid)) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
          this.useConn(conn, gid); this.welcome(gid);
        });
      });
      peer.on('error', e => { if (!opened) reject(e); else console.warn('peer', e.type); });
      peer.on('disconnected', () => { if (opened && !peer.destroyed && this.peer === peer) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
    }));
    if (!tries.length) throw new Error('offline');
    await Promise.any(tries).catch(() => { throw new Error('offline'); });
    return code;
  }
  admit(gid) { return !!gid && (this.guests.has(gid) || this.guests.size < this.maxGuests); }

  // A guest said hello (through either transport). The same guest coming back after a drop is a reconnect.
  welcome(gid) {
    let g = this.guests.get(gid);
    const fresh = !g, back = !fresh && g.waiting;
    if (fresh) { g = { conn: null, lastHeard: performance.now(), waiting: false, rtt: 0 }; this.guests.set(gid, g); }
    g.waiting = false; g.lastHeard = performance.now();
    this.relayTo(gid, { t: 'welcome' });
    this.startLiveness();
    if (fresh) this.onPeer(gid);
    else if (back) this.onBack(gid);
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
          conn.on('data', m => { if (m && m.t === 'full') finish(Object.assign(new Error('full'), { type: 'full' })); });
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
        const gid = env.gid;
        if (env.m.t === 'knock') {
          if (!this.admit(gid)) { r.publish(topic(this.code, 'g/' + gid), { m: { t: 'full' } }); return; }
          this.welcome(gid); return;
        }
        if (!this.guests.has(gid)) return;
        this.deliver(env.m, gid); return;
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

  useConn(conn, gid) {
    if (this.role === 'host') {
      const g = this.guests.get(gid) || { conn: null, lastHeard: performance.now(), waiting: false, rtt: 0 };
      if (!this.guests.has(gid)) this.guests.set(gid, g);
      if (g.conn && g.conn !== conn) { try { g.conn.close(); } catch { /* gone */ } }
      g.conn = conn;
      conn.on('data', m => this.deliver(m, gid));
      conn.on('close', () => { if (g.conn === conn) g.conn = null; });   // fall back to the relay
      conn.on('error', () => { if (g.conn === conn) g.conn = null; });
      return;
    }
    this.conn = conn;
    conn.on('data', m => this.deliver(m));
    conn.on('close', () => { if (this.conn === conn) this.conn = null; });
    conn.on('error', () => { if (this.conn === conn) this.conn = null; });
  }

  deliver(m, gid) {
    const now = performance.now();
    this.lastHeard = now;
    const g = gid && this.guests.get(gid);
    if (g) g.lastHeard = now;
    if (m && m.t === 'ping' && m.ts) { this.sendTo(gid, { t: 'pong', ts: m.ts }); return; }
    if (m && m.t === 'pong') {
      const rtt = now - m.ts;
      if (g) g.rtt = g.rtt ? g.rtt * 0.8 + rtt * 0.2 : rtt;
      this.rtt = g ? Math.max(...[...this.guests.values()].map(x => x.rtt || 0)) : this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
      return;
    }
    if (!m || m.t === 'ping' || m.t === 'knock') return;
    this.onMessage(m, gid);
  }

  relayTo(gid, m) {
    if (!this.relay || !this.relay.open) return;
    if (this.role === 'host') this.relay.publish(topic(this.code, 'g/' + gid), { m });
    else this.relay.publish(topic(this.code, 'host'), { gid: this.gid, m });
  }

  // guest: to the host. host: to one guest (sendTo), or to every guest (send), optionally all but one
  sendTo(gid, m) {
    if (this.role !== 'host') return this.send(m);
    const g = this.guests.get(gid); if (!g) return;
    if (g.conn && g.conn.open) { try { g.conn.send(m); return; } catch (e) { console.warn(e); } }
    this.relayTo(gid, m);
  }
  send(m, except) {
    if (this.role === 'host') { for (const gid of this.guests.keys()) if (gid !== except) this.sendTo(gid, m); return; }
    if (this.conn && this.conn.open) { try { this.conn.send(m); return; } catch (e) { console.warn(e); } }
    this.relayTo(null, m);
  }

  startLiveness() {
    if (this.role !== 'host') this.lastHeard = performance.now();
    if (this.ping) return;
    this.ping = setInterval(() => {
      const now = performance.now();
      if (this.role === 'host') {
        for (const [gid, g] of this.guests) {
          if (g.waiting) continue;
          this.sendTo(gid, { t: 'ping', ts: now });
          if (now - g.lastHeard > LOST_AFTER) this.lostGuest(gid);
        }
        return;
      }
      this.send({ t: 'ping', ts: now });
      if (now - this.lastHeard > LOST_AFTER) this.lost();
    }, 1500);
  }

  // Nothing heard for a while. The host keeps the guest's place (waiting) so the same guest can come back.
  lostGuest(gid) {
    const g = this.guests.get(gid); if (!g || g.waiting) return;
    g.waiting = true; if (g.conn) { try { g.conn.close(); } catch { /* gone */ } g.conn = null; }
    this.onLost(gid);
  }
  lost() {
    if (this.role === 'host') { for (const gid of this.guests.keys()) this.lostGuest(gid); return; }
    if (!this.ping) return;
    clearInterval(this.ping); this.ping = null;
    this.onLost();
  }

  // The host's room stays open after a guest leaves; a guest disconnects fully.
  dropGuest(gid) {
    const ids = gid ? [gid] : [...this.guests.keys()];
    for (const id of ids) { const g = this.guests.get(id); if (!g) continue; if (g.conn) { try { g.conn.close(); } catch { /* gone */ } } this.guests.delete(id); }
    if (!this.guests.size) { clearInterval(this.ping); this.ping = null; }
  }

  close(quiet) {
    if (!quiet && this.connected) this.send({ t: 'bye' });
    clearInterval(this.ping); this.ping = null;
    const { conn, peer, relay, guests } = this;
    setTimeout(() => {
      try { conn && conn.close(); } catch { /* gone */ }
      for (const g of guests.values()) { try { g.conn && g.conn.close(); } catch { /* gone */ } }
      try { peer && peer.destroy(); } catch { /* gone */ }
      try { relay && relay.close(); } catch { /* gone */ }
    }, quiet ? 0 : 250);
    this.reset();
  }
}
