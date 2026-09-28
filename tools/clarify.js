// Asking the user, rarely: plain code detects a specific fork the answer depends
// on, and offers the options as one-tap buttons -- the likely one first. A choice
// that's a preference (date order) is remembered, so it's never asked twice.
// Each option: { label, text } -- the question rewritten unambiguously, which is
// then answered as usual (so the transcript shows exactly what was answered) --
// plus optional { remember } (a preference) or { other } (fill the input instead).
const PREFS = 'chrome-chat-prefs';
export function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } }
export function savePrefs(p) { try { localStorage.setItem(PREFS, JSON.stringify({ ...loadPrefs(), ...p })); } catch {} }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Currency names that mean more than one currency.
const AMBIG_CURRENCY = [
  { re: /\b(kroner|krone)\b/i, not: /\b(norwegian|danish)\b/i, q: '“Kroner” — which currency?', options: [['Norwegian kroner (NOK)', 'NOK'], ['Danish kroner (DKK)', 'DKK']] },
  { re: /\b(kronor|krona)\b/i, not: /\b(swedish|icelandic)\b/i, q: '“Krona” — which currency?', options: [['Swedish kronor (SEK)', 'SEK'], ['Icelandic krónur (ISK)', 'ISK']] },
  { re: /\bpesos?\b/i, not: /\b(mexican|philippine)\b/i, q: '“Pesos” — which currency?', options: [['Mexican pesos (MXN)', 'MXN'], ['Philippine pesos (PHP)', 'PHP']] },
];

// Returns { question, options } or null. `prefs` holds remembered choices.
export function detectClarify(text, prefs = loadPrefs()) {
  // 1. An all-numbers date where day and month could swap: 3/4/2027.
  const d = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(text);
  if (d) {
    const a = Number(d[1]), b = Number(d[2]);
    const y = d[3].length === 2 ? '20' + d[3] : d[3];
    if (a >= 1 && b >= 1 && a <= 12 && b <= 12 && a !== b && !prefs.dateOrder) {
      const uk = a + ' ' + MONTHS[b - 1] + ' ' + y, us = b + ' ' + MONTHS[a - 1] + ' ' + y;
      return { question: 'Is ' + d[0] + ' ' + uk + ' or ' + us + '?', options: [
        { label: uk + ' (day/month — UK)', text: text.replace(d[0], uk), remember: { dateOrder: 'dmy' } },
        { label: us + ' (month/day — US)', text: text.replace(d[0], us), remember: { dateOrder: 'mdy' } },
      ] };
    }
  }
  // 2. A currency name that could be two currencies.
  for (const c of AMBIG_CURRENCY) {
    const m = c.re.exec(text);
    if (m && !c.not.test(text)) return { question: c.q, options: c.options.map(([label, code]) => ({ label, text: text.replace(m[0], code) })) };
  }
  return null;
}

// Applies a remembered date order silently-but-stated: "3/4/2027" -> "3 April 2027".
export function applyDatePref(text, prefs = loadPrefs()) {
  const d = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(text);
  if (!d || !prefs.dateOrder) return { text, note: null };
  const a = Number(d[1]), b = Number(d[2]);
  if (a > 12 || b > 12 || a === b) return { text, note: null };
  const y = d[3].length === 2 ? '20' + d[3] : d[3];
  const [day, mon] = prefs.dateOrder === 'dmy' ? [a, b] : [b, a];
  const iso = day + ' ' + MONTHS[mon - 1] + ' ' + y;
  return { text: text.replace(d[0], iso), note: d[0] + ' read as ' + iso + ' (' + (prefs.dateOrder === 'dmy' ? 'day/month' : 'month/day') + ', as you chose before).' };
}
