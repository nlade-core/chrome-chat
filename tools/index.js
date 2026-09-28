// Live-data tools. Plain code picks at most one per message, in a fixed order,
// before the compute path and the plain chat; the model never chooses among
// tools and its prompt never grows with them. Each tool: matches(text) and
// run(text, home) -> { kind, answer, source, sourceUrl, assumptions } | { error }.
import { matchesWeather, runWeather } from './weather.js';
import { matchesCurrency, runCurrency } from './currency.js';
import { homeContext } from './context.js';

export const TOOLS = [
  { kind: 'currency', icon: '💱', label: 'Currency', matches: matchesCurrency, run: runCurrency },
  { kind: 'weather', icon: '🌦', label: 'Weather', matches: matchesWeather, run: runWeather },
];

// A short follow-up to a tool answer ("and tomorrow?", "and in dollars?") reuses
// that tool with the earlier question's details, rather than letting the plain
// model guess the weather.
const FOLLOW = /^\s*(and|what about|how about)\b|^\s*(tomorrow|today|tonight|this weekend|the weekend|on \w+day)\??\s*$/i;
export function pickTool(text, previous) {
  for (const t of TOOLS) if (t.matches(text)) return { tool: t, text };
  if (previous && previous.kind && FOLLOW.test(text) && text.length < 60) {
    const t = TOOLS.find((x) => x.kind === previous.kind);
    if (t) {
      const merged = t.kind === 'weather' ? 'weather ' + (previous.place ? 'in ' + previous.place + ' ' : '') + text.replace(/^\s*(and|what about|how about)\s*/i, '')
        : previous.from ? previous.amount + ' ' + previous.from + ' ' + text.replace(/^\s*(and|what about|how about)\s*/i, '') : null;
      if (merged && t.matches(merged)) return { tool: t, text: merged, followUp: true };
    }
  }
  return null;
}

export async function runTool(pick, fetchFn) {
  const home = homeContext();
  try { return await pick.tool.run(pick.text, home, fetchFn); }
  catch (e) { return { error: pick.tool.label + ' service unreachable (' + String(e.message || e).slice(0, 80) + ').' }; }
}
export { homeContext };
