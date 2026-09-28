// Usage: node eval/knowledge.mjs [--model gemma4:e4b] [--no-plain] [--only 43,51]
//
// Scores the cautious knowledge lookup (tools/knowledge.js) on the pre-registered set
// in lab/knowledge/ (cases.json + decisions.json + extra.mjs), with a local model
// standing in for Gemini Nano. Every answer is RIGHT, WRONG or DECLINED; the headline
// is the WRONG rate. Also asks the same model plainly (no lookup) as a baseline, and
// counts lookups triggered on the no-lookup requests (false triggers).
import { readFileSync } from 'node:fs';
import { ollamaChat } from './page.mjs';
import { knowledgeIntent, lookUp } from '../tools/knowledge.js';
import { NO_LOOKUP } from '../lab/knowledge/extra.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = arg('model', 'gemma4:e4b');
const PLAIN = !process.argv.includes('--no-plain');
const ONLY = arg('only', null) && new Set(arg('only').split(','));
const root = new URL('..', import.meta.url);
const key = JSON.parse(readFileSync(new URL('lab/knowledge/cases.json', root), 'utf8')).cases;
const decisions = JSON.parse(readFileSync(new URL('lab/knowledge/decisions.json', root), 'utf8'));
const cases = [...key.filter((c) => c.kind !== 'nq' || c.status === 'verified'), ...NO_LOOKUP].filter((c) => !ONLY || ONLY.has(String(c.id)));

const uaFetch = (u, o = {}) => fetch(u, { ...o, headers: { ...(o.headers || {}), 'User-Agent': 'chrome-chat-knowledge-eval/0.1 (https://github.com/nlade-core/chrome-chat)' } });
const oneShot = (system, text, schema) => ollamaChat(MODEL, [{ role: 'system', content: system }, { role: 'user', content: text }], schema);
const plainAsk = (q) => ollamaChat(MODEL, [{ role: 'system', content: 'You are a helpful, concise assistant. Today is ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.' }, { role: 'user', content: q + ' Answer briefly.' }]);

