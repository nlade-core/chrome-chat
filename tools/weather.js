// Weather from Open-Meteo (free, no key, CORS-open): place name -> coordinates
// (geocoding API) -> forecast. The answer is written by plain code from the
// numbers -- no model involved, so no number can be made up. Only the place name
// (then its coordinates) is sent.
const WEATHER = /\b(weather|forecast|rain(s|ing|y)?|snow(s|ing|y)?|sunny|sunshine|temperature|how (hot|cold|warm)|umbrella|windy|frost(y)?|storm(s|y)?)\b/i;
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const STOP = new Set(['the', 'this', 'next', 'weekend', 'today', 'tomorrow', 'tonight', 'now', 'celsius', 'fahrenheit', 'general', 'london time', 'my area', 'here', 'there', ...DAYS]);

const WMO = { 0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'heavy freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow',
  73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with heavy hail' };

export const matchesWeather = (text) => WEATHER.test(text) && !/\bunder the weather\b|\brain ?man\b|\bweather(ed|ing)? the\b|\bpurple rain\b/i.test(text);

// Place and day from the question. Place: "in/at/for/near <Place>" (capitalised
// words, or lowercase up to a time word / punctuation). Day: today by default.
export function parseWeather(text) {
  let place = null;
  const cap = /\b(?:in|at|for|near|around)\s+([A-Z][\p{L}'’.-]*(?:[\s-]+(?:[A-Z][\p{L}'’.-]*|upon|on|de|la|le|am|sur|en))*)/u.exec(text);
  if (cap) place = cap[1].trim().replace(new RegExp('\\s+(?:on\\s+|this\\s+|next\\s+)?(?:' + DAYS.join('|') + '|weekend|week)\\b.*$', 'i'), ''); // "Stoke-on-Trent on Friday" -> Stoke-on-Trent
  else {
    const low = /\b(?:in|at|for|near)\s+([a-z][a-z'’ -]{1,30}?)(?=\s+(?:today|tomorrow|tonight|this|on|next|at|now|over)\b|[?.!,]|$)/i.exec(text);
    if (low && !STOP.has(low[1].trim().toLowerCase())) place = low[1].trim();
  }
  if (place && STOP.has(place.toLowerCase())) place = null;
  const t = text.toLowerCase();
  let day = { kind: 'today' };
  if (/\b(right )?now\b|\bat the moment\b|\bcurrently\b/.test(t)) day = { kind: 'now' };
  else if (/\btonight\b/.test(t)) day = { kind: 'today' };
  else if (/\btomorrow\b/.test(t)) day = { kind: 'offset', n: 1 };
  else if (/\b(this )?weekend\b/.test(t)) day = { kind: 'weekend' };
  else { const d = DAYS.find((w) => new RegExp('\\b' + w + '\\b').test(t)); if (d) day = { kind: 'weekday', name: d }; }
  return { place, day };
}

const fmtT = (c, f) => (f ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C');
const dayName = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export async function runWeather(text, home, fetchFn = fetch) {
  const q = parseWeather(text);
  const assumptions = [];
  let name = q.place;
  if (!name) {
    if (!home.place) return { error: 'Which place? Say "weather in <town>", or set your location in About.' };
    name = home.place; assumptions.push('Weather for ' + name + ' — from ' + home.placeSource + '. Say "weather in <town>" or set your location in About to change it.');
  }
  const geo = await (await fetchFn('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(name))).json();
  const g = geo.results && geo.results[0];
  if (!g) return { error: 'Couldn’t find a place called "' + name + '".' };
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + g.latitude + '&longitude=' + g.longitude
    + '&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum'
    + '&timezone=auto&forecast_days=7&wind_speed_unit=mph';
  const w = await (await fetchFn(url)).json();
  if (!w.daily) return { error: 'The forecast service didn’t answer.' };
  const f = home.fahrenheit;
  const where = [g.name, g.admin1, g.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ');
  const d = w.daily;
  const line = (i) => dayName(d.time[i]) + ': ' + (WMO[d.weather_code[i]] || 'mixed') + ', ' + fmtT(d.temperature_2m_min[i], f) + ' to ' + fmtT(d.temperature_2m_max[i], f)
    + ', ' + d.precipitation_probability_max[i] + '% chance of rain' + (d.precipitation_sum[i] >= 0.1 ? ' (' + d.precipitation_sum[i] + ' mm)' : '') + '.';
  let answer;
  if (q.day.kind === 'now') {
    const c = w.current;
    answer = 'Now in ' + where + ': ' + (WMO[c.weather_code] || 'mixed') + ', ' + fmtT(c.temperature_2m, f) + ' (feels like ' + fmtT(c.apparent_temperature, f) + '), wind ' + Math.round(c.wind_speed_10m) + ' mph.';
  } else {
    let idx = [0];
    if (q.day.kind === 'offset') idx = [q.day.n];
    if (q.day.kind === 'weekday') { const i = d.time.findIndex((t) => DAYS[new Date(t + 'T12:00:00').getDay()] === q.day.name); if (i >= 0) idx = [i]; else return { error: 'The forecast only goes 7 days ahead.' }; }
    if (q.day.kind === 'weekend') idx = d.time.map((t, i) => [new Date(t + 'T12:00:00').getDay(), i]).filter(([wd]) => wd === 6 || wd === 0).map(([, i]) => i).slice(0, 2);
    answer = where + ' — ' + idx.map(line).join(' ');
    if (q.day.kind === 'today') answer += ' Right now ' + fmtT(w.current.temperature_2m, f) + ', ' + (WMO[w.current.weather_code] || 'mixed') + '.';
    if (/umbrella/i.test(text)) answer += idx.some((i) => d.precipitation_probability_max[i] >= 50) ? ' Worth taking an umbrella.' : ' Probably no umbrella needed.';
  }
  return {
    kind: 'weather', answer, assumptions, place: g.name,
    source: 'Open-Meteo forecast for ' + where + ' (' + g.latitude.toFixed(2) + ', ' + g.longitude.toFixed(2) + '), fetched ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    sourceUrl: 'https://open-meteo.com/',
  };
}
