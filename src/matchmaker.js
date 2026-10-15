// Matchmaking: find a random opponent with no code to share.
// Searchers announce themselves on a shared relay topic every SEEK_EVERY seconds, on every broker (so two players on
// different brokers still see each other). When two searchers see each other, the one with the smaller id hosts: it
// opens an ordinary room quietly and sends the room code privately to the other, who joins it the normal way. Each
// player only takes part in one pairing at a time; if the other side doesn't turn up in time, both go back to
// searching. The game itself then runs over the usual room transports (net.js).
import { Relay, BROKERS } from './relay.js';

const SEEK = 'trapdash/v1/mm/seek', TO = id => `trapdash/v1/mm/to/${id}`;
const SEEK_EVERY = 1.5, FRESH = 5, OFFER_WAIT = 10;
const rid = () => Math.random().toString(36).slice(2, 10);
const Q = () => new URLSearchParams(location.search);

export class Matchmaker {
  // hooks: host() -> Promise<code> (open a room quietly), join(code, name) (join it), unhost() (close an unused room),
  //        status(state, others) for the screen
  constructor(hooks) { this.h = hooks; this.relays = []; this.state = 'idle'; }

  async start(me) {
    this.stop();
    this.id = rid(); this.me = me; this.state = 'connecting'; this.seen = new Map(); this.h.status(this.state, 0);
    const urls = Q().get('relay') ? [Q().get('relay')] : BROKERS;
    const tries = urls.map(async url => {
      const r = new Relay();
      await r.connect([url]);
      if (this.state === "idle") { r.close(); return; }
      r.onMessage = (topic, msg) => this.handle(msg);
      r.subscribe(SEEK); r.subscribe(TO(this.id));
      this.relays.push(r);
    });
    await Promise.allSettled(tries);
    if (this.state === 'idle') return;
    if (!this.relays.length) { this.state = 'offline'; this.h.status('offline', 0); return; }
    this.state = 'seeking';
    this.timer = setInterval(() => this.beat(), SEEK_EVERY * 1000);
    this.beat();
  }

  stop() {
    clearInterval(this.timer); clearTimeout(this.offerTimer);
    for (const r of this.relays) { try { r.onMessage = () => {}; r.close(); } catch { /* gone */ } }
    this.relays = []; this.state = 'idle';
  }

  pub(topic, msg) { for (const r of this.relays) { try { r.publish(topic, msg); } catch { /* that broker dropped */ } } }

  beat() {
    if (this.state !== 'seeking') return;
    this.pub(SEEK, { t: 'seek', id: this.id, name: this.me.name, ts: Date.now() });
    const now = Date.now();
    for (const [id, t] of this.seen) if (now - t > FRESH * 1000) this.seen.delete(id);
    this.h.status('seeking', this.seen.size);
  }

  async handle(m) {
    if (!m || m.id === this.id) return;
    if (m.t === 'seek') {
      if (!this.seen.has(m.id)) { this.seen.set(m.id, Date.now()); this.h.status(this.state, this.seen.size); }
      this.seen.set(m.id, Date.now());
      if (this.state === 'seeking' && this.id < m.id) this.offer(m.id);   // the smaller id hosts
      return;
    }
    if (m.to !== this.id) return;
    if (m.t === 'offer') {
      if (this.state !== 'seeking') { this.pub(TO(m.id), { t: 'busy', id: this.id, to: m.id }); return; }
      this.state = 'joining'; clearInterval(this.timer);
      this.h.status('found', 0, m.name);
      this.h.join(m.code, m.name);
    } else if (m.t === 'busy' && this.state === 'offering' && m.id === this.partner) {
      this.backToSeeking();
    }
  }

  async offer(to) {
    this.state = 'offering'; this.partner = to;
    let code;
    try { code = await this.h.host(); } catch { this.backToSeeking(); return; }
    if (this.state !== 'offering') return;
    this.pub(TO(to), { t: 'offer', id: this.id, to, code, name: this.me.name });
    this.h.status('found', 0);
    clearTimeout(this.offerTimer);
    this.offerTimer = setTimeout(() => { if (this.state === 'offering') this.backToSeeking(); }, OFFER_WAIT * 1000);
  }

  // the other player turned up: matchmaking is over
  matched() { clearTimeout(this.offerTimer); clearInterval(this.timer); this.state = "matched"; for (const r of this.relays) { try { r.close(); } catch { /* gone */ } } this.relays = []; }

  backToSeeking() {
    clearTimeout(this.offerTimer); this.partner = null;
    this.h.unhost();
    this.state = 'seeking'; this.seen.clear();
    clearInterval(this.timer); this.timer = setInterval(() => this.beat(), SEEK_EVERY * 1000); this.beat();
  }
}
