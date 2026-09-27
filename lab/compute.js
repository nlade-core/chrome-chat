// Compute lab page: Gemini Nano reasons and writes Python; Pyodide runs it in a
// locked worker (py-worker.js); plain code scores it (compute-core.js).
// Model text is only ever rendered as text.
import { CASES, PROMPT_TOOLS, PROMPT_TOOLS_STRICT, PROMPT_PLAIN, extractPython, check, looksComputable, NUDGE } from './compute-core.js';

const IO = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const $ = (id) => document.getElementById(id);
const h = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(what + ' timed out after ' + ms / 1000 + ' s')), ms))]);

// ------------------------------------------------------------------ Python

let worker = null, workerReady = null, pyInfo = null, pyReadyAt = 0, seq = 0;
const pending = new Map();
function startWorker() {
  worker = new Worker('py-worker.js', { type: 'module' });
  workerReady = new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        if (data.error) return reject(new Error(data.error));
        pyInfo = data; pyReadyAt = performance.now(); resolve(); return;
      }
      const p = pending.get(data.id); if (p) { pending.delete(data.id); p(data); }
    };
    worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
  });
  return workerReady;
}
async function runPython(code, ms = 10000) {
  if (!worker) await startWorker(); else await workerReady;
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id); worker.terminate(); worker = null; // kill runaway code; reloaded on next use
      resolve({ ok: false, out: '', err: 'Timed out after ' + ms / 1000 + ' s (worker restarted)', ms });
    }, ms);
    pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ id, code });
  });
}

// ------------------------------------------------------------------ model

async function ask(system, text, onText) {
  const s = await withTimeout(LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }], ...IO,
    monitor(m) { m.addEventListener('downloadprogress', (e) => { $('status').textContent = 'Downloading the model… ' + Math.round(e.loaded * 100) + '%'; }); } }), 120000, 'Starting the model');
  const t0 = performance.now();
  let reply = '';
  try {
    for await (const chunk of s.promptStreaming(text)) { reply += chunk; if (onText) onText(reply); }
  } catch (e) { s.destroy(); throw e; }
  return { session: s, reply, ms: Math.round(performance.now() - t0) };
}

// One question through the tools pipeline: reason -> code -> run -> (one repair) -> answer.
async function withTools(q, onText) {
  const r = { reply: '', code: null, out: null, err: null, repaired: false, modelMs: 0, pyMs: 0 };
  const { session, reply, ms } = await withTimeout(ask($('strict').checked ? PROMPT_TOOLS_STRICT : PROMPT_TOOLS, q, onText), 90000, 'The model');
  Object.assign(r, { reply, modelMs: ms });
  try {
    r.code = extractPython(reply);
    if (!r.code && $('nudge').checked && looksComputable(q)) {
      r.nudged = true;
      const t0 = performance.now();
      r.reply = reply + '\n\n[nudged: ' + NUDGE + ']\n\n' + await withTimeout(session.prompt(NUDGE), 60000, 'The nudge');
      r.modelMs += Math.round(performance.now() - t0);
      r.code = extractPython(r.reply.split('[nudged: ').pop());
    }
    if (!r.code) { r.final = r.reply; return r; }
    let run = await runPython(r.code);
    r.pyMs = run.ms;
    if (!run.ok) {
      r.err = run.err; r.repaired = true;
      const t0 = performance.now();
      const fix = await withTimeout(session.prompt('That code failed with this error:\n' + run.err + '\nReply with only a corrected ```python code block.'), 60000, 'The repair');
      r.modelMs += Math.round(performance.now() - t0);
      const code2 = extractPython(fix);
      if (code2) { r.code2 = code2; run = await runPython(code2); r.pyMs += run.ms; }
    }
    r.out = run.ok ? run.out : null;
    if (!run.ok) r.err = run.err;
    r.final = run.ok ? run.out : '';
    return r;
  } finally { try { session.destroy(); } catch {} }
}
async function plain(q) {
  const { session, reply, ms } = await withTimeout(ask(PROMPT_PLAIN, q + ' Answer briefly.'), 90000, 'The model');
  try { session.destroy(); } catch {}
  return { reply, ms };
}

// ------------------------------------------------------------------ run set

