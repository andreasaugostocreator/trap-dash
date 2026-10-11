// A tiny MQTT 3.1.1 client over WebSocket (QoS 0 only), used as a relay when the two browsers can't reach
// each other directly (phones on mobile data are often behind carrier NAT). Public brokers forward the messages.
const enc = new TextEncoder(), dec = new TextDecoder();
export const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) {
  const out = [type];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0);
  const a = new Uint8Array(out.length + body.length); a.set(out); a.set(body, out.length);
  return a;
}

export class Relay {
  constructor() { this.ws = null; this.onMessage = () => {}; this.onClose = () => {}; this.subs = new Set(); this.buf = new Uint8Array(0); this.pid = 1; }

  // Tries each broker in turn; resolves once connected.
  async connect(urls = BROKERS) {
    for (const url of urls) {
      try { await this.dial(url); this.url = url; return url; } catch (e) { console.warn('relay', url, e && e.message); }
    }
    throw new Error('no relay');
  }

  dial(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 6000);
      ws.onopen = () => {
        const id = 'td' + Math.random().toString(36).slice(2, 12);
        ws.send(packet(0x10, [...str('MQTT'), 4, 0x02, 0, 30, ...str(id)]));
      };
      ws.onmessage = e => {
        const b = new Uint8Array(e.data), joined = new Uint8Array(this.buf.length + b.length);
        joined.set(this.buf); joined.set(b, this.buf.length); this.buf = joined;
        this.drain(() => { clearTimeout(timer); this.ws = ws; this.ping = setInterval(() => this.raw(packet(0xc0, [])), 20000); resolve(); });
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error')); };
      ws.onclose = () => { clearTimeout(timer); clearInterval(this.ping); if (this.ws === ws) { this.ws = null; this.onClose(); } else reject(new Error('closed')); };
    });
  }

  drain(onConnack) {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let len = 0, mul = 1, i = 1, d;
      do { if (i >= b.length) return; d = b[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
      if (b.length < i + len) return;
      const type = b[0] >> 4, body = b.subarray(i, i + len);
      this.buf = b.slice(i + len);
      if (type === 2) { if (body[1] === 0) onConnack(); }
      else if (type === 3) {
        const tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl));
        const qos = (b[0] >> 1) & 3, start = 2 + tl + (qos ? 2 : 0);
        try { this.onMessage(topic, JSON.parse(dec.decode(body.subarray(start)))); } catch { /* not ours */ }
      }
    }
  }

  raw(p) { if (this.ws && this.ws.readyState === 1) this.ws.send(p); }
  subscribe(topic) { this.subs.add(topic); const id = this.pid++ & 0xffff || 1; this.raw(packet(0x82, [id >> 8, id & 255, ...str(topic), 0])); }
  publish(topic, msg) { this.raw(packet(0x30, [...str(topic), ...enc.encode(JSON.stringify(msg))])); }
  get open() { return !!(this.ws && this.ws.readyState === 1); }
  close() { clearInterval(this.ping); const ws = this.ws; this.ws = null; if (ws) { try { ws.send(packet(0xe0, [])); } catch { /* gone */ } ws.close(); } }
}
