// Runs model-written Python (Pyodide) off the page's main thread. Once Python
// has loaded, the worker's network APIs are removed -- own properties and the
// prototypes they're inherited from -- so code can print but can't phone out.
// The worker has no DOM, no page storage and no access to the chat. The page
// kills it on a timeout. (A lab-grade lock: the production version would also
// sit behind a CSP with connect-src 'none'.)
// A module worker: headless Chrome 154 refused importScripts() of the classic
// pyodide.js from the CDN ("failed to load") while fetch() of the same URL
// worked, so the module build is imported instead.
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

const ready = (async () => {
  const t0 = performance.now();
  const py = await loadPyodide({ indexURL: PYODIDE });
  const NET = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'WebTransport'];
  for (const obj of [self, Object.getPrototypeOf(self), typeof WorkerGlobalScope !== 'undefined' && WorkerGlobalScope.prototype]) {
    if (!obj) continue;
    for (const k of NET) { try { delete obj[k]; } catch {} try { Object.defineProperty(obj, k, { value: undefined, configurable: false, writable: false }); } catch {} }
  }
  postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), version: py.version });
  return py;
})();
ready.catch((e) => postMessage({ type: 'ready', error: String(e && e.message || e) }));

onmessage = async ({ data: { id, code } }) => {
  const py = await ready;
  let out = '';
  py.setStdout({ batched: (s) => { out += s + '\n'; } });
  py.setStderr({ batched: (s) => { out += s + '\n'; } });
  const t0 = performance.now();
  try {
    // Fresh globals per run, so one answer can't leak into the next.
    await py.runPythonAsync(code, { globals: py.globals.get('dict')() });
    postMessage({ id, ok: true, out: out.trim(), ms: Math.round(performance.now() - t0) });
  } catch (e) {
    const err = String(e && e.message || e).trim().split('\n').slice(-3).join('\n');
    postMessage({ id, ok: false, out: out.trim(), err, ms: Math.round(performance.now() - t0) });
  }
};
