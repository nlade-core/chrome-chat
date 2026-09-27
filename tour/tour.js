// Guided tour: what a small on-device chat model can do, and where it stops,
// in the order chat assistants gained each ability. It drives the real app
// (window.chromeChat: fill the message box, start a new chat) and listens for
// its chat:reply / chat:context events. The visitor always presses send.
//
// Scoring is plain code against tour/bank.js -- the model never grades itself.
// Model text is only ever rendered with textContent.
import { BANK, TRAP, TOUR_IDS, isRight, extractAnswer, admitsMissing } from './bank.js';

const QS = TOUR_IDS.map((id) => BANK.find((b) => b.id === id));
const FOLLOW_UP = 'Tell me one more fact about it, and name it in your answer.';
const IO = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const STORE = 'chrome-chat-tour';
const RECORD = new URLSearchParams(location.search).has('record');

let app, root, body, header, token = 0, modelState = 'checking', recorded = null;
let state = load() || { ch: 0, r: {} };
let lastContext = null;
document.addEventListener('chat:context', (e) => { lastContext = e.detail; });

function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }

// ------------------------------------------------------------------ helpers

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
const p = (...kids) => h('p', {}, ...kids);
const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const add = (...els) => { for (const el of els) body.append(el); body.scrollTop = body.scrollHeight; return els[0]; };
const live = () => { const my = token; return () => my === token; };

// Resolves with the next click on one of the given buttons (its value).
function choose(options, cls = '') {
  return new Promise((resolve) => {
    const row = h('div', { class: 'tour-row ' + cls });
    for (const [label, value, kind] of options) {
      row.append(h('button', { class: 'tour-btn' + (kind ? ' ' + kind : ''), on: { click: () => { row.querySelectorAll('button').forEach((b) => (b.disabled = true)); resolve(value); } } }, label));
    }
    add(row);
  });
}
// The next reply the app finishes (whatever thread), or null if the chapter changed.
function nextReply(isLive) {
  return new Promise((resolve) => {
    const on = (e) => { document.removeEventListener('chat:reply', on); resolve(isLive() ? e.detail : null); };
    document.addEventListener('chat:reply', on);
  });
}
// Put text in the real message box; wait for the visitor to send and the reply to finish.
async function ask(text, isLive, { fresh = false, hint = 'It’s in the message box — press send ➤ when you’re ready.' } = {}) {
  await choose([['Put it in the message box', true, 'primary']]);
  if (!isLive()) return null;
  if (fresh) app.newChat();
  app.fill(text);
  const note = add(h('p', { class: 'tour-hint' }, hint));
  const got = await nextReply(isLive);
  note.remove();
  if (got && got.error) add(h('p', { class: 'tour-bad' }, 'The model hit an error: ' + got.error));
  return got;
}
const said = (v) => (v == null ? 'no number' : v.toLocaleString('en-GB'));
function verdict(ok, yes, no) { return h('span', { class: ok ? 'tour-ok' : 'tour-bad' }, ok ? yes : no); }
// Trust call before the reveal; scored on whether the call matched reality.
async function trustCall(isLive) {
  add(p('Would you trust that answer?'));
  const trust = await choose([['Trust it', true], ['Don’t trust it', false]]);
  return isLive() ? trust : null;
}
function judged(trust, right) {
  const good = trust === right;
  return verdict(good, 'Good call.', trust ? 'You trusted a wrong answer.' : 'It was right this time — but you couldn’t know that from how it sounded.');
}

// ------------------------------------------------------------------ chapters

const CHAPTERS = [
  { key: 'start', title: 'Before you start', run: chStart },
  { key: 'c1', title: 'It predicts text', run: ch1 },
  { key: 'c2', title: 'It remembers the conversation', run: ch2 },
  { key: 'c3', title: 'Give it a source', run: ch3 },
  { key: 'c4', title: 'Make it follow a format', run: ch4 },
  { key: 'c5', title: 'Pull the plug', run: ch5 },
  { key: 'end', title: 'Your results', run: chEnd },
];

async function chStart(isLive) {
  add(p('Chat assistants learned their tricks in stages: first they just predicted text, then they held a conversation, then they read sources, followed formats and ran on your own machine. Each stage fixed something and left a limit behind.'),
    p('This tour walks through those stages with the small model built into Chrome, using this app. Five short chapters, about ten minutes. You press send every time; nothing is automated behind your back.'));
  if (modelState === 'available') add(p(verdict(true, 'The model is ready on this device.', '')));
  else if (modelState === 'downloadable' || modelState === 'downloading') add(p(verdict(true, 'The model will download on your first message (a few GB, once). Keep this tab open while it does.', '')));
  else {
    add(p(verdict(false, '', 'This browser can’t run the model here — it needs desktop Google Chrome with built-in AI.')),
      p(recorded ? 'You can still read the tour: each chapter shows what happened on a recorded run on a real device.' : 'You can still read the tour; the steps that need the model are skipped.'));
  }
  await choose([['Start', true, 'primary']]);
  if (isLive()) go(1);
}

