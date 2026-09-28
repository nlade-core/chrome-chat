// What the page can know about the user without asking: a saved home place and
// currency (About panel), else inferred from the browser -- the time zone for a
// rough place, the language's region for currency and units. Every inferred
// value carries where it came from, so answers can say "from your time zone".
const STORE = 'chrome-chat-home';

// Region -> currency, for the regions a browser locale commonly reports.
const REGION_CURRENCY = {
  GB: 'GBP', IE: 'EUR', US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', HK: 'HKD', SG: 'SGD', IN: 'INR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', IS: 'ISK', TR: 'TRY',
  ZA: 'ZAR', MX: 'MXN', BR: 'BRL', KR: 'KRW', IL: 'ILS', TH: 'THB', MY: 'MYR', PH: 'PHP', ID: 'IDR',
  FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR',
  SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
};

export function loadHome() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
export function saveHome(h) { try { localStorage.setItem(STORE, JSON.stringify(h)); } catch {} }

export function homeContext(env = {}) {
  const saved = env.saved || loadHome();
  const tz = env.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const lang = env.language || (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
  let region = '';
  try { region = new Intl.Locale(lang).maximize().region || ''; } catch {}
  const tzCity = /\//.test(tz) ? tz.split('/').pop().replace(/_/g, ' ') : '';
  return {
    place: saved.place || tzCity || null,
    placeSource: saved.place ? 'your saved location' : tzCity ? 'your time zone (' + tz + ')' : null,
    currency: saved.currency || REGION_CURRENCY[region] || null,
    currencySource: saved.currency ? 'your saved currency' : REGION_CURRENCY[region] ? 'your browser’s region (' + lang + ')' : null,
    region, lang,
    fahrenheit: region === 'US',
  };
}
