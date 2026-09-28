// Compute lab page: Gemini Nano reasons and writes Python; Pyodide runs it in a
// locked worker (py-worker.js); plain code scores it (compute-core.js).
// Model text is only ever rendered as text.
import { CASES, PROMPT_TOOLS, PROMPT_TOOLS_STRICT, PROMPT_PLAIN, extractPython, check, looksComputable, NUDGE } from './compute-core.js';
import { BASELINE } from './baseline.js';
import { IO, py, startPython, runPython, ask as askRaw, followUp, computeAnswer, setModelTimeout } from './compute-runtime.js';

const $ = (id) => document.getElementById(id);
const h = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(what + ' timed out after ' + ms / 1000 + ' s')), ms))]);

// The runtime (worker, model calls, pipeline) is shared with the chat -- see compute-runtime.js.
setModelTimeout(Number(new URLSearchParams(location.search).get('modelms')) || 45000); // ?modelms= for testing
const onDownload = (p) => { $('status').textContent = 'Downloading the model… ' + Math.round(p * 100) + '%'; };
const ask = (system, text, onText) => askRaw(system, text, onText, { onDownload });
const withTyped = (q, onText) => computeAnswer(q, { resolve: $('resolve').checked, writeUp: $('writeup').checked, onText, onDownload });

