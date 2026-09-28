// Follow-ups: a message that leans on the conversation ("and tomorrow?", "double
// that", "what's it like there?") is turned into a standalone question, checked,
// and then routed like any other -- so tools and Python get the full context.
// Plain-code rules first (instant, exact), using what the last answer left
// behind (ctx); otherwise a model rewrite, checked in plain code. If nothing
// checks out, the message goes to the plain chat, which has the whole transcript.

const SIGNS = /^\s*(and|so|then|but|also|ok(ay)?|now|what about|how about|what if|same)\b|\b(it|its|that|those|these|them|there|this one|the same|instead|the answer|the result|the total|again|as well)\b|^\s*(double|twice|half|halve|triple|reverse|the other way)\b/i;
export function looksLikeFollowUp(text, hasHistory) {
  if (!hasHistory) return false;
  return SIGNS.test(text) || text.trim().split(/\s+/).length <= 3;
}

const DAYWORDS = /\b(today|tonight|now|tomorrow|this weekend|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const WEATHERISH = /\b(weather|rain\w*|umbrella|coat|jacket|jumper|sunscreen|sun ?cream|shorts|gloves|cold|chilly|warm|hot|wind\w*|snow\w*|frost\w*|temperature|degrees|sunny|outside|picnic|barbecue|bbq|walk|cycle|run)\b/i;
const strip = (t) => t.replace(/^\s*(and|so|then|but|also|ok(ay)?|now|what about|how about|what if)\b[\s,]*/i, '').replace(/\?+\s*$/, '');

// Rule rewrites from the previous answer's context. Returns a standalone question or null.
// followUp: whether the message looked like a follow-up. Without that, only
// weather-ish words after a weather answer count ("will I need a coat?") --
// not a bare day word ("what should I cook tonight?").
export function ruleRewrite(text, ctx, { followUp = true } = {}) {
  if (!ctx) return null;
  const t = text.trim();
  if (!followUp && !(ctx.kind === 'weather' && WEATHERISH.test(t))) return null;
  // Changing the original question ("...25% instead?", "what if it was...") isn't a rule's job -- the model rewrites it.
  if (/\binstead\b|\b(what )?if (it|that|they|the \w+) (was|were|is|had)\b/i.test(t)) return null;
  const short = t.split(/\s+/).length <= 5;
  if (ctx.kind === 'weather' && ctx.place) {
    const newPlace = /\b(?:in|at|for)\s+([A-Z][\p{L}'’.-]*(?:[\s-]+[A-Z][\p{L}'’.-]*)*)/u.exec(t)
      || (short ? /^\s*(?:and|what about|how about)\s+([A-Z][\p{L}'’.-]*(?:[\s-]+[A-Z][\p{L}'’.-]*)*)/u.exec(t) : null); // "what about Glasgow?"
    const day = (DAYWORDS.exec(t) || DAYWORDS.exec(ctx.text || '') || [''])[0];
    if (newPlace && !DAYWORDS.test(newPlace[1])) return 'Weather in ' + newPlace[1] + (day ? ' ' + day : '') + '?';
    if (DAYWORDS.test(t) || WEATHERISH.test(t)) return 'Weather in ' + ctx.place + (day ? ' ' + day : '') + (/umbrella/i.test(t) ? ' — do I need an umbrella' : '') + '?';
  }
  if (ctx.kind === 'currency' && ctx.from && ctx.to) {
    if (/\b(the )?other way( round| around)?\b|\breverse\b/i.test(t)) return '1 ' + ctx.to + ' in ' + ctx.from + '?';
    const cur = /\b(?:in|into|to)\s+(.+?)\??$/i.exec(strip(t));
    const amount = /([£€$¥]?)\s?(\d[\d,]*(?:\.\d+)?)(\s?(k|thousand|million))?/.exec(t);
    if (!short) return null; // "how much would 3 of those be?" is not a new amount -- the model rewrites it
    if (cur && !amount) return ctx.amount + ' ' + ctx.from + ' in ' + cur[1] + '?';
    if (amount && !cur) return (amount[1] || '') + amount[2] + (amount[3] || '') + (amount[1] ? '' : ' ' + ctx.from) + ' in ' + ctx.to + '?';
    if (amount && cur) return (amount[1] || '') + amount[2] + (amount[1] ? '' : ' ' + ctx.from) + ' in ' + cur[1] + '?';
  }
  if (ctx.kind === 'compute' && ctx.result != null && /^-?\d+(\.\d+)?$/.test(String(ctx.result))) {
    const v = String(ctx.result);
    if (/^\s*(double|twice)\b/i.test(t) || /\b(double|twice) (it|that|the (answer|result|total))\b/i.test(t)) return 'What is ' + v + ' × 2?';
    if (/^\s*(half|halve)\b/i.test(t) || /\bhalf (of )?(it|that|the (answer|result|total))\b/i.test(t)) return 'What is ' + v + ' ÷ 2?';
    if (/^\s*triple\b/i.test(t)) return 'What is ' + v + ' × 3?';
    const ref = /\b(that|it|the (answer|result|total)|this)\b/i;
    if (ref.test(t) && /\b(plus|minus|times|divided|multiply|multiplied|add|subtract|take away|off|percent|squared|cubed|root|of)\b|[%+×*\/-]|\d/i.test(t)) {
      const s = strip(t).replace(ref, v);
      return s.charAt(0).toUpperCase() + s.slice(1) + '?';
    }
  }
  return null;
}

// --- model rewrite, checked
export const PROMPT_FOLLOWUP = 'Rewrite the user\'s latest message as ONE standalone question that makes sense without the conversation. '
  + 'Use the conversation only to fill in what words like "it", "that", "there", "and…?" or missing details refer to. Do NOT answer it. '
  + 'Keep every number from the latest message; take any other numbers only from the conversation. Reply as JSON.';
export const FOLLOWUP_SCHEMA = { type: 'object', properties: { standalone: { type: 'string' } }, required: ['standalone'] };

const nums = (s) => (String(s).replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []).map(Number);
export function checkStandalone(text, standalone, context) {
  if (!standalone || typeof standalone !== 'string') return 'no rewrite';
  if (standalone.length > text.length * 4 + 300) return 'rewrite too long';
  const got = nums(standalone), allowed = [...nums(text), ...nums(context)];
  for (const n of nums(text)) if (!got.some((x) => Math.abs(x - n) < 1e-9)) return 'dropped the number ' + n;
  for (const n of got) if (!allowed.some((x) => Math.abs(x - n) < 1e-9)) return 'invented the number ' + n;
  return null;
}
export function historyText(turns) {
  return turns.map((m) => (m.role === 'user' ? 'User: ' : 'Assistant: ') + String(m.content).replace(/\s+/g, ' ').slice(0, 600)).join('\n');
}
export async function modelRewrite(text, turns, oneShot) {
  const context = historyText(turns);
  let raw = '';
  try {
    raw = await oneShot(PROMPT_FOLLOWUP, 'Conversation:\n' + context + '\n\nLatest message: ' + text, FOLLOWUP_SCHEMA);
    const s = String(JSON.parse((/\{[\s\S]*\}/.exec(raw) || [raw])[0]).standalone || '').trim();
    const problem = checkStandalone(text, s, context);
    return problem ? { problem, rejected: s } : { standalone: s };
  } catch (e) { return { problem: 'no usable rewrite (' + String(e.message || e).slice(0, 60) + ')', rejected: String(raw).slice(0, 200) }; }
}