const MONTH = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const low = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1');
// The strings (or numbers) that count as right for a case.
function accepted(c) {
  const d = decisions.cases[String(c.id)];
  if (d) return { strings: d.accept };
  if (c.kind === 'nq') return { strings: c.truth.answers };
  if (c.kind === 'multi') return { strings: [String(c.truth.answer).split(' ')[0]] };
  if (c.truth && c.truth.mustMention) return { all: c.truth.mustMention };
  if (Array.isArray(c.truth)) {
    const strings = [], numbers = [];
    for (const t of c.truth) {
      if (t.label) strings.push(t.label, ...(t.aliases || []));
      else if (typeof t.value === 'number') numbers.push({ v: t.value, tol: (c.check && c.check.wikidata && c.check.wikidata.tol) || 0.01 });
      else if (/^\d{4}-\d\d-\d\d$/.test(t.value)) { const [y, m, dd] = t.value.split('-').map(Number); strings.push(dd + ' ' + MONTH[m - 1] + ' ' + y, MONTH[m - 1] + ' ' + dd + ', ' + y, t.value); }
      else strings.push(String(t.value));
    }
    return { strings, numbers };
  }
  return null;
}
function isRight(c, text) {
  const T = low(text);
  const a = accepted(c);
  if (!a) return false;
  if (a.all) return a.all.every((t) => T.includes(low(t)));
  if ((a.strings || []).some((s) => s && T.includes(low(s)))) return true;
  const ns = (T.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return (a.numbers || []).some(({ v, tol }) => ns.some((n) => Math.abs(n - v) <= Math.max(0.5, v * tol)));
}
// (Widened after the first run, where "The text does not compare the heights…" scored as right.)
const DECLINE = /\b(couldn'?t confirm|could not confirm|won'?t guess|doesn'?t (say|state|mention|compare|specify)|does not (say|state|mention|compare|specify|contain)|no (record|information|evidence)|not (known|recorded|documented)|unknown|i (don'?t|do not) know|cannot (find|determine|confirm)|isn'?t (known|recorded))\b/i;
// right | wrong | declined, per kind.
function score(c, r) {
  const text = r.answer + (r.quote ? ' ' + r.quote : '');
  if (c.kind === 'nolookup') return r.lookedUp ? 'wrong' : 'right';
  if (c.kind === 'trap') {
    if (r.status === 'declined' || r.status === 'ambiguous' || DECLINE.test(text)) return 'right';
    if (c.premiseOk && c.premiseOk.some((p) => low(text).includes(low(p)))) return 'right';
    return 'wrong';
  }
  if (c.kind === 'ambiguous') {
    if (r.status === 'ambiguous' || r.assumed) return 'right';
    if (c.options && c.options.every((o) => low(text).includes(low(o)))) return 'right';
    if (r.status === 'declined' || DECLINE.test(text)) return 'declined';
    return 'wrong';
  }
  if (r.status === 'declined' || r.status === 'ambiguous' || DECLINE.test(r.answer)) return 'declined';
  return isRight(c, text) ? 'right' : DECLINE.test(text) ? 'declined' : 'wrong';
}

const tally = {}, plainTally = {}, wrongs = [], plainWrongs = [];
const add = (t, k, s) => { t[k] = t[k] || { right: 0, wrong: 0, declined: 0 }; t[k][s]++; };
console.log('model:', MODEL, '| cases:', cases.length, '\n');
for (const c of cases) {
  const intent = knowledgeIntent(c.q);
  let r;
  const t0 = Date.now();
  if (!intent) r = { status: 'plain', answer: c.kind === 'nolookup' ? '' : await plainAsk(c.q), lookedUp: false };
  else { try { r = { ...(await lookUp(c.q, intent, { fetch: uaFetch, oneShot })), lookedUp: true }; } catch (e) { r = { status: 'declined', answer: 'error: ' + e.message, lookedUp: true }; } }
  const s = score(c, r);
  add(tally, c.kind, s);
  if (s === 'wrong') wrongs.push({ c, r });
  let ps = '';
  if (PLAIN && c.kind !== 'nolookup') { const pa = await plainAsk(c.q); ps = score(c, { status: 'plain', answer: pa }); add(plainTally, c.kind, ps); if (ps === 'wrong') plainWrongs.push({ c, a: pa }); }
  console.log(String(c.id).padStart(8), c.kind.padEnd(9), s.toUpperCase().padEnd(8), (intent ? intent.kind : 'none').padEnd(7), String(Date.now() - t0).padStart(5) + 'ms', PLAIN && ps ? '| plain ' + ps.padEnd(8) : '', '|', String(r.answer).replace(/\s+/g, ' ').slice(0, 110));
}
const sum = (t) => Object.values(t).reduce((a, x) => ({ right: a.right + x.right, wrong: a.wrong + x.wrong, declined: a.declined + x.declined }), { right: 0, wrong: 0, declined: 0 });
const line = (name, t) => { const n = t.right + t.wrong + t.declined; return name.padEnd(14) + 'right ' + t.right + '/' + n + ' | WRONG ' + t.wrong + '/' + n + ' (' + (100 * t.wrong / n).toFixed(1) + '%) | declined ' + t.declined; };
console.log('\nBy kind (with lookup):'); for (const [k, t] of Object.entries(tally)) console.log('  ' + line(k, t));
console.log('\n' + line('WITH LOOKUP', sum(tally)));
if (PLAIN) console.log(line('PLAIN MODEL', sum(plainTally)) + '   (same questions, no lookup; no-lookup requests excluded)');
console.log('\nWrong with lookup:'); for (const { c, r } of wrongs) console.log('  #' + c.id, c.q, '\n     ->', String(r.answer).slice(0, 200), r.quote ? '\n     quote: ' + r.quote.slice(0, 160) : '');
