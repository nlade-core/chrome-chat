// Currency conversion with European Central Bank reference rates via Frankfurter
// (free, no key, CORS-open). Plain code parses the amount and currencies,
// fetches the rate and does the multiplication -- no model involved. Only the
// two currency codes are sent. ECB rates are daily mid-market reference rates,
// not what a bank or card will charge; the answer says so and gives the date.
const SYMBOLS = { '£': 'GBP', '€': 'EUR', '$': 'USD', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₺': 'TRY', '₪': 'ILS', '฿': 'THB' };
// Longest names first so "australian dollars" wins over "dollars".
const NAMES = [
  ['australian dollars?|aussie dollars?', 'AUD'], ['canadian dollars?', 'CAD'], ['new zealand dollars?|kiwi dollars?', 'NZD'], ['hong kong dollars?', 'HKD'],
  ['singapore dollars?', 'SGD'], ['us dollars?|american dollars?|u\\.s\\. dollars?', 'USD'], ['swiss francs?', 'CHF'], ['south african rand', 'ZAR'],
  ['brazilian reais|brazilian real', 'BRL'], ['mexican pesos?', 'MXN'], ['philippine pesos?', 'PHP'], ['swedish kronor|swedish krona', 'SEK'],
  ['norwegian kroner|norwegian krone', 'NOK'], ['danish kroner|danish krone', 'DKK'], ['czech korun[ay]|koruna', 'CZK'], ['japanese yen', 'JPY'],
  ['pounds? sterling|pounds?|sterling|quid|gbp', 'GBP'], ['euros?', 'EUR'], ['dollars?|bucks', 'USD'], ['yen', 'JPY'], ['rupees?', 'INR'], ['yuan|renminbi', 'CNY'],
  ['francs?', 'CHF'], ['zloty|zlotys', 'PLN'], ['forints?', 'HUF'], ['rand', 'ZAR'], ['won', 'KRW'], ['lira', 'TRY'], ['shekels?', 'ILS'], ['baht', 'THB'],
  ['kronor|krona', 'SEK'], ['kroner|krone', 'NOK'], ['ringgit', 'MYR'], ['rupiah', 'IDR'], ['leu|lei', 'RON'], ['krona icelandic', 'ISK'],
];
const CODES = 'AUD BGN BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR'.split(' ');
const CODE_RE = new RegExp('\\b(' + CODES.join('|') + ')\\b', 'i');
const NAME_RE = new RegExp('\\b(' + NAMES.map(([n]) => n).join('|') + ')\\b', 'gi');

// Every currency mention, in order, with position and any amount right next to it.
function mentions(text) {
  const out = [];
  for (const m of text.matchAll(/([£€$¥₹₩₺₪฿])\s?(\d[\d,]*(?:\.\d+)?)(\s?(k|m|bn|thousand|million))?/g)) out.push({ at: m.index, end: m.index + m[0].length, code: SYMBOLS[m[1]], amount: amt(m[2], m[4]), symbol: m[1] });
  for (const m of text.matchAll(new RegExp('(\\d[\\d,]*(?:\\.\\d+)?)(\\s?(k|m|bn|thousand|million))?\\s?' + CODE_RE.source, 'gi'))) out.push({ at: m.index, end: m.index + m[0].length, code: m[4].toUpperCase(), amount: amt(m[1], m[3]) });
  for (const m of text.matchAll(new RegExp('(\\d[\\d,]*(?:\\.\\d+)?)(\\s?(k|m|bn|thousand|million))?\\s?(' + NAMES.map(([n]) => n).join('|') + ')\\b', 'gi'))) out.push({ at: m.index, end: m.index + m[0].length, code: nameCode(m[4]), amount: amt(m[1], m[3]), name: m[4] });
  const taken = (i) => out.some((o) => i >= o.at && i < o.end); // inside a mention already found (an amount + its currency)
  for (const m of text.matchAll(new RegExp(CODE_RE.source, 'gi'))) if (!taken(m.index)) out.push({ at: m.index, code: m[1].toUpperCase() });
  for (const m of text.matchAll(NAME_RE)) if (!taken(m.index)) out.push({ at: m.index, code: nameCode(m[1]), name: m[1] });
  for (const m of text.matchAll(/[£€$¥₹₩₺₪฿](?!\s?\d)/g)) if (!taken(m.index)) out.push({ at: m.index, code: SYMBOLS[m[0]], symbol: m[0] });
  return out.sort((a, b) => a.at - b.at);
}
const amt = (n, mult) => Number(n.replace(/,/g, '')) * ({ k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9 }[(mult || '').toLowerCase()] || 1);
const nameCode = (n) => { const l = n.toLowerCase(); const hit = NAMES.find(([re]) => new RegExp('^(' + re + ')$', 'i').test(l)); return hit ? hit[1] : null; };

export const matchesCurrency = (text) => {
  // "pounds" as weight, and units that aren't money
  if (/\b(stones?|kg|kilo(gram)?s?|weigh\w*|lbs?|ounces?|oz|grams?|miles?|km|kilomet\w*|feet|foot|inch\w*|metres?|meters?)\b/i.test(text) && !/[£€$¥]|\b(GBP|EUR|USD)\b/.test(text)) return false;
  const ms = mentions(text).filter((m) => m.code);
  if (!ms.length) return false;
  // Arithmetic about money is Python's job, not a conversion: "a £240 jacket reduced by 17%... in pounds", "3 of the €58.11".
  if (/%|\bper ?cent\b|\b(reduced|discount\w*|off|plus|minus|times|multipl\w*|divided|each|of the|of those|total|sum|average|split|share|tax|vat|interest|tip)\b|[×*÷]/i.test(text)) return false;
  const codes = new Set(ms.map((m) => m.code));
  if (/\b(exchange )?rate\b/i.test(text)) return true;
  if (codes.size >= 2) return /\b(convert|conversion|in|into|to|as|worth|how much|how many|exchange|equals?|is)\b/i.test(text);
  // One currency: a short conversion to your home currency ("how much is 100 dollars?").
  return ms.some((m) => m.amount != null) && text.trim().split(/\s+/).length <= 8 && /\b(convert|in|into|worth|how much|how many)\b/i.test(text);
};

export function parseCurrency(text, home) {
  const ms = mentions(text).filter((m) => m.code);
  const assumptions = [];
  let from, to, amount;
  const withAmt = ms.find((m) => m.amount != null);
  // The target: a currency right after "in / into / to / as", else the other mention.
  const tgt = [...text.matchAll(/\b(?:in|into|to|as)\s+(?:(?:us|u\.s\.)\s+)?/gi)].map((m) => ms.find((x) => x.at >= m.index + m[0].length - 1 && x.at <= m.index + m[0].length + 1)).find(Boolean);
  if (withAmt) { from = withAmt.code; amount = withAmt.amount; }
  if (tgt && tgt !== withAmt) to = tgt.code;
  if (!to) to = (ms.find((m) => m !== withAmt && m.code !== from) || {}).code;
  if (!from) { const other = ms.find((m) => m.code !== to); from = other ? other.code : null; }
  if (amount == null) { amount = 1; }
  if (!from && home.currency) { from = home.currency; assumptions.push('Converting from ' + from + ' — ' + home.currencySource + '.'); }
  if (!to && home.currency && home.currency !== from) { to = home.currency; assumptions.push('Converting to ' + to + ' — ' + home.currencySource + '.'); }
  if (ms.some((m) => m.symbol === '$') || ms.some((m) => m.name && /^(dollars?|bucks)$/i.test(m.name))) assumptions.push('"$" / "dollars" read as US dollars.');
  if (ms.some((m) => m.name && /^(kroner|krone)$/i.test(m.name))) assumptions.push('"kroner" read as Norwegian kroner.');
  return { from, to, amount, assumptions };
}

const money = (x, code, lang) => { try { return new Intl.NumberFormat(lang || 'en-GB', { style: 'currency', currency: code }).format(x); } catch { return x.toFixed(2) + ' ' + code; } };

export async function runCurrency(text, home, fetchFn = fetch) {
  const p = parseCurrency(text, home);
  if (!p.from || !p.to) return { error: 'Which currencies? Say for example "£50 in euros".' };
  if (p.from === p.to) return { error: 'That’s the same currency (' + p.from + ') — convert to what?' };
  const r = await (await fetchFn('https://api.frankfurter.dev/v1/latest?base=' + p.from + '&symbols=' + p.to)).json();
  const rate = r && r.rates && r.rates[p.to];
  if (!rate) return { error: 'No ECB rate for ' + p.from + ' to ' + p.to + ' (the ECB publishes about 30 currencies).' };
  const result = Math.round(p.amount * rate * 100) / 100;
  const when = new Date(r.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    kind: 'currency', assumptions: p.assumptions, from: p.from, to: p.to, amount: p.amount, rate, date: r.date, result,
    answer: money(p.amount, p.from, home.lang) + ' is about ' + money(result, p.to, home.lang) + ' (1 ' + p.from + ' = ' + rate + ' ' + p.to + ', ECB reference rate for ' + when + ').',
    source: 'European Central Bank reference rate for ' + when + ' via Frankfurter — a mid-market rate, not what a bank or card will charge',
    sourceUrl: 'https://www.frankfurter.dev/',
  };
}
