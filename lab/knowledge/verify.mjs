// Verifies the drafted knowledge questions against live sources and writes the
// answer key (cases.json): source value, link, as-of date. The assistant's draft is
// never the key -- a disagreement is FLAGGED for a human, not resolved here.
// Also samples Natural Questions (open, validation split) and checks each answer
// still appears in the matching Wikipedia article.
// Usage: node lab/knowledge/verify.mjs [--nq 20]
import { writeFileSync } from 'node:fs';
import { DRAFT } from './draft.mjs';

const UA = { 'User-Agent': 'chrome-chat-knowledge-eval/0.1 (https://github.com/nlade-core/chrome-chat)' };
const get = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); };
const WD = 'https://www.wikidata.org/w/api.php?format=json&action=wbgetentities';
const WP = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const today = new Date().toISOString().slice(0, 10);

const labelCache = new Map();
async function labelsOf(id) {
  if (!labelCache.has(id)) {
    // Wikidata now keeps many names under "mul" (multilingual default) rather than "en".
    const e = (await get(WD + '&props=labels|aliases&languages=en|mul&ids=' + id)).entities[id];
    const lab = e.labels || {}, al = e.aliases || {};
    labelCache.set(id, { label: (lab.en || lab.mul || {}).value || id, aliases: [...(al.en || []), ...(al.mul || [])].map((a) => a.value) });
  }
  return labelCache.get(id);
}
function timeStr(v) {
  const m = /^([+-]\d+)-(\d\d)-(\d\d)/.exec(v.time);
  const y = String(Number(m[1]));
  return v.precision >= 11 ? y + '-' + m[2] + '-' + m[3] : v.precision === 10 ? y + '-' + m[2] : y;
}
// The value(s) of one property: preferred rank if any; for `current`, only statements
// without an end date; for a quantity with several dated values, the latest.
async function wikidata({ title, prop, current }) {
  const d = await get(WD + '&props=claims|sitelinks&sites=enwiki&titles=' + encodeURIComponent(title));
  const [qid, ent] = Object.entries(d.entities)[0];
  if (qid.startsWith('-') || !ent.claims) throw new Error('no Wikidata item for ' + title);
  let st = (ent.claims[prop] || []).filter((s) => s.rank !== 'deprecated' && s.mainsnak.datavalue);
  if (current) st = st.filter((s) => !(s.qualifiers && s.qualifiers.P582));
  const pref = st.filter((s) => s.rank === 'preferred'); if (pref.length) st = pref;
  const when = (s) => (s.qualifiers && s.qualifiers.P585 && s.qualifiers.P585[0].datavalue ? timeStr(s.qualifiers.P585[0].datavalue.value) : null);
  if (st.length > 1 && st.every((s) => s.mainsnak.datavalue.type === 'quantity')) st = [st.slice().sort((a, b) => String(when(b)).localeCompare(String(when(a))))[0]];
  const values = [];
  for (const s of st) {
    const v = s.mainsnak.datavalue;
    if (v.type === 'wikibase-entityid') { const l = await labelsOf(v.value.id); values.push({ kind: 'item', id: v.value.id, label: l.label, aliases: l.aliases }); }
    else if (v.type === 'time') values.push({ kind: 'time', value: timeStr(v.value) });
    else if (v.type === 'quantity') values.push({ kind: 'quantity', value: Number(v.value.amount), unit: v.value.unit.split('/').pop() });
    else values.push({ kind: v.type, value: JSON.stringify(v.value) });
  }
  const asOf = st.map(when).find(Boolean) || null;
  return { qid, link: 'https://www.wikidata.org/wiki/' + qid + '#' + prop, values, asOf, checked: today };
}
async function wikipedia(title) {
  const d = await get(WP + '&action=query&prop=extracts|revisions&explaintext=1&rvprop=ids|timestamp&redirects=1&titles=' + encodeURIComponent(title));
  const p = d.query.pages[0];
  if (p.missing) throw new Error('no article ' + title);
  return { title: p.title, text: p.extract || '', revid: p.revisions[0].revid, revTime: p.revisions[0].timestamp,
    link: 'https://en.wikipedia.org/w/index.php?title=' + encodeURIComponent(p.title.replace(/ /g, '_')) + '&oldid=' + p.revisions[0].revid };
}
// Does the source value match the draft?
function agrees(draft, src, tol) {
  if (draft == null) return null;
  return src.values.some((v) => {
    if (v.kind === 'item') return [v.label, ...v.aliases].some((x) => norm(x) === norm(draft) || norm(x).includes(norm(draft)) || norm(draft).includes(norm(x)));
    if (v.kind === 'time') return String(v.value).startsWith(String(draft)) || String(draft).startsWith(String(v.value));
    if (v.kind === 'quantity') return Math.abs(v.value - Number(draft)) <= Math.max(0.5, Math.abs(Number(draft)) * (tol ?? 0.005));
    return false;
  });
}
const show = (src) => src.values.map((v) => v.kind === 'item' ? v.label : v.kind === 'quantity' ? v.value + (v.unit && v.unit !== '1' ? ' (' + v.unit + ')' : '') : v.value).join(' / ') + (src.asOf ? ' [as of ' + src.asOf + ']' : '');

