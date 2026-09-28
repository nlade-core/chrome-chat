// Knowledge lookup, cautious: a declined answer ("I couldn't confirm that") is fine,
// a confidently wrong one is not. Plain code decides when to look something up,
// finds the article, and checks what comes back:
//   single facts  -> Wikidata value, checked against the Wikipedia article text;
//                    the answer is written by plain code (no model-made facts)
//   anything else -> the model answers ONLY from the article and must quote its
//                    supporting sentence; code checks the quote is really there and
//                    every number in the answer is in the quote -- or it declines.
// Shared by the chat (index.html) and the evaluation (eval/knowledge.mjs).

const WD = 'https://www.wikidata.org/w/api.php?format=json&origin=*&action=wbgetentities';
const WP = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';

// ---------------------------------------------------------------- when to look up
// Requests, not questions of fact: making something, advice, opinion, how-to. (Single
// words like "song" aren't enough -- "Which country won the Eurovision Song Contest?" is a fact.)
const NOT_KNOWLEDGE = /^\s*(write|compose|draft|create|make up|invent|imagine|pretend|role-?play|brainstorm|rewrite|rephrase|translate|give me (some |a few |\d+ |three |two )?(ideas|suggestions|tips)|suggest|recommend|help me)\b|\b(a|an|the) (poem|haiku|limerick|joke|essay|email|speech|story) (about|for|on)\b|\btell me a (joke|story)\b|\bhow (do|can|should) (i|we|you)\b|\bhow to\b|\bshould i\b|\bwhat do you think\b|\byour (opinion|favourite|view)\b|\bdo you like\b|\btell me about yourself\b/i;
const MONTHS_DAYS = /^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|I|The|A|An)$/;
const RECENT = /\b(current|currently|latest|most recent|now|today|this year|at the moment|incumbent|reigning)\b|\b(2025|2026)\b/i;
const WH = /^\s*(who|what|when|where|which|why|how (many|much|old|long|high|tall|big|far|deep)|is|was|were|are|did|does|do|has|have)\b|\b(tell me|explain) (about|who|what)\b/i;

// The single facts Wikidata answers exactly. [pattern capturing the entity, property, options]
const FACTS = [
  [/\bcapital (?:city )?of (?:the )?([^?]+?)\s*\??$/i, 'P36', { label: 'capital' }],
  [/\bpopulation of (?:the )?([^?]+?)\s*\??$/i, 'P1082', { label: 'population' }],
  [/\bhow many people live in (?:the )?([^?]+?)\s*\??$/i, 'P1082', { label: 'population' }],
  [/\bwhen (?:was|is) ([^?]+?) born\b/i, 'P569', { label: 'born' }],
  [/\bwhen did ([^?]+?) die\b/i, 'P570', { label: 'died' }],
  [/\bhow (?:high|tall) is (?:the )?([^?,]+?)(?:,?\s*in (?:metres|meters|feet))?\s*\??$/i, 'P2044|P2048', { label: 'height' }],
  [/\bwho wrote ([^?]+?)\s*\??$/i, 'P50', { label: 'author' }],
  [/\bwho (?:painted|sculpted) (?:the )?([^?]+?)\s*\??$/i, 'P170', { label: 'artist' }],
  [/\bwho (?:was the architect of|designed) (?:the )?([^?]+?)\s*\??$/i, 'P84', { label: 'architect' }],
  [/\b(?:currency|money) (?:of|in|used in) (?:the )?([^?]+?)\s*\??$/i, 'P38', { label: 'currency' }],
  [/\bofficial languages? (?:of|in) (?:the )?([^?]+?)\s*\??$/i, 'P37', { label: 'official language' }],
  [/\bwhen (?:was|were) (?:the )?([^?]+?) (?:founded|established|formed)\b/i, 'P571', { label: 'founded' }],
  [/\bwho (?:discovered|invented) ([^?]+?)\s*\??$/i, 'P61', { label: 'discovered by' }],
  [/\bhow long is (?:the )?([^?,]+?)(?:,?\s*in (?:km|kilometres|kilometers|miles))?\s*\??$/i, 'P2043', { label: 'length' }],
  [/\b(?:in )?what year (?:was|did) (?:the )?([^?]+?) open(?:ed)?\b|\bwhen did (?:the )?([^?]+?) open\b/i, 'P1619', { label: 'opened' }],
  [/\bwho is (?:the )?(?:current |present )?(?:prime minister|first minister|chancellor|premier|head of government) of (?:the )?([^?]+?)\s*\??$/i, 'P6', { label: 'head of government', current: true }],
  [/\bwho is (?:the )?(?:current |present )?(?:president|king|queen|monarch|head of state) of (?:the )?([^?]+?)\s*\??$/i, 'P35', { label: 'head of state', current: true }],
  [/\bwho is (?:the )?(?:current |present )?pope\b/i, 'P35', { label: 'Pope', current: true, entity: 'Vatican City' }],
];