async function ch1(isLive) {
  add(p('At heart the model predicts the next words. It learned from a huge amount of text, so it often knows things — but it has no way to look anything up, and it sounds equally sure when it’s wrong.'),
    p('Five questions. After each answer, decide whether you’d trust it. Then see what the source says.'));
  if (!canRun('c1')) return;
  const out = state.r.c1 = { items: [] }; save();
  for (const [i, item] of QS.entries()) {
    add(h('h4', {}, 'Question ' + (i + 1) + ' of ' + QS.length), p(item.q));
    const got = await ask(item.q, isLive, { fresh: i === 0 });
    if (!got) return;
    const trust = await trustCall(isLive);
    if (trust == null) return;
    const right = isRight(got.reply, item);
    out.items.push({ id: item.id, q: item.q, reply: got.reply, said: extractAnswer(got.reply, item.unit, item.q), right, trust });
    save();
    add(p('The source says ', h('strong', {}, item.answer.toLocaleString('en-GB')), ' (', link(item.source, 'Wikipedia'), '). It said ', said(extractAnswer(got.reply, item.unit, item.q)), ' — ', verdict(right, 'right.', 'wrong.'), ' ', judged(trust, right)));
  }
  const n = out.items.filter((x) => x.right).length;
  add(h('div', { class: 'tour-lesson' }, 'It was right ' + n + ' of ' + QS.length + ' this time, and sounded just as sure either way. The limit: a model on its own can’t tell you which answers to trust.'));
  await next(isLive);
}

async function ch2(isLive) {
  const last = QS[QS.length - 1];
  add(p('A chat model “remembers” by re-reading the whole conversation every turn. That’s what lets you say “it” and be understood.'),
    p('Ask a follow-up about the last question (' + last.q.replace(/\?$/, '') + '):'), p(h('em', {}, FOLLOW_UP)));
  if (!canRun('c2')) return;
  const out = state.r.c2 = {}; save();
  const a = await ask(FOLLOW_UP, isLive, { hint: 'Same conversation as chapter 1 — press send ➤.' });
  if (!a) return;
  out.remembered = a.reply.toLowerCase().includes(last.keyword); out.reply1 = a.reply; save();
  add(p(verdict(out.remembered, 'It knew what “it” meant.', 'It didn’t pick up what “it” meant (did you skip chapter 1?).')));
  if (lastContext && lastContext.window) {
    add(p('That memory has a size. This conversation has used ' + Math.round(100 * lastContext.usage / lastContext.window) + '% of it — the meter at the top of the chat. When it fills, the oldest turns have to go.'));
  }
  add(p('Now the same question in a brand-new chat:'));
  const b = await ask(FOLLOW_UP, isLive, { fresh: true, hint: 'A new, empty chat — press send ➤.' });
  if (!b) return;
  out.forgot = !b.reply.toLowerCase().includes(last.keyword); out.reply2 = b.reply; save();
  add(p(verdict(out.forgot, 'It had no idea what “it” was — a new chat starts from nothing.', 'It named it anyway, which is luck, not memory.')),
    h('div', { class: 'tour-lesson' }, 'The limit: memory is just the conversation so far, and only up to a fixed size. Nothing carries over to a new chat.'));
  await next(isLive);
}