const results = new Map(); // id -> { tools: [], plain: [] }
let stop = false;
function renderRow(c) {
  const r = results.get(c.id) || { tools: [], plain: [] };
  let tr = $('row-' + c.id);
  if (!tr) {
    tr = h('tr'); tr.id = 'row-' + c.id;
    $('rows').append(tr);
  }
  tr.textContent = '';
  const t = r.tools, p = r.plain;
  const n = (arr, f) => arr.filter(f).length + '/' + arr.length;
  const cells = [c.id, c.code ? 'compute' : 'direct', c.q,
    t.length ? n(t, (x) => x.pass) : '', t.length ? n(t, (x) => !!x.code) : '', t.length ? n(t, (x) => x.repaired) : '',
    p.length ? n(p, (x) => x.pass) : '',
    t.length ? String(Math.round(t.reduce((s, x) => s + x.modelMs, 0) / t.length)) : '',
    t[0] ? (t[0].err && !t[0].out ? 'error: ' + t[0].err : (t[0].code ? t[0].out : t[0].reply)).slice(0, 80) : ''];
  cells.forEach((v, i) => {
    const td = h('td', String(v));
    if (i === 3 && t.length) td.className = t.every((x) => x.pass) ? 'ok' : t.some((x) => x.pass) ? 'mixed' : 'bad';
    if (i === 4 && t.length) td.className = (c.code ? t.every((x) => x.code) : t.every((x) => !x.code)) ? 'ok' : 'bad';
    if (i === 6 && p.length) td.className = p.every((x) => x.pass) ? 'ok' : p.some((x) => x.pass) ? 'mixed' : 'bad';
    tr.append(td);
  });
  tr.onclick = () => showDetail(c);
}
function showDetail(c) {
  const r = results.get(c.id); const box = $('detail'); box.textContent = '';
  box.append(h('h3', '#' + c.id + ' ' + c.q));
  if (!r) return;
  r.tools.forEach((x, i) => {
    box.append(h('h4', 'With tools, run ' + (i + 1) + ' — ' + (x.pass ? 'pass' : 'fail') + (x.repaired ? ' (repaired)' : '')));
    box.append(h('pre', x.reply));
    if (x.code) box.append(h('p', 'Ran:', 'muted'), h('pre', x.code2 || x.code), h('p', 'Output: ' + (x.out != null ? x.out : '(none)') + (x.err ? ' · error: ' + x.err : ''), 'muted'));
  });
  r.plain.forEach((x, i) => box.append(h('h4', 'Plain, run ' + (i + 1) + ' — ' + (x.pass ? 'pass' : 'fail')), h('pre', x.reply)));
}
function totals() {
  const all = [...results.entries()].map(([id, r]) => ({ c: CASES.find((x) => x.id === id), ...r }));
  const sum = (sel, f) => { let a = 0, b = 0; for (const x of all.filter((y) => sel(y.c))) for (const r of x.tools) { b++; if (f(r)) a++; } return a + '/' + b; };
  const sumP = (sel) => { let a = 0, b = 0; for (const x of all.filter((y) => sel(y.c))) for (const r of x.plain) { b++; if (r.pass) a++; } return a + '/' + b; };
  return {
    computeTools: sum((c) => c.code, (r) => r.pass), computePlain: sumP((c) => c.code),
    usedCodeWhenNeeded: sum((c) => c.code, (r) => !!r.code), falseTriggers: sum((c) => !c.code, (r) => !!r.code),
    directTools: sum((c) => !c.code, (r) => r.pass), directPlain: sumP((c) => !c.code),
    repaired: sum(() => true, (r) => r.repaired),
  };
}
function renderTotals() {
  const t = totals();
  $('totals').textContent = 'Compute questions — with tools ' + t.computeTools + ', plain ' + t.computePlain + ' · used code when needed ' + t.usedCodeWhenNeeded
    + ' · near-misses — false triggers ' + t.falseTriggers + ', right with tools ' + t.directTools + ', plain ' + t.directPlain + ' · repairs ' + t.repaired;
}

async function runCases(list) {
  stop = false;
  $('run-all').disabled = $('run-one').disabled = true; $('stop').disabled = false;
  const runs = Number($('runs').value), doPlain = $('do-plain').checked;
  try {
    if (!worker) { $('status').textContent = 'Loading Python (first time: ~12 MB)…'; const t0 = performance.now(); await startWorker(); $('py').textContent = 'Python ' + pyInfo.version + ' ready in ' + Math.round(performance.now() - t0) + ' ms'; }
    for (const c of list) {
      if (stop) break;
      if (!results.has(c.id)) results.set(c.id, { tools: [], plain: [] });
      const r = results.get(c.id);
      for (let i = 0; i < runs && !stop; i++) {
        $('status').textContent = '#' + c.id + ' run ' + (i + 1) + '/' + runs + ': asking the model…';
        try {
          const x = await withTools(c.q, (txt) => { $('status').textContent = '#' + c.id + ': ' + txt.slice(-90).replace(/\s+/g, ' '); });
          x.pass = check(c, x.final); r.tools.push(x);
        } catch (e) { r.tools.push({ pass: false, reply: '', err: e.message, modelMs: 0, code: null }); }
        if (doPlain) {
          try { const x = await plain(c.q); x.pass = check(c, x.reply); r.plain.push(x); }
          catch (e) { r.plain.push({ pass: false, reply: 'error: ' + e.message }); }
        }
        renderRow(c); renderTotals(); paintNet();
      }
    }
    $('status').textContent = stop ? 'Stopped.' : 'Done. Click a row for the full replies and code; Copy results to report back.';
  } catch (e) {
    $('status').textContent = 'Error: ' + e.message;
  } finally {
    $('run-all').disabled = $('run-one').disabled = false; $('stop').disabled = true;
  }
}