// The thing the question is about: a capitalised name that isn't a month, day or
// the first word -- the longest one.
const QWORD = /^(Who|What|When|Where|Which|Why|How|Is|Was|Were|Are|Did|Does|Do|Has|Have|Tell|Explain)$/;
export function namedThing(q) {
  // "2026 FIFA World Cup", "Eurovision Song Contest 2025", "Greyfriars Bobby's" -> without the 's.
  const runs = [...q.matchAll(/(?<![\p{L}\d])(?:(?:19|20)\d\d\s+)?(?:[A-Z][\p{L}’'.-]*|of|the|de|la|von|van|and)(?:\s+(?:[A-Z][\p{L}’'.-]*|of|the|de|la|von|van|and|(?:19|20)\d\d))*/gu)]
    .map((m) => { let t = m[0].replace(/[’']s$/, '').trim(), prev; do { prev = t; t = t.replace(/^(?:of|the|de|la|von|van|and)\s+|\s+(?:of|the|de|la|von|van|and)$/g, '').trim(); } while (t !== prev); return { text: t.replace(/[’']s$/, ''), end: m.index + m[0].length }; })
    .map((r) => ({ ...r, text: r.text.split(/\s+/).filter((w, i) => !(i === 0 && QWORD.test(w))).join(' ') }))
    .filter((r) => /^((19|20)\d\d\s+)?[A-Z]/.test(r.text) && !MONTHS_DAYS.test(r.text) && !QWORD.test(r.text)
      && !/^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/.test(r.text)); // "January 1940" isn't a name
  const best = runs.sort((a, b) => b.text.length - a.text.length)[0];
  if (!best) return null;
  // A longer candidate with up to two ordinary words after it: "Enigma machine", "Tay Bridge disaster".
  const tail = /^\s+([a-z][a-z-]+)(?:\s+([a-z][a-z-]+))?/.exec(q.slice(best.end));
  const STOPW = /^(is|was|were|are|did|does|do|has|have|in|on|at|of|for|to|and|or|born|die|died|founded|open|opened|happen|happened|start|started|end|ended|begin|began|take|took|best|used|named|famous|a|an|the|from|with|by)$/;
  const extra = tail ? [tail[1], tail[2]].filter(Boolean) : [];
  const cut = extra.findIndex((w) => STOPW.test(w));
  const words = cut === -1 ? extra : extra.slice(0, cut);
  return { name: best.text, longer: words.length ? best.text + ' ' + words.join(' ') : null };
}

