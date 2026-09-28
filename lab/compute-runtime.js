// The compute path's in-page runtime, shared by the lab (lab/compute.js) and the
// chat (index.html): the Python worker (py-worker.js, Pyodide, network removed),
// Gemini Nano calls with real cancellation, and the typed pipeline from
// compute-core.js wired to both. What the lab measures is what the chat ships.
import { typedAnswer } from './compute-core.js';

export const IO = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
let MODEL_MS = 45000;
export const setModelTimeout = (ms) => { MODEL_MS = ms; };

// ------------------------------------------------------------------ Python

export const py = { info: null, readyAt: 0 };
let worker = null, workerReady = null, seq = 0;
const pending = new Map();
// Loads Pyodide (~12 MB from jsDelivr, cached after) in a module worker. Safe to
// call early and often -- the chat warms it while a sum is being typed.
export function startPython() {
  if (worker && workerReady) return workerReady;
  worker = new Worker(new URL('./py-worker.js', import.meta.url), { type: 'module' });
  workerReady = new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        if (data.error) return reject(new Error(data.error));
        py.info = data; py.readyAt = performance.now(); resolve(); return;
      }
      const p = pending.get(data.id); if (p) { pending.delete(data.id); p(data); }
    };
    worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
  });
  workerReady.catch(() => { worker = null; workerReady = null; });
  return workerReady;
}
export async function runPython(code, ms = 10000) {
  await startPython();
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id); worker.terminate(); worker = null; workerReady = null; // kill runaway code; reloaded on next use
      resolve({ ok: false, out: '', err: 'Timed out after ' + ms / 1000 + ' s (worker restarted)', ms });
    }, ms);
    pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ id, code });
  });
}

// ------------------------------------------------------------------ model
// Every call is really cancelled on timeout (AbortController + destroying the
// session) and waiting stops then even if a call ignores the signal -- a timeout
// that only stopped waiting once left a call running and the rest queued behind it.

function limit(label) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(label + ' timed out after ' + MODEL_MS / 1000 + ' s')), MODEL_MS);
  const gaveUp = new Promise((_, reject) => ctl.signal.addEventListener('abort', () => reject(ctl.signal.reason)));
  gaveUp.catch(() => {});
  return { ctl, gaveUp, done: () => clearTimeout(timer), why: (e) => (ctl.signal.aborted && ctl.signal.reason instanceof Error ? ctl.signal.reason : e) };
}
export async function ask(system, text, onText, { onDownload } = {}) {
  const L = limit('The model');
  let s;
  try {
    s = await Promise.race([L.gaveUp, LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }], ...IO, signal: L.ctl.signal,
      monitor(m) { m.addEventListener('downloadprogress', (e) => onDownload && onDownload(e.loaded)); } })]);
    const t0 = performance.now();
    let reply = '';
    await Promise.race([L.gaveUp, (async () => { for await (const chunk of s.promptStreaming(text, { signal: L.ctl.signal })) { reply += chunk; if (onText) onText(reply); } })()]);
    return { session: s, reply, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    try { s && s.destroy(); } catch {}
    throw L.why(e);
  } finally { L.done(); }
}
// A follow-up turn (nudge, repair, next step) on the same session.
export async function followUp(session, text) {
  const L = limit('The model');
  try { return await Promise.race([L.gaveUp, session.prompt(text, { signal: L.ctl.signal })]); }
  catch (e) { throw L.why(e); }
  finally { L.done(); }
}
// A throwaway one-shot call (rewrite, write-up); JSON forced where supported.
export async function oneShot(system, text, schema) {
  const L = limit('The model');
  let s;
  try {
    s = await Promise.race([L.gaveUp, LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }], ...IO, signal: L.ctl.signal })]);
    if (!schema) return await Promise.race([L.gaveUp, s.prompt(text, { signal: L.ctl.signal })]);
    try { return await Promise.race([L.gaveUp, s.prompt(text, { responseConstraint: schema, signal: L.ctl.signal })]); }
    catch (e) { if (L.ctl.signal.aborted) throw L.why(e); return await Promise.race([L.gaveUp, s.prompt(text + '\nReply with only the JSON.', { signal: L.ctl.signal })]); }
  } finally { L.done(); try { s && s.destroy(); } catch {} }
}

// ------------------------------------------------------------------ the pipeline

// One question through the typed pipeline. onStage(text) reports progress
// ("Running Python…"); onResult(value) fires as soon as the checked value exists,
// before the write-up -- so the chat can show the number first.
export async function computeAnswer(q, { resolve = false, writeUp = true, force = false, onText, onStage, onResult, onDownload } = {}) {
  let session = null, modelMs = 0, pyMs = 0, writeupMs = 0;
  const stage = (s) => { if (onStage) onStage(s); };
  const timed = async (p) => { const t0 = performance.now(); try { return await p; } finally { modelMs += Math.round(performance.now() - t0); } };
  try {
    stage('Working it out…');
    const r = await typedAnswer(q, {
      first: async (system, text) => { const a = await ask(system, text, onText, { onDownload }); session = a.session; modelMs += a.ms; return a.reply; },
      resolve: (system, text, schema) => timed(oneShot(system, text, schema)),
      writeup: async (system, text) => { stage('Writing the answer…'); const t0 = performance.now(); try { return await oneShot(system, text); } finally { writeupMs += Math.round(performance.now() - t0); } },
      again: (text) => { stage('Checking the working…'); return timed(followUp(session, text)); },
      py: async (code) => { stage(py.info ? 'Running Python…' : 'Loading Python (one-off download, ~12 MB)…'); const x = await runPython(code); pyMs += x.ms || 0; return x; },
    }, { resolve, writeUp, onResult, force });
    return Object.assign(r, { modelMs, pyMs, writeupMs });
  } finally { try { session && session.destroy(); } catch {} }
}