const out = [];
for (const c of DRAFT) {
  const rec = { ...c, status: 'by-design', truth: null };
  try {
    if (c.check && c.check.wikidata) {
      const src = await wikidata(c.check.wikidata);
      rec.source = { type: 'wikidata', link: src.link, asOf: src.asOf, checked: src.checked };
      rec.truth = src.values.map((v) => v.kind === 'item' ? { label: v.label, aliases: v.aliases } : { value: v.value, unit: v.unit });
      const ok = agrees(c.draft, src, c.check.wikidata.tol);
      rec.status = !src.values.length ? 'NO-VALUE' : ok === null ? 'NEEDS-HUMAN' : ok ? 'verified' : 'DISAGREES';
      rec.sourceSays = show(src);
    } else if (c.check && c.check.wikipedia) {
      const a = await wikipedia(c.check.wikipedia.title);
      rec.source = { type: 'wikipedia', link: a.link, asOf: a.revTime.slice(0, 10), checked: today };
      if (c.check.wikipedia.mustMention) {
        const missing = c.check.wikipedia.mustMention.filter((t) => !a.text.toLowerCase().includes(t.toLowerCase()));
        rec.status = missing.length ? 'DISAGREES' : 'verified';
        rec.sourceSays = missing.length ? 'article lacks: ' + missing.join(', ') : 'article mentions all terms';
        rec.truth = { mustMention: c.check.wikipedia.mustMention };
      } else {
        const sents = a.text.split(/(?<=[.!?])\s+/).filter((s) => /\b(won|champions?|defeated|final)\b/i.test(s) && /\bfinal\b/i.test(s)).slice(0, 3);
        rec.status = 'NEEDS-HUMAN'; rec.sourceSays = sents.join(' … ').slice(0, 500) || 'no sentence about the final found';
      }
    } else if (c.check && c.check.parts) {
      const parts = []; for (const p of c.check.parts) parts.push(await wikidata(p));
      const v = parts.map((p) => p.values[0] && p.values[0].value);
      let derived = null;
      if (c.id === 56) derived = Number(String(v[1]).slice(0, 4)) - Number(String(v[0]).slice(0, 4));
      if (c.id === 57) derived = v[0] > v[1] ? 'Ben Nevis' : 'Snowdon';
      if (c.id === 58) derived = v[0] > v[1] ? 'after' : 'before';
      if (c.id === 59) derived = v[0] === v[1] ? 'yes (' + v[0] + ')' : 'no';
      if (c.id === 60) derived = v[0] > v[1] ? 'Scotland' : 'Norway';
      rec.source = { type: 'wikidata', link: parts.map((p) => p.link).join(' '), asOf: parts.map((p) => p.asOf).filter(Boolean).join(', ') || null, checked: today };
      rec.truth = { answer: derived, parts: parts.map(show) };
      rec.sourceSays = derived + ' — from ' + parts.map(show).join(' | ');
      const first = (x) => String(x).split(/[\s(]/)[0].toLowerCase();
      rec.status = String(derived) === String(c.draft) || first(derived) === first(c.draft) ? 'verified' : 'DISAGREES';
    }
  } catch (e) { rec.status = 'ERROR'; rec.sourceSays = e.message; }
  out.push(rec);
  if (rec.status !== 'verified' && rec.status !== 'by-design') console.log('#' + c.id, rec.status.padEnd(11), c.q, '\n    draft:', JSON.stringify(c.draft), '| source:', rec.sourceSays);
}

// Natural Questions sample: random rows from the open validation split; each answer
// checked against the top Wikipedia search result for the question.
const nqN = Number((process.argv.find((a, i) => process.argv[i - 1] === '--nq')) || 20);
const nq = [];
try {
  const offset = 1185; // fixed, so the sample is reproducible
  const rows = (await get('https://datasets-server.huggingface.co/rows?dataset=google-research-datasets/nq_open&config=nq_open&split=validation&offset=' + offset + '&length=' + nqN)).rows;
  for (const { row } of rows) {
    const s = await get(WP + '&action=query&list=search&srlimit=1&srsearch=' + encodeURIComponent(row.question));
    const hit = s.query.search[0];
    let found = false, link = null, rev = null;
    if (hit) { const a = await wikipedia(hit.title); found = row.answer.some((ans) => a.text.toLowerCase().includes(String(ans).toLowerCase())); link = a.link; rev = a.revTime.slice(0, 10); }
    const dated = /\b(current|currently|latest|most recent|now|this year|who is the|who plays|who sang|is the)\b/i.test(row.question);
    nq.push({ id: 'nq-' + (offset + nq.length), kind: 'nq', q: row.question, truth: { answers: row.answer }, source: { type: 'wikipedia', link, asOf: rev, checked: today },
      status: !found ? 'NEEDS-HUMAN' : dated ? 'TIME-SENSITIVE' : 'verified', sourceSays: (hit ? hit.title : 'no search hit') + (found ? ' contains an answer' : ' — answer not found in it') });
  }
} catch (e) { console.log('NQ sample failed:', e.message); }
for (const r of nq) if (r.status !== 'verified') console.log(r.id, r.status.padEnd(14), r.q, '| answers:', JSON.stringify(r.truth.answers), '|', r.sourceSays);

const all = [...out, ...nq];
writeFileSync(new URL('./cases.json', import.meta.url), JSON.stringify({ built: new Date().toISOString(), note: 'Answer key from live sources; drafts by the assistant are not the key. Statuses other than verified/by-design need a human decision.', cases: all }, null, 1));
const count = (k) => all.filter((r) => r.status === k).length;
console.log('\n' + all.length + ' questions: verified ' + count('verified') + ', by design (ambiguous/trap) ' + count('by-design') + ', DISAGREES ' + count('DISAGREES') + ', NEEDS-HUMAN ' + count('NEEDS-HUMAN') + ', TIME-SENSITIVE ' + count('TIME-SENSITIVE') + ', NO-VALUE ' + count('NO-VALUE') + ', ERROR ' + count('ERROR'));