async function ch3(isLive) {
  add(p('The fix for made-up facts is to hand the model a source and ask it to answer from that. Here, /wiki looks the question up on Wikipedia and passes the article along with it.'));
  if (!canRun('c3')) return;
  const out = state.r.c3 = {}; save();
  const wrong = (state.r.c1 && state.r.c1.items || []).find((x) => !x.right);
  const item = (wrong && QS.find((q) => q.id === wrong.id)) || QS[1];
  add(p(wrong ? 'Try the one it got wrong in chapter 1:' : 'Try this one:'), p(h('em', {}, '/wiki ' + item.q)));
  const a = await ask('/wiki ' + item.q, isLive, { fresh: true, hint: 'Watch the chip above the message box: it shows which article was found. Press send ➤ once it’s there.' });
  if (!a) return;
  const trust = await trustCall(isLive);
  if (trust == null) return;
  out.right = isRight(a.reply, item); out.trust = trust; out.q = item.q; out.reply = a.reply; save();
  add(p('It used: ' + (a.label || 'no article') + '. The source says ' + item.answer.toLocaleString('en-GB') + '; it said ' + said(extractAnswer(a.reply, item.unit, item.q)) + ' — ', verdict(out.right, 'right.', 'wrong.'), ' ', judged(trust, out.right)));
  add(p('Now a question the article can’t answer. There is nothing about visitor numbers in it.'), p(h('em', {}, '/wiki ' + TRAP.q)));
  const b = await ask('/wiki ' + TRAP.q, isLive, { fresh: true, hint: 'Press send ➤ once the article chip appears.' });
  if (!b) return;
  const trust2 = await trustCall(isLive);
  if (trust2 == null) return;
  out.admitted = admitsMissing(b.reply); out.trapTrust = trust2; out.trapReply = b.reply;
  const invented = extractAnswer(b.reply, 'n', TRAP.q);
  save();
  add(p(out.admitted ? verdict(true, 'It said the article doesn’t say. That’s the honest answer.', '')
    : invented != null ? verdict(false, '', 'It gave ' + said(invented) + '. The article has no such figure — that number was made up.')
      : 'No number, and no clear “the article doesn’t say” — read its reply.', ' ', judged(trust2, out.admitted)),
  h('div', { class: 'tour-lesson' }, 'The limit: a source fixes most errors, but when the source is silent the model may still fill the gap. Good tools show you the source so you can check.'));
  await next(isLive);
}

async function ch4(isLive) {
  const item = QS.find((q) => q.unit === 'year') || QS[0];
  add(p('Software that uses a model usually needs an answer in a fixed shape — a number, a yes/no, a date — not a paragraph. You can ask nicely, or you can force it: Chrome can constrain the output to a format.'),
    p('This runs six quick calls straight to the model (not in the chat): three asking for “only the year”, three with the format forced.'), p(h('em', {}, item.q)));
  if (!canRun('c4')) return;
  await choose([['Run the six calls', true, 'primary']]);
  if (!isLive()) return;
  const out = state.r.c4 = { rows: [] }; save();
  const table = add(h('table', { class: 'tour-table' }, h('tr', {}, h('th', {}, 'Mode'), h('th', {}, 'Reply'), h('th', {}, 'Clean?'), h('th', {}, 'Right?'))));
  const status = add(h('p', { class: 'tour-hint' }, 'Running…'));
  for (const forced of [false, false, false, true, true, true]) {
    let raw = '', err = null;
    let s;
    try {
      s = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: 'You are a helpful, concise assistant.' }], ...IO });
      raw = forced ? await s.prompt(item.q, { responseConstraint: { type: 'integer', minimum: 1000, maximum: 2100 } })
        : await s.prompt(item.q + ' Reply with only the year.');
    } catch (e) { err = e.message; } finally { try { s && s.destroy(); } catch {} }
    if (!isLive()) return;
    const clean = !err && /^\s*\d{4}\s*$/.test(raw);
    const right = !err && extractAnswer(raw, 'year') === item.answer;
    out.rows.push({ forced, raw, clean, right, err }); save();
    table.append(h('tr', {}, h('td', {}, forced ? 'forced' : 'asked'), h('td', {}, err ? 'error: ' + err : raw.length > 60 ? raw.slice(0, 60) + '…' : raw), h('td', {}, clean ? '✓' : '✗'), h('td', {}, right ? '✓' : '✗')));
  }
  status.remove();
  const c = (f, k) => out.rows.filter((r) => r.forced === f && r[k]).length;
  add(p('Asked: clean ' + c(false, 'clean') + '/3, right ' + c(false, 'right') + '/3. Forced: clean ' + c(true, 'clean') + '/3, right ' + c(true, 'right') + '/3 (the source says ' + item.answer + ').'),
    h('div', { class: 'tour-lesson' }, 'The limit: forcing the format guarantees the shape of the answer, not its truth. A clean wrong number is still wrong.'));
  await next(isLive);
}

