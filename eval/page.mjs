// Loads chrome-chat's own Wikipedia functions straight out of index.html --
// the shipped code, not a copy -- with Chrome's two on-device models swapped
// for local stand-ins via Ollama:
//   LanguageModel (Gemini Nano)  -> a small open Gemma model, same default
//                                   sampling Chrome reports for Nano
//                                   (temperature 1, topK 3), and
//                                   responseConstraint passed through as
//                                   Ollama's JSON-schema `format`.
//   Translator (separate model)  -> the same Gemma model, prompted to translate.
// Stand-ins are for fast iteration, not ground truth: calibrate against real
// Chrome with the same cases before trusting a difference they show.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';

// think:false -- Gemini Nano in Chrome has no hidden reasoning step, but
// thinking-capable Gemma builds default to one: measured ~1,300 hidden
// characters and 6-7s per section pick with it on, ~0.1s with it off, same
// answer. Models without a thinking mode reject the flag, so retry without.
const noThinkUnsupported = new Set();
export async function ollamaChat(model, messages, format) {
  const body = { model, messages, stream: false, ...(format ? { format } : {}), options: { temperature: 1, top_k: 3 } };
  let res = await fetch(OLLAMA + '/api/chat', { method: 'POST', body: JSON.stringify(noThinkUnsupported.has(model) ? body : { ...body, think: false }) });
  if (!res.ok && !noThinkUnsupported.has(model) && /think/i.test(await res.clone().text())) {
    noThinkUnsupported.add(model);
    res = await fetch(OLLAMA + '/api/chat', { method: 'POST', body: JSON.stringify(body) });
  }
  if (!res.ok) throw new Error('ollama HTTP ' + res.status + ': ' + (await res.text()));
  return (await res.json()).message.content;
}

// constrain=false drops responseConstraint in the stand-in: Ollama's
// grammar-constrained decoding is intermittently 5-20s on these models,
// which is an Ollama cost, not the model's judgement -- this separates the two.
export async function loadPage(model, { constrain = true } = {}) {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  const cut = (from, to) => {
    let a = html.indexOf(from);
    if (a < 0) throw new Error('marker not found: ' + from);
    a = html.lastIndexOf('\n', a) + 1;
    const b = html.indexOf(to, a + 5);
    if (b < 0) throw new Error('marker not found: ' + to);
    return html.slice(a, b);
  };
  const code = [
    cut('const WIKIMEDIA_HEADERS', '    // Wikipedia text is CC'),
    cut('    function wikiRevisionMeta', '    const URL_SOURCES'),
    cut('    //\n    // /wiki full <topic>', '    async function resolveFollowupSections'),
    cut('    function urlContextPreamble', '    function buildInitialPrompts'),
  ].join('\n');
  const exported = ['parseWikiCommand', 'detectLang', 'resolveWikiCandidates', 'fetchCounterpart', 'buildComparison', 'getArticleSections',
    'openArticle', 'pickFollowupSections', 'modelPickSection', 'modelFacingText', 'urlContextPreamble', 'formatFullArticle', 'fetchFullArticleText'];
  const dir = mkdtempSync(join(tmpdir(), 'chrome-chat-eval-'));
  const file = join(dir, 'page.mjs');
  writeFileSync(file, [
    'const _f = globalThis.fetch;',
    // Wikimedia throttles Node's default User-Agent; a browser never hits this.
    'const fetch = (u, o = {}) => _f(u, { ...o, headers: { ...(o.headers || {}), "User-Agent": "chrome-chat-eval/1.0 (https://github.com/nlade-core/chrome-chat)" } });',
    'function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timed out")), ms))]); }',
    'let throwawaySessionsInFlight = 0; let chatLangs = ["en", "fr"];',
    'const self = globalThis;',
    code,
    'export { ' + exported.join(', ') + ' };',
  ].join('\n'));

  const stats = { modelCalls: 0, translateCalls: 0 };
  globalThis.LanguageModel = {
    async create({ initialPrompts = [] } = {}) {
      const history = initialPrompts.map((p) => ({ role: p.role, content: p.content }));
      return {
        async prompt(text, opts = {}) {
          stats.modelCalls++;
          const t0 = performance.now();
          const raw = await ollamaChat(model, [...history, { role: 'user', content: text }], constrain ? opts.responseConstraint : undefined);
          if (process.env.EVAL_DEBUG) console.error('  [model ' + Math.round(performance.now() - t0) + 'ms] ' + JSON.stringify(raw).slice(0, 200));
          return raw;
        },
        destroy() {},
      };
    },
  };
  const NAMES = { en: 'English', fr: 'French' };
  globalThis.Translator = {
    async availability() { return 'available'; },
    async create({ sourceLanguage, targetLanguage }) {
      return {
        async translate(text) {
          stats.translateCalls++;
          return (await ollamaChat(model, [
            { role: 'system', content: 'Translate the user\'s text from ' + NAMES[sourceLanguage] + ' to ' + NAMES[targetLanguage] + '. Output only the translation.' },
            { role: 'user', content: text },
          ])).trim();
        },
      };
    },
  };
  const page = await import(pathToFileURL(file).href);
  return { ...page, stats };
}