// { kind: 'fact', entity, prop, opts } | { kind: 'explain', entity } | null
export function knowledgeIntent(q) {
  if (!q || NOT_KNOWLEDGE.test(q)) return null;
  for (const [re, prop, opts] of FACTS) {
    const m = re.exec(q);
    if (m) { const entity = opts.entity || (m[1] || m[2] || '').trim(); if (entity) return { kind: 'fact', entity, prop, opts }; }
  }
  const nt = namedThing(q);
  if (nt && (WH.test(q) || RECENT.test(q))) return { kind: 'explain', entity: nt.name, longer: nt.longer };
  // Typed in lowercase ("who stole the mona lisa from the louvre in 1911"): no capitals to go on,
  // so search Wikipedia with the question's key words. The quote check still guards the answer.
  if (!nt && /^\s*(who|when|where|which|what year|what (was|is) the (name|date|year))\b/i.test(q) && q.trim().split(/\s+/).length >= 4) {
    const keys = q.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w && !/^(who|whom|whose|when|where|which|what|was|is|are|were|did|does|do|the|a|an|of|in|on|at|to|for|and|or|by|from|with|that|this|it|has|have|had|be|been|year|name|date)$/.test(w));
    if (keys.length >= 2) return { kind: 'explain', entity: keys.join(' '), searchOnly: true };
  }
  return null;
}