async function ch5(isLive) {
  add(p('Everything so far ran on this device — the model is part of Chrome, not a service somewhere. Prove it: turn your wifi off (or unplug), then ask a question.'),
    p('The counter below shows network requests this page makes during this chapter.'));
  if (!canRun('c5')) return;
  const out = state.r.c5 = {}; save();
  const t0 = performance.now();
  const net = add(h('p', { class: 'tour-net' }));
  const count = () => performance.getEntriesByType('resource').filter((e) => e.startTime > t0).length;
  const paint = () => { net.textContent = (navigator.onLine ? 'Online' : 'Offline ✓') + ' · requests this chapter: ' + count(); };
  paint();
  const timer = setInterval(() => (isLive() ? paint() : clearInterval(timer)), 500);
  const item = QS[0];
  const a = await ask(item.q, isLive, { fresh: true, hint: navigator.onLine ? 'Turn the network off first, then press send ➤.' : 'Press send ➤.' });
  clearInterval(timer);
  if (!a) return;
  paint();
  out.offline = !navigator.onLine; out.answered = !a.error && !!a.reply; out.requests = count(); save();
  add(p(out.offline && out.answered ? verdict(true, 'Answered with no network at all, and ' + out.requests + ' requests.', '')
    : out.answered ? 'It answered — but you were still online, so this didn’t prove much. Try again with the network off.'
      : verdict(false, '', 'No answer. If the model hadn’t finished downloading, it needs the network once.')),
  p('/wiki needs the network, of course — unless you connect an offline copy of Wikipedia (see About), and then /wiki:offline works with the plug pulled too.'),
  h('div', { class: 'tour-lesson' }, 'The limit: private by default, because nothing leaves the device — but it’s only as capable as a model small enough to run on a laptop. Turn the network back on.'));
  await next(isLive);
}

async function chEnd(isLive) {
  const r = state.r;
  const calls = [...(r.c1 ? r.c1.items.map((x) => x.trust === x.right) : []), ...(r.c3 && r.c3.trust != null ? [r.c3.trust === r.c3.right] : []), ...(r.c3 && r.c3.trapTrust != null ? [r.c3.trapTrust === r.c3.admitted] : [])];
  const lines = [
    r.c1 && ['On its own', r.c1.items.filter((x) => x.right).length + ' of ' + r.c1.items.length + ' right'],
    r.c3 && r.c3.right != null && ['With a source', r.c3.right ? 'right' : 'still wrong'],
    r.c3 && r.c3.admitted != null && ['Source silent', r.c3.admitted ? 'admitted it' : 'filled the gap'],
    r.c2 && r.c2.remembered != null && ['Memory', (r.c2.remembered ? 'followed “it”' : 'lost “it”') + (r.c2.forgot != null ? (r.c2.forgot ? '; forgot in a new chat' : '') : '')],
    r.c4 && r.c4.rows && ['Forced format', r.c4.rows.filter((x) => x.forced && x.clean).length + '/3 clean, ' + r.c4.rows.filter((x) => x.forced && x.right).length + '/3 right'],
    r.c5 && r.c5.answered != null && ['Offline', r.c5.offline && r.c5.answered ? 'answered, ' + r.c5.requests + ' requests' : 'not tested offline'],
    calls.length && ['Your trust calls', calls.filter(Boolean).length + ' of ' + calls.length + ' right'],
  ].filter(Boolean);
  add(h('table', { class: 'tour-table' }, lines.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))));
  add(h('h4', {}, 'What this means for an organisation'),
    h('ul', {}, h('li', {}, 'Don’t rely on a small model’s own knowledge for facts. Give it your documents and have it answer from them.'),
      h('li', {}, 'Insist on seeing the source next to every answer, and on “the document doesn’t say” being an allowed answer.'),
      h('li', {}, 'On-device means private by default: nothing leaves the machine. Scope the job to what a small model does well — finding, quoting, summarising — not open-ended judgement.')),
    p('See those three ideas applied to UK data protection law: ', link('https://nlade-core.github.io/ukdp-private-qa/', 'a private, cited Q&A over UK GDPR'), '.'),
    h('h4', {}, 'Keep going on your own'),
    h('ul', {}, h('li', {}, '/wiki full Forth Bridge — then ask follow-ups: long articles don’t fit, so the right section is found first.'),
      h('li', {}, '/wiki:fr Quelle est la hauteur de la tour Eiffel ? — other languages, and a separate translation model.'),
      h('li', {}, 'Attach a photo with 📎 and ask what’s in it — then count something small in it.')));
  const summary = 'Guided tour of an on-device chat model — ' + lines.map(([k, v]) => k + ': ' + v).join('; ') + '. ' + location.origin + location.pathname + '?tour';
  const row = add(h('div', { class: 'tour-row' }));
  row.append(h('button', { class: 'tour-btn primary', on: { click: async (e) => { try { await navigator.clipboard.writeText(summary); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; } } } }, 'Copy my results'),
    h('button', { class: 'tour-btn', on: { click: () => { state = { ch: 0, r: {} }; save(); go(0); } } }, 'Start over'));
  if (RECORD) {
    row.append(h('button', { class: 'tour-btn', on: { click: () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ recorded: new Date().toISOString(), ua: navigator.userAgent, r }, null, 2)], { type: 'application/json' }));
      h('a', { href: url, download: 'recorded.json' }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } } }, 'Download recorded.json'));
  }
}