// One question through the tools pipeline: reason -> code -> run -> (one repair) -> answer.
async function withTools(q, onText) {
  if ($('typed').checked) return withTyped(q, onText);
  const r = { reply: '', code: null, out: null, err: null, repaired: false, modelMs: 0, pyMs: 0 };
  const { session, reply, ms } = await ask($('strict').checked ? PROMPT_TOOLS_STRICT : PROMPT_TOOLS, q, onText);
  Object.assign(r, { reply, modelMs: ms });
  try {
    r.code = extractPython(reply);
    if (!r.code && $('nudge').checked && looksComputable(q)) {
      r.nudged = true;
      const t0 = performance.now();
      r.reply = reply + '\n\n[nudged: ' + NUDGE + ']\n\n' + await followUp(session, NUDGE);
      r.modelMs += Math.round(performance.now() - t0);
      r.code = extractPython(r.reply.split('[nudged: ').pop());
    }
    if (!r.code) { r.final = r.reply; return r; }
    let run = await runPython(r.code);
    r.pyMs = run.ms;
    if (!run.ok) {
      r.err = run.err; r.repaired = true;
      const t0 = performance.now();
      const fix = await followUp(session, 'That code failed with this error:\n' + run.err + '\nReply with only a corrected ```python code block.');
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
  const { session, reply, ms } = await ask(PROMPT_PLAIN, q + ' Answer briefly.');
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
  const errs = t.filter((x) => x.failed).length;
  const cells = [c.id, c.code ? 'compute' : 'direct', c.q + (errs ? '  [' + errs + ' model error' + (errs > 1 ? 's' : '') + ']' : ''),
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
    if (x.normalised) box.append(h('p', 'Read as (plain code): ' + x.normalised, 'muted'));
    (x.steps || []).forEach((st, k) => box.append(h('p', 'Step ' + (k + 1) + ' printed:', 'muted'), h('pre', st.code + '\n→ ' + st.out)));
    if (x.writeup) box.append(h('p', 'Answer: ' + x.writeup + '  (write-up checked: the result appears unchanged)', 'ok'));
    if (x.writeupProblem) box.append(h('p', 'Write-up rejected (' + x.writeupProblem + '): ' + (x.writeupRejected || ''), 'bad'));
    if (x.resolved) box.append(h('p', 'Read as: ' + x.resolved.question + (x.resolved.assumptions.length ? ' · assuming ' + x.resolved.assumptions.join('; ') : '') + (x.resolved.used ? '' : ' (original kept: ' + (x.resolved.reason || 'unchanged') + ')'), 'muted'));
    if (x.typed && x.code) box.append(h('p', 'Type: ' + x.type + ' (inferred ' + (x.inferred || '–') + ', declared ' + (x.declared || '–') + ')' + (x.typeMismatch ? ' — MISMATCH' : '') + (x.problems.length ? ' · rejected: ' + x.problems.join(' | ') : ''), 'muted'));
  });
  r.plain.forEach((x, i) => box.append(h('h4', 'Plain, run ' + (i + 1) + ' — ' + (x.pass ? 'pass' : 'fail')), h('pre', x.reply)));
}
function totals() {
  const all = [...results.entries()].map(([id, r]) => ({ c: CASES.find((x) => x.id === id), ...r })).filter((x) => inSet().includes(x.c));
  const sum = (sel, f) => { let a = 0, b = 0; for (const x of all.filter((y) => sel(y.c))) for (const r of x.tools) { b++; if (f(r)) a++; } return a + '/' + b; };
  const sumP = (sel) => { let a = 0, b = 0; for (const x of all.filter((y) => sel(y.c))) for (const r of x.plain) { b++; if (r.pass) a++; } return a + '/' + b; };
  return {
    computeTools: sum((c) => c.code, (r) => r.pass), computePlain: sumP((c) => c.code),
    usedCodeWhenNeeded: sum((c) => c.code, (r) => !!r.code), falseTriggers: sum((c) => !c.code, (r) => !!r.code),
    directTools: sum((c) => !c.code, (r) => r.pass), directPlain: sumP((c) => !c.code),
    repaired: sum(() => true, (r) => r.repaired),
    writeupsKept: sum(() => true, (r) => !!r.writeup) + ' (rejected ' + sum(() => true, (r) => !!r.writeupProblem) + ')',
    multiStep: sum(() => true, (r) => r.steps && r.steps.length > 0),
    avgMs: (() => { const t = all.flatMap((x) => x.tools).filter((r) => r.modelMs); return t.length ? Math.round(t.reduce((a, r) => a + r.modelMs + (r.writeupMs || 0), 0) / t.length) : 0; })(),
    avgWriteupMs: (() => { const t = all.flatMap((x) => x.tools).filter((r) => r.writeupMs); return t.length ? Math.round(t.reduce((a, r) => a + r.writeupMs, 0) / t.length) : 0; })(),
  };
}
function renderTotals() {
  const t = totals();
  $('totals').textContent = 'Compute questions — with tools ' + t.computeTools + ', plain ' + t.computePlain + ' · used code when needed ' + t.usedCodeWhenNeeded
    + ' · near-misses — false triggers ' + t.falseTriggers + ', right with tools ' + t.directTools + ', plain ' + t.directPlain + ' · repairs ' + t.repaired;
}

async function runCases(list, resume = false) {
  stop = false;
  $('run-all').disabled = $('run-one').disabled = $('resume').disabled = true; $('stop').disabled = false;
  const runs = Number($('runs').value), doPlain = $('do-plain').checked;
  try {
    if (!py.info) { $('status').textContent = 'Loading Python (first time: ~12 MB)…'; const t0 = performance.now(); await startPython(); $('py').textContent = 'Python ' + py.info.version + ' ready in ' + Math.round(performance.now() - t0) + ' ms'; }
    for (const c of list) {
      if (stop) break;
      if (!results.has(c.id)) results.set(c.id, { tools: [], plain: [] });
      const r = results.get(c.id);
      for (let i = resume ? r.tools.length : 0; i < runs && !stop; i++) {
        $('status').textContent = '#' + c.id + ' run ' + (i + 1) + '/' + runs + ': asking the model…';
        try {
          const x = await withTools(c.q, (txt) => { $('status').textContent = '#' + c.id + ': ' + txt.slice(-90).replace(/\s+/g, ' '); });
          x.pass = check(c, x.final); r.tools.push(x);
        } catch (e) { r.tools.push({ pass: false, reply: '', err: e.message, modelMs: 0, code: null, failed: true }); }
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
    $('run-all').disabled = $('run-one').disabled = $('resume').disabled = false; $('stop').disabled = true;
  }
}

// ------------------------------------------------------------------ report

function report() {
  const t = totals();
  const lines = ['compute-lab results · ' + new Date().toISOString().slice(0, 16) + ' · ' + (navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand + ' ' + b.version).join(', ') : navigator.userAgent),
    'Mode: ' + ($('typed').checked ? 'TYPED' : 'plain code') + ' · model rewrite: ' + ($('resolve').checked ? 'on' : 'off') + ' · write-up: ' + ($('writeup').checked ? 'on' : 'off') + ' · tool prompt: ' + ($('strict').checked ? 'strict' : 'lenient') + ' · nudge: ' + ($('nudge').checked ? 'on' : 'off') + ' · runs each: ' + $('runs').value + ' · question set: ' + $('set').value + ' · Python ' + (py.info ? py.info.version + ', loaded in ' + py.info.ms + ' ms' : 'not loaded') + ' · requests after Python loaded: ' + netCount(),
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
    r.tools.forEach((x, i) => { if (!x.pass || x.repaired || x.typeMismatch || (x.resolved && x.resolved.used) || x.writeupProblem || (x.steps && x.steps.length) || x.normalised) lines.push('#' + c.id + ' tools run ' + (i + 1) + (x.pass ? ' (passed)' : '') + ': reply=' + JSON.stringify((x.reply || '').slice(0, 400)) + ' code=' + JSON.stringify(x.code2 || x.code || null) + ' out=' + JSON.stringify(x.out) + (x.err ? ' err=' + JSON.stringify(x.err) : '') + (x.resolved ? ' readAs=' + JSON.stringify(x.resolved.question) + (x.resolved.used ? '' : ' (kept original: ' + (x.resolved.reason || 'unchanged') + ')' + (x.resolved.rewrite ? ' rejectedRewrite=' + JSON.stringify(x.resolved.rewrite) : x.resolved.raw ? ' rawRewrite=' + JSON.stringify(String(x.resolved.raw).slice(0, 200)) : '')) + (x.resolved.assumptions.length ? ' assumptions=' + JSON.stringify(x.resolved.assumptions) : '') : '') + (x.normalised ? ' normalised=' + JSON.stringify(x.normalised) : '') + (x.steps && x.steps.length ? ' steps=' + JSON.stringify(x.steps) : '') + (x.writeup ? ' writeup=' + JSON.stringify(x.writeup) : '') + (x.writeupProblem ? ' writeupRejected=' + JSON.stringify(x.writeupProblem + ' :: ' + (x.writeupRejected || '')) : '') + (x.typed ? ' type=' + x.type + ' inferred=' + x.inferred + ' declared=' + x.declared + (x.problems.length ? ' rejected=' + JSON.stringify(x.problems) : '') : '')); });
    r.plain.forEach((x, i) => { if (!x.pass) lines.push('#' + c.id + ' plain run ' + (i + 1) + ': ' + JSON.stringify((x.reply || '').slice(0, 200))); });
  }
  if ($('set').value === 'regress') lines.push('', ...regression());
  return lines.join('\n');
}

// After a Chrome update: this run vs the recorded Nano baseline (lab/baseline.js).
function regression() {
  const chrome = navigator.userAgentData ? (navigator.userAgentData.brands.find((b) => /Chrome/.test(b.brand)) || {}).version : navigator.userAgent;
  const now = { chrome, date: new Date().toISOString().slice(0, 10), tools: {}, plain: {} };
  for (const c of CASES.filter((x) => x.held)) {
    const r = results.get(c.id); if (!r) continue;
    now.tools[c.id] = r.tools.filter((x) => x.pass).length; now.plain[c.id] = r.plain.filter((x) => x.pass).length;
  }
  const out = ['REGRESSION_JSON ' + JSON.stringify(now)];
  if (!BASELINE) return [...out, 'No baseline recorded yet: this run can become it (lab/baseline.js).'];
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  out.push('VS BASELINE (Chrome ' + BASELINE.chrome + ', ' + BASELINE.date + '): with tools ' + sum(now.tools) + ' now vs ' + sum(BASELINE.tools) + '; plain ' + sum(now.plain) + ' vs ' + sum(BASELINE.plain));
  const moved = Object.keys(now.tools).filter((id) => BASELINE.tools[id] != null && Math.abs(now.tools[id] - BASELINE.tools[id]) >= 2);
  out.push(moved.length ? 'Moved by 2+ passes: ' + moved.map((id) => '#' + id + ' ' + BASELINE.tools[id] + '→' + now.tools[id]).join(', ') : 'No question moved by 2 or more passes.');
  return out;
}

// Requests the page makes after Python has loaded -- should stay 0: the model
// is on-device and the code can't reach the network.
const netCount = () => py.readyAt ? performance.getEntriesByType('resource').filter((e) => e.startTime > py.readyAt).length : 0;
const paintNet = () => { $('net').textContent = py.readyAt ? 'Requests since Python loaded: ' + netCount() : ''; };

// ------------------------------------------------------------------ wire up

for (const c of CASES) {
  const o = h('option', '#' + c.id + ' ' + c.q); o.value = c.id; $('pick').append(o);
  renderRow(c);
}
const inSet = () => CASES.filter((c) => $('set').value === 'all' || $('set').value === c.set || ($('set').value === 'regress' && !!c.held));
$('run-all').onclick = () => runCases(inSet());
$('resume').onclick = () => runCases(inSet(), true);
$('run-one').onclick = () => runCases(CASES.filter((c) => c.id === Number($('pick').value)));
$('stop').onclick = () => { stop = true; };
$('copy').onclick = async (e) => { try { await navigator.clipboard.writeText(report()); e.target.textContent = 'Copied'; setTimeout(() => (e.target.textContent = 'Copy results'), 1500); } catch { $('report').hidden = false; $('report').value = report(); } };
$('free-go').onclick = async () => {
  const q = $('free-q').value.trim(); if (!q) return;
  const box = $('free-out'); box.textContent = '';
  const live = h('pre', '…'); box.append(live);
  try {
    if (!py.info) { $('status').textContent = 'Loading Python…'; await startPython(); $('py').textContent = 'Python ' + py.info.version + ' ready in ' + py.info.ms + ' ms'; }
    const x = await withTools(q, (t) => { live.textContent = t; });
    if (x.writeup) box.prepend(h('p', x.writeup, 'ok'));
    else if (x.out != null) box.prepend(h('p', 'Result: ' + x.out + (x.writeupProblem ? '  (write-up rejected: ' + x.writeupProblem + ')' : ''), 'ok'));
    if (x.normalised) box.prepend(h('p', 'Read as: ' + x.normalised, 'muted'));
    (x.steps || []).forEach((st, k) => box.append(h('p', 'Step ' + (k + 1) + ':', 'muted'), h('pre', st.code + '\n→ ' + st.out)));
    if (x.resolved) box.prepend(h('p', 'Read as: ' + x.resolved.question + (x.resolved.assumptions.length ? ' · assuming ' + x.resolved.assumptions.join('; ') : ''), 'muted'));
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