// ---------------------------------------------------------------- sources
const getJSON = async (fetchFn, url) => { const r = await fetchFn(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

// Wikipedia title for a name: an exact title (following redirects) if it's a real
// article, else the top search hit. A disambiguation page -> ambiguous.
export async function resolveTitle(name, fetchFn = fetch) {
  const exact = await getJSON(fetchFn, WP + '&action=query&redirects=1&prop=pageprops&ppprop=disambiguation&titles=' + encodeURIComponent(name));
  let p = exact.query.pages[0];
  if (p && !p.missing) return p.pageprops && 'disambiguation' in p.pageprops ? { ambiguous: true, title: p.title } : { title: p.title };
  const s = await getJSON(fetchFn, WP + '&action=query&generator=search&gsrlimit=3&gsrsearch=' + encodeURIComponent(name) + '&prop=pageprops&ppprop=disambiguation');
  const hits = (s.query ? s.query.pages : []).sort((a, b) => a.index - b.index);
  p = hits.find((h) => !(h.pageprops && 'disambiguation' in h.pageprops));
  return p ? { title: p.title, searched: true } : null;
}
export async function article(title, fetchFn = fetch, { intro = false } = {}) {
  const d = await getJSON(fetchFn, WP + '&action=query&redirects=1&prop=extracts|revisions&explaintext=1' + (intro ? '&exintro=1' : '') + '&rvprop=ids|timestamp&titles=' + encodeURIComponent(title));
  const p = d.query.pages[0];
  if (!p || p.missing) return null;
  return { title: p.title, text: p.extract || '', revTime: p.revisions[0].timestamp.slice(0, 10),
    link: 'https://en.wikipedia.org/w/index.php?title=' + encodeURIComponent(p.title.replace(/ /g, '_')) + '&oldid=' + p.revisions[0].revid };
}
const labelCache = new Map();
async function labels(id, fetchFn) {
  if (!labelCache.has(id)) {
    const e = (await getJSON(fetchFn, WD + '&props=labels|aliases&languages=en|mul&ids=' + id)).entities[id];
    const l = e.labels || {}, a = e.aliases || {};
    labelCache.set(id, { label: (l.en || l.mul || {}).value || id, aliases: [...(a.en || []), ...(a.mul || [])].map((x) => x.value) });
  }
  return labelCache.get(id);
}
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function timeValue(v) {
  const m = /^([+-]\d+)-(\d\d)-(\d\d)/.exec(v.time); const y = Number(m[1]);
  if (v.precision >= 11) return { iso: y + '-' + m[2] + '-' + m[3], text: Number(m[3]) + ' ' + MONTH[Number(m[2]) - 1] + ' ' + y, year: y };
  if (v.precision === 10) return { iso: y + '-' + m[2], text: MONTH[Number(m[2]) - 1] + ' ' + y, year: y };
  return { iso: String(y), text: String(y), year: y };
}
const UNITS = { Q11573: 'metres', Q828224: 'km', Q3710: 'feet', Q253276: 'miles' };
// The value of a property for the item behind a Wikipedia title.
export async function wikidataFact(title, props, { current = false } = {}, fetchFn = fetch) {
  const d = await getJSON(fetchFn, WD + '&props=claims&sites=enwiki&titles=' + encodeURIComponent(title));
  const [qid, ent] = Object.entries(d.entities)[0];
  if (qid.startsWith('-') || !ent.claims) return null;
  for (const prop of props.split('|')) {
    let st = (ent.claims[prop] || []).filter((s) => s.rank !== 'deprecated' && s.mainsnak.datavalue);
    if (current) st = st.filter((s) => !(s.qualifiers && s.qualifiers.P582));
    const pref = st.filter((s) => s.rank === 'preferred'); if (pref.length) st = pref;
    if (!st.length) continue;
    const when = (s) => (s.qualifiers && s.qualifiers.P585 && s.qualifiers.P585[0].datavalue ? timeValue(s.qualifiers.P585[0].datavalue.value) : null);
    if (st.length > 1 && st[0].mainsnak.datavalue.type === 'quantity') st = [st.slice().sort((a, b) => String((when(b) || {}).iso).localeCompare(String((when(a) || {}).iso)))[0]];
    const values = [];
    for (const s of st.slice(0, 3)) {
      const v = s.mainsnak.datavalue;
      if (v.type === 'wikibase-entityid') { const l = await labels(v.value.id, fetchFn); values.push({ kind: 'item', text: l.label, aliases: l.aliases }); }
      else if (v.type === 'time') values.push({ kind: 'time', ...timeValue(v.value) });
      else if (v.type === 'quantity') { const n = Number(v.value.amount); values.push({ kind: 'quantity', value: n, unit: UNITS[v.value.unit.split('/').pop()] || '', text: n.toLocaleString('en-GB') }); }
    }
    const asOf = st.map(when).find(Boolean);
    return { qid, prop, values, asOf: asOf ? asOf.text : null, link: 'https://www.wikidata.org/wiki/' + qid + '#' + prop };
  }
  return null;
}
// Does the article text say the same? (the second source)
function textAgrees(v, text) {
  const T = text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
  if (v.kind === 'item') return [v.text, ...(v.aliases || [])].some((x) => x.length > 2 && T.includes(x.toLowerCase()));
  if (v.kind === 'time') return T.includes(String(v.year)) && (v.iso.length === 4 || T.includes(v.text.toLowerCase()) || new RegExp(MONTH[Number(v.iso.slice(5, 7)) - 1].toLowerCase() + '\\s+' + Number(v.iso.slice(8, 10)) + ',\\s+' + v.year).test(T));
  if (v.kind === 'quantity') { const ns = (T.match(/\d+(?:\.\d+)?/g) || []).map(Number); return ns.some((n) => Math.abs(n - v.value) <= Math.max(1, v.value * 0.01)); }
  return false;
}
const SAY = {
  P36: (e, v) => 'The capital of ' + e + ' is ' + v + '.', P1082: (e, v) => 'The population of ' + e + ' is ' + v + '.', P569: (e, v) => e + ' was born on ' + v + '.',
  P570: (e, v) => e + ' died on ' + v + '.', P2044: (e, v) => e + ' is ' + v + ' high.', P2048: (e, v) => e + ' is ' + v + ' tall.', P50: (e, v) => e + ' was written by ' + v + '.',
  P170: (e, v) => e + ' is by ' + v + '.', P84: (e, v) => 'The architect of ' + e + ' was ' + v + '.', P38: (e, v) => 'The currency of ' + e + ' is the ' + v + '.',
  P37: (e, v) => 'The official language of ' + e + ' is ' + v + '.', P571: (e, v) => e + ' was founded in ' + v + '.', P61: (e, v) => e + ' was discovered by ' + v + '.',
  P2043: (e, v) => e + ' is ' + v + ' long.', P1619: (e, v) => e + ' opened in ' + v + '.', P6: (e, v) => 'The head of government of ' + e + ' is ' + v + '.', P35: (e, v) => 'The head of state of ' + e + ' is ' + v + '.',
};

// ---------------------------------------------------------------- the answer from text
export const PROMPT_QUOTE = 'Answer the question using ONLY the text provided. Reply as JSON with two fields: "answer" -- a short, direct answer; '
  + 'and "quote" -- ONE sentence copied EXACTLY, word for word, from the text, that supports the answer. '
  + 'If the text does not contain the answer, reply {"answer": "NOT_FOUND", "quote": ""}. Never use outside knowledge.';
export const QUOTE_SCHEMA = { type: 'object', properties: { answer: { type: 'string' }, quote: { type: 'string' } }, required: ['answer', 'quote'] };
const squash = (s) => String(s).toLowerCase().replace(/[“”"‘’']/g, "'").replace(/\s+/g, ' ').trim();
// The checks a text answer must pass. Returns a problem or null.
const STOP = /^(what|when|where|which|who|whom|whose|why|how|does|did|that|this|with|from|have|about|there|their|were|been|tell|explain|many|much|long|high|tall|used|best|known|name|named|first|also|into|than|then|them|they|after|before|during)$/;
export const keyWords = (q) => [...new Set((String(q).toLowerCase().match(/[a-z][a-z'’-]{3,}/g) || []).map((w) => w.replace(/['’]s$/, '')).filter((w) => !STOP.test(w)))];
export function checkQuoted(answer, quote, text, question = '', title = '') {
  if (!answer || /NOT_FOUND/i.test(answer)) return 'the article doesn’t say';
  if (!quote || quote.length < 12) return 'no supporting quote';
  if (!squash(text).includes(squash(quote).replace(/[.…]+$/, ''))) return 'the quote isn’t in the article';
  // Relevant, not just real (a true sentence about the 2025 Louvre theft doesn't answer who
  // stole the Mona Lisa in 1911). Words in the article title are covered by the article itself,
  // since quotes say "Her work…", "The battle…". Any year the question names must be in the quote.
  const Q = squash(quote + ' ' + answer), T = squash(title);
  for (const y of String(question).match(/\b1\d{3}\b|\b20\d\d\b/g) || []) if (!T.includes(y) && !Q.includes(y)) return 'the quote doesn’t address the question';
  const keys = keyWords(question).filter((w) => !T.includes(w.slice(0, 5)));
  if (keys.length >= 2 && !keys.some((w) => Q.includes(w.slice(0, 5)))) return 'the quote doesn’t address the question';
  const nums = (s) => (String(s).replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []);
  const inQuote = new Set(nums(quote));
  for (const n of nums(answer)) if (!inQuote.has(n)) return 'the answer has a number (' + n + ') the quote doesn’t';
  return null;
}
// The article text the model reads: the lead plus the paragraphs sharing most words with the question.
function relevantText(fullText, q, max = 3500) {
  const paras = fullText.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 40 && !/^=+/.test(p));
  const words = new Set((q.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !/^(what|when|where|which|who|whom|whose|does|did|that|this|with|from|have|about|there|their|were|been|tell|explain)$/.test(w)));
  const score = (p) => [...words].filter((w) => p.toLowerCase().includes(w)).length;
  const lead = paras.slice(0, 2);
  const rest = paras.slice(2).map((p, i) => ({ p, s: score(p), i })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 3).map((x) => x.p);
  let out = ''; for (const p of [...lead, ...rest]) { if (out.length + p.length > max) break; out += p + '\n\n'; }
  return out.trim() || fullText.slice(0, max);
}

// ---------------------------------------------------------------- the whole lookup
// io: { fetch, oneShot(system, text, schema) } -> { status: 'answered'|'declined'|'ambiguous', answer, source, ... }
export async function lookUp(q, intent, io) {
  const fetchFn = io.fetch || fetch;
  let found = null;
  if (intent.longer) { const f = await resolveTitle(intent.longer, fetchFn); if (f && !f.searched && !f.ambiguous) found = f; }
  if (!found) found = await resolveTitle(intent.entity, fetchFn);
  if (!found) return { status: 'declined', answer: 'I couldn’t find a Wikipedia article about “' + intent.entity + '”, so I won’t guess.' };
  if (found.ambiguous) return { status: 'ambiguous', answer: '“' + intent.entity + '” could mean several things on Wikipedia — which one do you mean?', link: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(found.title.replace(/ /g, '_')) };
  // A name that's also a disambiguation page ("Perth", "Birmingham"): say which one was assumed.
  // A same-name rival ("Perth, Scotland" when the main "Perth" article is Western Australia's): say which was used.
  let assumed = '';
  // Only for questions about a place: "Who wrote Hamlet?" doesn't need to hear about Hamlet, Alberta.
  if (intent.kind === 'fact' && /^(P1082|P2046|P2044|P571|P36|P6|P35|P38|P37)$/.test(intent.prop)) {
    const dab = await getJSON(fetchFn, WP + '&action=query&prop=links&pllimit=100&titles=' + encodeURIComponent(found.title + ' (disambiguation)'));
    const page = dab.query.pages[0];
    const rivals = page && !page.missing ? (page.links || []).map((l) => l.title).filter((t) => t.startsWith(found.title + ', ')) : [];
    if (rivals.length) assumed = ' (This is Wikipedia’s main “' + found.title + '” article; there’s also ' + rivals.slice(0, 2).join(' and ') + ' — say which you meant.)';
  }
  const withAssumption = (r) => (assumed && r.status === 'answered' ? { ...r, answer: r.answer + assumed, assumed: true } : r);
  return withAssumption(await answerFrom(q, intent, found, io, fetchFn));
}
async function answerFrom(q, intent, found, io, fetchFn) {
  if (intent.kind === 'fact') {
    const [fact, art] = await Promise.all([wikidataFact(found.title, intent.prop, intent.opts, fetchFn), article(found.title, fetchFn)]);
    if (fact && fact.values.length) {
      const agree = art ? fact.values.some((v) => textAgrees(v, art.text)) : false;
      const vtext = fact.values.map((v) => v.kind === 'quantity' && v.unit ? v.text + ' ' + v.unit : v.text).join(' / ');
      const name = /^(United|Republic|Netherlands|Philippines|Czech Republic|Gambia|Bahamas|Marshall Islands|Solomon Islands|Maldives|Vatican|Democratic|Central African|Dominican Republic|Isle of)\b/.test(found.title) ? 'the ' + found.title : found.title;
      const say = (SAY[fact.prop] || ((e, v) => e + ': ' + v + '.'))(name, vtext).replace(/^the /, 'The ') + (fact.asOf ? ' (as of ' + fact.asOf + ')' : '');
      // Two sources agree -> answer; the article is silent -> answer from Wikidata, saying so; they disagree -> show both.
      const disagree = art && !agree && fact.values.every((v) => v.kind === 'quantity' || v.kind === 'time') && !fact.asOf;
      return { status: 'answered', kind: 'fact', answer: say + (agree ? '' : disagree ? ' Wikipedia’s article gives a different figure — check both sources.' : ' (Wikidata; the Wikipedia article doesn’t state it directly.)'),
        agree, source: { wikidata: fact.link, wikipedia: art && art.link, revised: art && art.revTime }, title: found.title };
    }
    // no Wikidata value: fall through to reading the article
  }
  const art = await article(found.title, fetchFn);
  if (!art || !art.text) return { status: 'declined', answer: 'I couldn’t read the Wikipedia article on ' + found.title + '.' };
  const text = relevantText(art.text, q);
  let raw = '', parsed = {};
  try { raw = await io.oneShot(PROMPT_QUOTE, 'Text (from Wikipedia: ' + art.title + '):\n' + text + '\n\nQuestion: ' + q, QUOTE_SCHEMA); parsed = JSON.parse((/\{[\s\S]*\}/.exec(raw) || ['{}'])[0]); } catch {}
  const problem = checkQuoted(parsed.answer, parsed.quote, art.text, q, art.title);
  const source = { wikipedia: art.link, revised: art.revTime };
  if (problem) return { status: 'declined', answer: 'I couldn’t confirm that from Wikipedia’s article on ' + art.title + ' (' + problem + ').', problem, source, title: art.title, rejected: parsed };
  return { status: 'answered', kind: 'text', answer: String(parsed.answer).trim(), quote: String(parsed.quote).trim(), source, title: art.title };
}