// No model here: show the recorded run's exchanges instead, if there is one.
function canRun(key) {
  if (modelState !== 'unavailable') return true;
  const rec = recorded && recorded.r && recorded.r[key];
  if (rec) {
    const box = h('div', { class: 'tour-recorded' }, h('strong', {}, 'Recorded run'));
    const pairs = key === 'c1' ? rec.items.map((x) => [x.q, x.reply, x.right ? 'right' : 'wrong'])
      : key === 'c2' ? [[FOLLOW_UP, rec.reply1, rec.remembered ? 'remembered' : 'lost it'], ['(new chat) ' + FOLLOW_UP, rec.reply2, rec.forgot ? 'forgot' : 'named it']]
        : key === 'c3' ? [['/wiki ' + rec.q, rec.reply, rec.right ? 'right' : 'wrong'], ['/wiki ' + TRAP.q, rec.trapReply, rec.admitted ? 'admitted' : 'filled the gap']]
          : key === 'c4' ? rec.rows.map((x) => [x.forced ? 'forced' : 'asked', x.raw, (x.clean ? 'clean' : 'not clean') + ', ' + (x.right ? 'right' : 'wrong')])
            : [['(offline)', rec.answered ? 'answered' : 'no answer', rec.requests + ' requests']];
    for (const [q, a, v] of pairs) box.append(h('p', {}, h('em', {}, q)), h('p', {}, String(a || '').slice(0, 300)), h('p', { class: 'tour-hint' }, v));
    add(box);
  } else add(h('p', { class: 'tour-hint' }, 'This step needs the model, so it’s skipped here.'));
  add(h('div', { class: 'tour-row' }, h('button', { class: 'tour-btn primary', on: { click: () => go(state.ch + 1) } }, 'Next chapter')));
  return false;
}
async function next(isLive) {
  await choose([['Next chapter', true, 'primary']]);
  if (isLive()) go(state.ch + 1);
}

// ------------------------------------------------------------------ shell

function go(i) {
  state.ch = Math.max(0, Math.min(CHAPTERS.length - 1, i)); save();
  token++;
  const ch = CHAPTERS[state.ch];
  header.textContent = '';
  header.append(h('span', { class: 'tour-step' }, state.ch === 0 || state.ch === CHAPTERS.length - 1 ? 'Guided tour' : 'Chapter ' + state.ch + ' of ' + (CHAPTERS.length - 2)), h('h3', {}, ch.title));
  body.textContent = '';
  body.scrollTop = 0;
  ch.run(live()).catch((e) => { console.warn('[chrome-chat tour]', e); add(h('p', { class: 'tour-bad' }, 'Something went wrong: ' + e.message)); });
  root.querySelector('.tour-back').disabled = state.ch === 0;
  root.querySelector('.tour-skip').disabled = state.ch === CHAPTERS.length - 1;
}

export async function startTour(api) {
  app = api;
  if (!root) {
    document.head.append(h('link', { rel: 'stylesheet', href: new URL('./tour.css', import.meta.url).href }));
    header = h('div', { class: 'tour-title' });
    body = h('div', { class: 'tour-body' });
    root = h('aside', { id: 'tour', 'aria-label': 'Guided tour' },
      h('div', { class: 'tour-head' }, header, h('button', { class: 'tour-close', 'aria-label': 'Close the tour', on: { click: () => { root.hidden = true; document.body.classList.remove('tour-open'); token++; } } }, '×')),
      body,
      h('div', { class: 'tour-foot' },
        h('button', { class: 'tour-btn tour-back', on: { click: () => go(state.ch - 1) } }, '← Back'),
        h('button', { class: 'tour-btn tour-skip', on: { click: () => go(state.ch + 1) } }, 'Skip →')));
    document.body.append(root);
    try { modelState = self.LanguageModel ? await LanguageModel.availability(IO) : 'unavailable'; } catch { modelState = 'unavailable'; }
    if (modelState === 'unavailable') {
      try { const res = await fetch(new URL('./recorded.json', import.meta.url)); if (res.ok) recorded = await res.json(); } catch {}
    }
  }
  root.hidden = false;
  document.body.classList.add('tour-open');
  go(state.ch);
}