// ------------------------------------------------------------------ report

function report() {
  const t = totals();
  const lines = ['compute-lab results · ' + new Date().toISOString().slice(0, 16) + ' · ' + (navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version).join(', ') : navigator.userAgent),
    'Tool prompt: ' + ($('strict').checked ? 'strict' : 'lenient') + ' · nudge: ' + ($('nudge').checked ? 'on' : 'off') + ' · runs each: ' + $('runs').value + ' · Python ' + (pyInfo ? pyInfo.version + ', loaded in ' + pyInfo.ms + ' ms' : 'not loaded') + ' · requests after Python loaded: ' + netCount(),
    'TOTALS ' + JSON.stringify(t), '',
    'id | kind | with tools pass | used code | repaired | plain pass | model ms | first output'];
  for (const c of CASES) {
    const r = results.get(c.id); if (!r) continue;
    const n = (arr, f) => arr.filter(f).length + '/' + arr.length;
    const f = r.tools[0] || {};
    lines.push([c.id, c.code ? 'compute' : 'direct', n(r.tools, (x) => x.pass), n(r.tools, (x) => !!x.code), n(r.tools, (x) => x.repaired), n(r.plain, (x) => x.pass),
      r.tools.length ? Math.round(r.tools.reduce((s, x) => s + x.modelMs, 0) / r.tools.length) : '', JSON.stringify(((f.code ? f.out : f.reply) || f.err || '').slice(0, 60))].join(' | '));
  }
  lines.push('', 'FAILURES (reply, code, output)');
  for (const c of CASES) {
    const r = results.get(c.id); if (!r) continue;
    r.tools.forEach((x, i) => { if (!x.pass) lines.push('#' + c.id + ' tools run ' + (i + 1) + ': reply=' + JSON.stringify((x.reply || '').slice(0, 400)) + ' code=' + JSON.stringify(x.code2 || x.code || null) + ' out=' + JSON.stringify(x.out) + (x.err ? ' err=' + JSON.stringify(x.err) : '')); });
    r.plain.forEach((x, i) => { if (!x.pass) lines.push('#' + c.id + ' plain run ' + (i + 1) + ': ' + JSON.stringify((x.reply || '').slice(0, 200))); });
  }
  return lines.join('\n');
}

// Requests the page makes after Python has loaded -- should stay 0: the model
// is on-device and the code can't reach the network.
const netCount = () => pyReadyAt ? performance.getEntriesByType('resource').filter((e) => e.startTime > pyReadyAt).length : 0;
const paintNet = () => { $('net').textContent = pyReadyAt ? 'Requests since Python loaded: ' + netCount() : ''; };

// ------------------------------------------------------------------ wire up

for (const c of CASES) {
  const o = h('option', '#' + c.id + ' ' + c.q); o.value = c.id; $('pick').append(o);
  renderRow(c);
}
$('run-all').onclick = () => runCases(CASES);
$('run-one').onclick = () => runCases(CASES.filter((c) => c.id === Number($('pick').value)));
$('stop').onclick = () => { stop = true; };
$('copy').onclick = async (e) => { try { await navigator.clipboard.writeText(report()); e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy results'), 1500); } catch { $('report').hidden = false; $('report').value = report(); } };
$('free-go').onclick = async () => {
  const q = $('free-q').value.trim(); if (!q) return;
  const box = $('free-out'); box.textContent = '';
  const live = h('pre', '…'); box.append(live);
  try {
    if (!worker) { $('status').textContent = 'Loading Python…'; await startWorker(); $('py').textContent = 'Python ' + pyInfo.version + ' ready in ' + pyInfo.ms + ' ms'; }
    const x = await withTools(q, (t) => { live.textContent = t; });
    if (x.code) box.append(h('p', 'Ran:', 'muted'), h('pre', x.code2 || x.code), h('p', x.out != null ? 'Output: ' + x.out : 'Error: ' + x.err, x.out != null ? 'ok' : 'bad'));
    $('status').textContent = 'model ' + x.modelMs + ' ms' + (x.code ? ', python ' + x.pyMs + ' ms' : ', no code');
  } catch (e) { box.append(h('p', 'Error: ' + e.message, 'bad')); }
  paintNet();
};
(async () => {
  let a = 'unavailable';
  try { a = self.LanguageModel ? await LanguageModel.availability(IO) : 'unavailable'; } catch {}
  $('model').textContent = { available: 'Model ready', downloadable: 'Model will download on first run (a few GB, once)', downloading: 'Model downloading…', unavailable: 'No on-device model in this browser — needs desktop Chrome with built-in AI' }[a] || a;
  if (a === 'unavailable') $('run-all').disabled = $('run-one').disabled = $('free-go').disabled = true;
})();
