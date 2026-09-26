// Usage: node eval/run.mjs [--model gemma4:e4b] [--runs 1] [--no-constraint]
// Runs the follow-up section picker and the reply-language check against
// live Wikipedia with Ollama standing in for Gemini Nano and the Translator
// API. Sampling is stochastic (temperature 1, like Nano), so use --runs 3+
// before reading much into a single ✗.
import { loadPage, ollamaChat } from './page.mjs';
import { FOLLOWUPS, REPLY_LANGUAGE } from './cases.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const model = arg('model', 'gemma4:e4b');
const runs = Number(arg('runs', 1));
const SYSTEM_PROMPT = 'You are a helpful, concise assistant.'; // chrome-chat's own
const constrain = !process.argv.includes('--no-constraint');
const page = await loadPage(model, { constrain });
const urlOf = (lang, title) => 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
const openFor = (c) => page.openArticle({ messages: [{ role: 'user', content: '/wiki x', urlContext: { url: urlOf(c.lang, c.title), text: 'summary' } }] });

console.log('model stand-in:', model, '| runs per case:', runs, '| output constraint:', constrain ? 'on' : 'off', '\n');
// Warm the article cache and the model so the first case's timing isn't a cold start.
for (const t of new Set(FOLLOWUPS.map((c) => c.lang + '|' + c.title))) { const [l, ti] = t.split('|'); await page.getArticleSections(l, ti); }
await ollamaChat(model, [{ role: 'user', content: 'hi' }]);

let ladderOk = 0, modelOk = 0, total = 0;
const stageCount = {};
for (const c of FOLLOWUPS) {
  for (let r = 0; r < runs; r++) {
    total++;
    const art = openFor(c);
    const before = page.stats.translateCalls;
    let usedModel = false;
    let t0 = performance.now();
    const picked = await page.pickFollowupSections(art, c.q, { onModelPick() { usedModel = true; } });
    const ladderMs = Math.round(performance.now() - t0);
    const stage = !picked.length ? 'none' : usedModel ? 'model' : page.stats.translateCalls > before ? 'translated words' : 'words';
    stageCount[stage] = (stageCount[stage] || 0) + 1;
    const ladderHit = picked.some((p) => c.expect.test(p.heading));
    if (ladderHit) ladderOk++;

    const unseen = (await page.getArticleSections(art.lang, art.title)).slice(1);
    t0 = performance.now();
    const hit = await page.modelPickSection(art, c.q, unseen);
    const modelMs = Math.round(performance.now() - t0);
    const modelHit = !!hit && c.expect.test(hit.heading);
    if (modelHit) modelOk++;

    console.log((c.lang + ':' + c.title).padEnd(20), JSON.stringify(c.q).padEnd(44),
      '| ladder', (ladderHit ? '✓' : '✗'), stage.padEnd(16), (picked.map((p) => p.heading).join(', ') || '-').slice(0, 42).padEnd(42), String(ladderMs).padStart(5) + 'ms',
      '| model-only', (modelHit ? '✓' : '✗'), ((hit && hit.heading) || '-').slice(0, 36).padEnd(36), String(modelMs).padStart(5) + 'ms');
  }
}
console.log('\nladder (what the app does):', ladderOk + '/' + total, '| stages used:', JSON.stringify(stageCount));
console.log('model-only heading picks:  ', modelOk + '/' + total);

console.log('\nReply language (source in the other language):');
let langOk = 0;
for (const c of REPLY_LANGUAGE.flatMap((x) => Array(runs).fill(x))) {
  const secs = await page.getArticleSections(c.lang, c.title);
  const ctx = { label: c.title, lang: c.lang, text: 'Wikipedia: ' + c.title + '\n' + secs[0].body.slice(0, 1500) };
  const reply = await ollamaChat(model, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: page.urlContextPreamble(ctx, c.q) + '\n\n' + c.q }]);
  const got = page.detectLang(reply);
  if (got === c.want) langOk++;
  console.log(' ', (got === c.want ? '✓' : '✗'), 'asked in', c.want, 'about', c.lang + ':' + c.title, '-> replied in', got, '|', JSON.stringify(reply.replace(/\s+/g, ' ').slice(0, 110)));
}
console.log('reply language correct:', langOk + '/' + REPLY_LANGUAGE.length * runs);
