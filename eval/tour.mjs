// Usage: node eval/tour.mjs [--model gemma4:e4b] [--runs 5]
//
// Calibrates the guided tour's answer bank (tour/bank.js) with the Ollama
// stand-in for Gemini Nano (same sampling, hidden reasoning off; see page.mjs).
// For each question: does /wiki find the right article, and how often is the
// model right cold (chapter 1) and with the article's opening section attached
// (chapter 3)? The real app also attaches question-matching sections, so the
// grounded figure here is, if anything, a little pessimistic.
//
// Keep a question if cold accuracy is 20-60% (it sometimes bluffs, sometimes
// not) and grounded is >= 90%. The bank was committed before this first ran.
import { loadPage, ollamaChat } from './page.mjs';
import { BANK, TRAP, isRight, extractAnswer, admitsMissing } from '../tour/bank.js';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const model = arg('model', 'gemma4:e4b');
const runs = Number(arg('runs', 5));
const SYSTEM_PROMPT = 'You are a helpful, concise assistant.'; // chrome-chat's own
const page = await loadPage(model);
const titleOf = (url) => decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' ');

async function grounded(q, title) {
  const secs = await page.getArticleSections('en', title);
  const ctx = { label: title, lang: 'en', text: 'Wikipedia: ' + title + '\n' + secs[0].body.slice(0, 1500) };
  return ollamaChat(model, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: page.urlContextPreamble(ctx, q) + '\n\n' + q }]);
}

console.log('model stand-in:', model, '| runs per question:', runs, '\n');
const only = arg('ids', null) && new Set(arg('ids').split(',').map(Number));
const rows = [];
for (const item of BANK.filter((b) => !only || only.has(b.id))) {
  const title = titleOf(item.source);
  const found = ((await page.resolveWikiCandidates('en', item.q, 4))[0] || {}).title;
  let cold = 0, ground = 0; const coldVals = [];
  for (let r = 0; r < runs; r++) {
    const a = await ollamaChat(model, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: item.q }]);
    if (isRight(a, item)) cold++;
    coldVals.push(extractAnswer(a, item.unit, item.q));
    if (isRight(await grounded(item.q, title), item)) ground++;
  }
  const keep = cold / runs >= 0.2 && cold / runs <= 0.6 && ground / runs >= 0.9 && found === title;
  rows.push({ item, keep, cold });
  console.log(String(item.id).padStart(2), keep ? 'KEEP' : 'drop', '| /wiki finds', (found === title ? '✓ ' : '✗ ' + found + ' ').padEnd(3),
    '| cold', cold + '/' + runs, '| grounded', ground + '/' + runs, '| cold answers', JSON.stringify(coldVals), '| want', item.answer, '|', item.q);
}

let admits = 0; const trapTitle = titleOf(TRAP.source);
const trapFound = ((await page.resolveWikiCandidates('en', TRAP.q, 4))[0] || {}).title;
const samples = [];
for (let r = 0; r < runs; r++) {
  const a = await grounded(TRAP.q, trapTitle);
  if (admitsMissing(a)) admits++;
  samples.push(a.replace(/\s+/g, ' ').slice(0, 90));
}
console.log('\ntrap | /wiki finds', trapFound === trapTitle ? '✓' : '✗ ' + trapFound, '| admitted "not in the text"', admits + '/' + runs);
for (const s of samples) console.log('   ', JSON.stringify(s));
console.log('\nkeep:', rows.filter((r) => r.keep).map((r) => r.item.id).join(', ') || '(none)');
