/* Real scheduling engine behind the dashboard: Greedy scan and Min-heap, with
   capacity limits, drain / fail / restore, and a once-per-second tick. */
const HISTORY = 40;
const ALGOS = { greedy: 'Greedy', heap: 'Min-heap' };

class MinHeap {
  constructor(key) { this.a = []; this.key = key; }
  push(x) {
    const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.key(a[i]) >= this.key(a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a; if (!a.length) return null;
    const top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        let m = i; const l = 2 * i + 1, r = l + 1;
        if (l < a.length && this.key(a[l]) < this.key(a[m])) m = l;
        if (r < a.length && this.key(a[r]) < this.key(a[m])) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const int = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
};
const ratio = (s) => s.load / s.cap;

class LoadBalancer {
  constructor(registry, hooks = {}) {
    this.servers = registry.map((s) => ({ id: s.id, name: s.name, region: s.region, cap: s.cap, load: 0, status: 'healthy', jobs: [] }));
    this.algo = 'greedy'; this.running = true; this.rate = 6;
    this.dispatched = 0; this.rejected = 0; this.history = [];
    this.onState = hooks.onState || (() => {}); this.onEvent = hooks.onEvent || (() => {});
    this.timer = null; this.rebuildHeap();
  }

  start(ms = 1000) { if (!this.timer) { this.timer = setInterval(() => { if (this.running) this.tick(); }, ms); this.timer.unref?.(); } }
  stop() { clearInterval(this.timer); this.timer = null; }

  healthy() { return this.servers.filter((s) => s.status === 'healthy'); }
  rebuildHeap() { this.heap = new MinHeap(ratio); this.healthy().forEach((s) => this.heap.push(s)); }
  event(message, warn = false) { this.onEvent({ ts: new Date().toISOString(), message, warn }); }

  pick() {
    if (this.algo === 'greedy') return this.healthy().reduce((best, s) => (!best || ratio(s) < ratio(best) ? s : best), null);
    return this.heap.pop();
  }

  place(cost) {
    const s = this.pick();
    if (!s || s.load + cost > s.cap) { if (s && this.algo === 'heap') this.heap.push(s); this.rejected++; return null; }
    s.load += cost; s.jobs.push({ cost, left: 3 + Math.floor(Math.random() * 6) });
    this.dispatched++;
    if (this.algo === 'heap') this.heap.push(s);
    return s;
  }

  tick() {
    for (const s of this.servers) {
      s.jobs.forEach((j) => j.left--);
      const done = s.jobs.filter((j) => j.left <= 0);
      s.jobs = s.jobs.filter((j) => j.left > 0);
      s.load -= done.reduce((n, j) => n + j.cost, 0);
    }
    this.rebuildHeap();
    const n = Math.round(this.rate * (0.7 + Math.random() * 0.6));
    for (let i = 0; i < n; i++) this.place(1 + Math.floor(Math.random() * 2));
    this.history.push(this.servers.map((s) => Math.round(ratio(s) * 100)));
    if (this.history.length > HISTORY) this.history.shift();
    this.emitState();
  }

  snapshot() {
    return {
      algo: this.algo, running: this.running, rate: this.rate, dispatched: this.dispatched, rejected: this.rejected,
      servers: this.servers.map((s) => ({ id: s.id, name: s.name, region: s.region, cap: s.cap, load: s.load, status: s.status, active: s.jobs.length })),
      history: this.history,
    };
  }
  emitState() { this.onState(this.snapshot()); }

  dispatchBatch(count, cost) {
    count = int(count, 1, 100, 'count'); cost = int(cost, 1, 8, 'size');
    const placed = {}; let rej = 0;
    for (let i = 0; i < count; i++) { const s = this.place(cost); s ? (placed[s.name] = (placed[s.name] || 0) + 1) : rej++; }
    const parts = Object.entries(placed).map(([k, v]) => `${v} to ${k}`);
    this.event(`${ALGOS[this.algo]}: ${parts.join(', ') || 'none placed'}${rej ? `; ${rej} rejected, no capacity` : ''}.`, rej > 0);
    this.emitState();
    return { sent: count - rej, rejected: rej, placed };
  }

  setAlgo(algo) {
    if (!ALGOS[algo]) throw bad('algo must be "greedy" or "heap".');
    this.algo = algo; this.rebuildHeap();
    this.event(`Scheduler switched to ${ALGOS[algo]}.`); this.emitState();
    return this.snapshot();
  }
  setRate(rate) { this.rate = int(rate, 0, 20, 'rate'); this.emitState(); return this.snapshot(); }
  setRunning(running) { this.running = Boolean(running); this.emitState(); return this.snapshot(); }

  control(id, action) {
    const s = this.servers.find((x) => x.id === id);
    if (!s) throw bad('Unknown server.', 404);
    if (action === 'drain') { s.status = 'draining'; this.event(`${s.name} is draining. It accepts no new requests.`); }
    else if (action === 'fail') { const lost = s.jobs.length; s.status = 'down'; s.jobs = []; s.load = 0; this.event(`${s.name} failed. ${lost} in-flight requests dropped.`, true); }
    else if (action === 'restore') { s.status = 'healthy'; this.event(`${s.name} restored and back in rotation.`); }
    else throw bad('action must be drain, fail or restore.');
    this.rebuildHeap(); this.emitState();
    return this.snapshot();
  }
}

module.exports = { LoadBalancer, MinHeap };
