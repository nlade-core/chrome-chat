// Usage: node eval/compute.mjs [--model gemma4:e4b] [--runs 3] [--no-plain] [--strict] [--nudge] [--typed] [--set tune|held|held2|probe|all]
//
// The compute lab (lab/compute.html) with local stand-ins: Ollama for Gemini
// Nano (temperature 1, topK 3, hidden reasoning off) and local python3 for
// Pyodide (same standard library). Same prompts, cases, repair step and checks
// (lab/compute-core.js). For shaking out the pipeline before real-Nano runs --
// the numbers that matter come from the lab page in Chrome.
import { execFileSync } from 'node:child_process';
import { ollamaChat } from './page.mjs';
import { CASES, PROMPT_TOOLS, PROMPT_TOOLS_STRICT, PROMPT_PLAIN, extractPython, check, looksComputable, NUDGE, typedAnswer } from '../lab/compute-core.js';

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const model = arg('model', 'gemma4:e4b');
const runs = Number(arg('runs', 3));
const doPlain = !process.argv.includes('--no-plain');
const TOOLS = process.argv.includes('--strict') ? PROMPT_TOOLS_STRICT : PROMPT_TOOLS;
const doNudge = process.argv.includes('--nudge');
const typed = process.argv.includes('--typed');
const set = arg('set', 'tune'); // tune | held | all
const SET = CASES.filter((c) => set === 'all' || set === c.set);

function runPython(code) {
  try { return { ok: true, out: execFileSync('python3', ['-I', '-c', code], { timeout: 10000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }; }
  catch (e) { return { ok: false, out: '', err: String(e.stderr || e.message).trim().split('\n').slice(-3).join('\n') }; }
}
async function withTools(q) {
  if (typed) {
    const msgs = [];
    return typedAnswer(q, {
      first: async (system, text) => { msgs.push({ role: 'system', content: system }, { role: 'user', content: text }); const a = await ollamaChat(model, msgs); msgs.push({ role: 'assistant', content: a }); return a; },
      again: async (text) => { msgs.push({ role: 'user', content: text }); const a = await ollamaChat(model, msgs); msgs.push({ role: 'assistant', content: a }); return a; },
      py: async (code) => runPython(code),
    });
  }
  const msgs = [{ role: 'system', content: TOOLS }, { role: 'user', content: q }];
  let reply = await ollamaChat(model, msgs);
  const r = { reply, code: extractPython(reply), repaired: false, nudged: false };
  if (!r.code && doNudge && looksComputable(q)) {
    r.nudged = true;
    msgs.push({ role: 'assistant', content: reply }, { role: 'user', content: NUDGE });
    reply = await ollamaChat(model, msgs);
    r.reply = reply; r.code = extractPython(reply);
  }
  if (!r.code) { r.final = reply; return r; }
  let run = runPython(r.code);
  if (!run.ok) {
    r.repaired = true; r.err = run.err;
    const fix = await ollamaChat(model, [...msgs, { role: 'assistant', content: r.reply }, { role: 'user', content: 'That code failed with this error:\n' + run.err + '\nReply with only a corrected ```python code block.' }]);
    const code2 = extractPython(fix);
    if (code2) { r.code2 = code2; run = runPython(code2); }
  }
  r.out = run.ok ? run.out : null; r.final = run.ok ? run.out : '';
  if (!run.ok) r.err = run.err;
  return r;
}

console.log('model stand-in:', model, '| mode:', typed ? 'TYPED' : 'plain code', '| tool prompt:', TOOLS === PROMPT_TOOLS ? 'lenient' : 'strict', '| nudge:', doNudge ? 'on' : 'off', '| set:', set, '| runs per case:', runs, '| baseline:', doPlain ? 'on' : 'off', '\n');
const T = { cT: 0, cP: 0, cN: 0, used: 0, dT: 0, dP: 0, dN: 0, falseTrig: 0, rep: 0 };
for (const c of SET) {
  let pass = 0, used = 0, rep = 0, plainPass = 0; const outs = [];
  for (let i = 0; i < runs; i++) {
    const r = await withTools(c.q);
    if (check(c, r.final)) pass++; if (r.code) used++; if (r.repaired) rep++;
    outs.push((r.code ? (r.out ?? 'ERR ' + (r.err || '').split('\n').pop()) : 'direct: ' + r.reply).replace(/\s+/g, ' ').slice(0, 30) + (r.typed && r.problems && r.problems.length ? ' [rej: ' + r.problems.map((x) => x.slice(0, 40)).join(' | ') + ']' : ''));
    if (doPlain && check(c, await ollamaChat(model, [{ role: 'system', content: PROMPT_PLAIN }, { role: 'user', content: c.q + ' Answer briefly.' }]))) plainPass++;
  }
  if (c.code) { T.cT += pass; T.cP += plainPass; T.cN += runs; T.used += used; } else { T.dT += pass; T.dP += plainPass; T.dN += runs; T.falseTrig += used; }
  T.rep += rep;
  console.log(String(c.id).padStart(2), (c.code ? 'compute' : 'direct ').padEnd(7), '| tools', pass + '/' + runs, '| code', used + '/' + runs, rep ? '| repaired ' + rep : '', doPlain ? '| plain ' + plainPass + '/' + runs : '', '|', c.q.slice(0, 50).padEnd(50), JSON.stringify(outs));
}
console.log('\ncompute questions: with tools', T.cT + '/' + T.cN, '| plain', T.cP + '/' + T.cN, '| used code when needed', T.used + '/' + T.cN);
console.log('near-misses:       with tools', T.dT + '/' + T.dN, '| plain', T.dP + '/' + T.dN, '| false triggers (code when not needed)', T.falseTrig + '/' + T.dN);
console.log('repairs attempted:', T.rep);
