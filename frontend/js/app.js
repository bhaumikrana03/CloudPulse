/* CloudPulse dashboard. All scheduling happens on the backend; this file renders
   the live state it streams over Socket.IO and sends admin commands over REST. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const API = window.CLOUDPULSE_API;
  const KEY = 'cp-token';

  const readToken = () => { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch (_) { return null; } };
  const signOut = () => { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (_) {} location.href = 'login.html'; };
  const token = readToken();
  if (!token) { location.replace('login.html'); return; }
  $('sign-out').addEventListener('click', (e) => { e.preventDefault(); signOut(); });

  const state = { algo: 'greedy', running: true, rate: 6, dispatched: 0, rejected: 0, history: [], servers: [] };
  const ratio = (s) => s.load / s.cap;
  const healthy = () => state.servers.filter((s) => s.status === 'healthy');

  /* ---------- Backend calls ---------- */
  async function api(path, body) {
    try {
      const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) });
      if (r.status === 401) { signOut(); return null; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Request failed.');
      return d;
    } catch (e) { toast(/failed to fetch|load failed|networkerror/i.test(e.message) ? 'Cannot reach the backend.' : e.message); return null; }
  }

  /* ---------- UI helpers ---------- */
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast align-items-center border-0'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="d-flex"><div class="toast-body"></div></div>';
    el.querySelector('.toast-body').textContent = msg;
    $('toasts').appendChild(el);
    new bootstrap.Toast(el, { delay: 2500 }).show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }
  function log(msg, warn, ts) {
    const list = $('log'); list.querySelector('.empty')?.remove();
    const li = document.createElement('li'); if (warn) li.className = 'warn';
    const t = document.createElement('time'); t.textContent = (ts ? new Date(ts) : new Date()).toLocaleTimeString([], { hour12: false });
    const m = document.createElement('span'); m.textContent = msg;
    li.append(t, m); list.prepend(li);
    while (list.children.length > 40) list.lastChild.remove();
    $('clear-log').hidden = false;
  }

  const LABEL = { healthy: 'Healthy', draining: 'Draining', down: 'Down' };
  const NOTE = { greedy: 'Greedy scans every server for the lowest utilization.', heap: 'Min-heap keeps the least-loaded server at the top, no full scan.' };
  function actionsFor(s) {
    if (s.status === 'healthy') return `<button class="btn btn-outline-secondary" data-act="drain" data-id="${s.id}">Drain</button><button class="btn btn-outline-secondary btn-danger-text" data-act="fail" data-id="${s.id}">Fail</button>`;
    return `<button class="btn btn-outline-secondary" data-act="restore" data-id="${s.id}">Restore</button>`;
  }

  function render() {
    $('server-rows').innerHTML = state.servers.map((s) => {
      const pct = Math.round(ratio(s) * 100);
      const tone = pct >= 85 ? 'hot' : pct >= 65 ? 'warm' : '';
      return `<tr><td><div class="srv-name">${s.name}</div><div class="srv-region">${s.region}</div></td>
        <td><span class="status ${s.status}">${LABEL[s.status]}</span></td>
        <td><div class="meter ${tone}" role="progressbar" aria-label="${s.name} utilization" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></td>
        <td class="text-end load-num">${s.load}/${s.cap}</td>
        <td class="text-end"><span class="row-actions">${actionsFor(s)}</span></td></tr>`;
    }).join('');

    const up = healthy();
    const util = up.length ? Math.round(up.reduce((n, s) => n + ratio(s), 0) / up.length * 100) : 0;
    $('s-active').textContent = state.servers.reduce((n, s) => n + s.active, 0); $('s-util').textContent = util + '%';
    $('s-disp').textContent = state.dispatched; $('s-rej').textContent = state.rejected;

    const p = palette();
    if (chart.data.datasets.length !== state.servers.length) {
      chart.data.datasets = state.servers.map((s, i) => ({ label: s.name, data: [], borderColor: p[i % p.length], borderWidth: 1.5, pointRadius: 0, tension: .3 }));
    }
    chart.data.labels = state.history.map((_, i) => i - state.history.length + 1);
    chart.data.datasets.forEach((d, i) => { d.data = state.history.map((h) => h[i]); });
    chart.update('none');
  }

  function applyState(s) {
    Object.assign(state, s);
    $('algo-' + state.algo).checked = true;
    $('algo-note').textContent = NOTE[state.algo];
    $('toggle-run').textContent = state.running ? 'Pause' : 'Resume';
    if (document.activeElement !== $('rate')) { $('rate').value = state.rate; $('rate-val').textContent = state.rate; }
    render();
  }

  /* ---------- Chart ---------- */
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const palette = () => [css('--cp-accent'), css('--cp-amber'), '#7a6fb0', css('--cp-danger')];
  const chart = new Chart($('chart'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } }, x: { display: false } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 2, usePointStyle: false } } },
    },
  });
  function styleChart() {
    const line = css('--cp-line'), muted = css('--cp-muted'), p = palette();
    chart.data.datasets.forEach((d, i) => { d.borderColor = p[i % p.length]; });
    chart.options.scales.y.grid = { color: line }; chart.options.scales.y.border = { display: false };
    chart.options.scales.y.ticks.color = muted; chart.options.plugins.legend.labels.color = muted;
    chart.options.font = { family: 'IBM Plex Sans' }; chart.update('none');
  }

  /* ---------- Live connection ---------- */
  let offline = false;
  const socket = io(API, { auth: { token }, reconnectionDelayMax: 5000 });
  socket.on('lb:state', applyState);
  socket.on('lb:event', (e) => log(e.message, e.warn, e.ts));
  socket.on('connect', () => { if (offline) { offline = false; toast('Reconnected to the backend.'); } });
  const lostConnection = () => { if (!offline) { offline = true; toast('Lost connection to the backend. Retrying.'); } };
  socket.on('disconnect', lostConnection);
  socket.on('connect_error', (err) => { if (err.message === 'unauthorized') signOut(); else lostConnection(); });

  /* ---------- Events ---------- */
  $('server-rows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const s = state.servers.find((x) => x.id === b.dataset.id);
    if (await api(`/api/lb/servers/${encodeURIComponent(b.dataset.id)}/${b.dataset.act}`)) {
      toast({ drain: `Draining ${s.name}`, fail: `${s.name} marked down`, restore: `Restored ${s.name}` }[b.dataset.act]);
    }
  });

  $('send').addEventListener('click', async () => {
    const count = Math.min(100, Math.max(1, +$('count').value || 1));
    const r = await api('/api/lb/dispatch', { cost: +$('cost').value, count });
    if (r) toast(r.rejected ? `${r.sent} sent, ${r.rejected} rejected` : `${r.sent} requests sent`);
  });

  let rateTimer;
  $('rate').addEventListener('input', (e) => {
    $('rate-val').textContent = e.target.value;
    clearTimeout(rateTimer); rateTimer = setTimeout(() => api('/api/lb/traffic', { rate: +e.target.value }), 250);
  });
  document.querySelectorAll('input[name="algo"]').forEach((r) => r.addEventListener('change', async (e) => {
    if (!(await api('/api/lb/algorithm', { algo: e.target.value }))) $('algo-' + state.algo).checked = true;
  }));
  $('toggle-run').addEventListener('click', () => api('/api/lb/running', { running: !state.running }));
  $('clear-log').addEventListener('click', (e) => { $('log').innerHTML = '<li class="empty">No activity yet. Send requests or fail a server to see scheduler decisions here.</li>'; e.target.hidden = true; });

  const root = document.documentElement;
  function setTheme(t) { root.setAttribute('data-bs-theme', t); $('toggle-theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; $('toggle-theme').setAttribute('aria-pressed', t === 'dark'); try { localStorage.setItem('cp-theme', t); } catch (_) {} styleChart(); }
  $('toggle-theme').addEventListener('click', () => setTheme(root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark'));
  let saved = null; try { saved = localStorage.getItem('cp-theme'); } catch (_) {}
  setTheme(saved || 'dark');
})();
