// Compute lab: can the on-device model reason, write a little Python, and let
// the page run it -- for letters, sums and dates, the things it gets wrong in
// its head? Shared by the lab page (Gemini Nano + Pyodide) and the stand-in
// runner (eval/compute.mjs: Ollama + local python3), so both score the same way.
//
// The cases were written before any run of this pipeline. `code: true` means
// the question needs computing; `code: false` ones are near-misses that should
// be answered directly (using code there is a false trigger).

const WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const day = (d) => ({ text: [d], not: WD.filter((w) => w !== d) });
const date = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][m - 1];
  return { text: [iso, d + ' ' + mon + ' ' + y, mon + ' ' + d + ', ' + y, mon + ' ' + String(d).padStart(2, '0') + ', ' + y] };
};

export const CASES = [
  { id: 1, code: true, q: 'How many times does the letter r appear in "strawberry"?', num: 3 },
  { id: 2, code: true, q: 'How many times does the letter s appear in "Mississippi"?', num: 4 },
  { id: 3, code: true, q: 'How many times does the letter e appear in "excellence"?', num: 4 },
  { id: 4, code: true, q: 'How many letters are in the word "antidisestablishmentarianism"?', num: 28 },
  { id: 5, code: true, q: 'What is 4817 × 2953?', num: 14224601 },
  { id: 6, code: true, q: 'What is 17% of 240?', num: 40.8 },
  { id: 7, code: true, q: 'A £240 jacket is reduced by 17%. What is the new price in pounds?', num: 199.2 },
  { id: 8, code: true, q: 'I have 3 boxes of 12 eggs and break 5. How many eggs are left?', num: 31 },
  { id: 9, code: true, q: 'What is 2 to the power of 64?', num: 18446744073709551616n },
  { id: 10, code: true, q: 'What is 1 divided by 7, to 5 decimal places?', text: ['0.14286'] },
  { id: 11, code: true, q: 'A train leaves at 14:35 and the journey takes 2 hours 50 minutes. What time does it arrive?', text: ['17:25', '5:25'] },
  { id: 12, code: true, q: 'What day of the week is 100 days after Sunday 27 September 2026?', ...day('tuesday') },
  { id: 13, code: true, q: 'What date is 45 days before 1 March 2027?', ...date('2027-01-15') },
  { id: 14, code: true, q: 'How many days are there between 27 September 2026 and 25 December 2026?', num: 89 },
  { id: 15, code: true, q: 'What day of the week was 14 July 1789?', ...day('tuesday') },
  { id: 16, code: true, q: 'What date is 3 weeks after 20 December 2026?', ...date('2027-01-10') },
  { id: 17, code: true, q: 'What date is the day after 28 February 2028?', ...date('2028-02-29') },
  { id: 18, code: true, q: 'How many weekdays (Monday to Friday) are there in December 2026?', num: 23 },
  { id: 19, code: false, q: 'What is the capital of Canada?', text: ['ottawa'] },
  { id: 20, code: false, q: 'Who wrote Pride and Prejudice?', text: ['austen'] },
  { id: 21, code: false, q: 'How many legs does a spider have?', num: 8 },
  { id: 22, code: false, q: 'What is the boiling point of water at sea level, in degrees Celsius?', num: 100 },
  { id: 23, code: false, q: 'Translate "good morning" into French.', text: ['bonjour'] },
  { id: 24, code: false, q: 'Rewrite "the meeting is moved to thursday" as a polite one-sentence email line.', text: ['thursday'] },
  // Added with typed answers (2026-09-27, before any typed run): computations whose
  // answer type the plain-code rules can't infer, so the model's own declared type is exercised.
  { id: 25, code: true, q: 'Is 2027 a leap year?', text: ['no', 'false'], not: ['yes', 'true'] },
  { id: 26, code: true, q: 'Sort these numbers from smallest to largest: 42, 7, 19, 3.', compact: '3,7,19,42' },
  { id: 27, code: true, q: 'What is the average of 12, 15 and 27?', num: 18 },
  { id: 28, code: true, q: 'Spell the word "necessary" backwards.', text: ['yrassecen'] },
  { id: 29, code: true, q: 'What is 15% of 80, plus 7?', num: 19 },
  // HELD-OUT (2026-09-28 00:05): written and committed before the next fixes, after
  // four rounds of changes tuned on 1-29. Run once per model with the pipeline
  // frozen; never tuned on. 46 deliberately has no digit or quoted word, to test
  // whether the plain-code gate lets it through.
  { id: 30, held: true, code: true, q: 'How many times does the letter a appear in "banana"?', num: 3 },
  { id: 31, held: true, code: true, q: 'How many letters are in the word "rhythm"?', num: 6 },
  { id: 32, held: true, code: true, q: 'What is 356 × 47?', num: 16732 },
  { id: 33, held: true, code: true, q: 'What is 12.5% of 360?', num: 45 },
  { id: 34, held: true, code: true, q: 'An £85 meal has a 12% service charge added. What is the total in pounds?', num: 95.2 },
  { id: 35, held: true, code: true, q: 'I buy 4 packs of 6 rolls and eat 7. How many rolls are left?', num: 17 },
  { id: 36, held: true, code: true, q: 'What is 3 to the power of 20?', num: 3486784401 },
  { id: 37, held: true, code: true, q: 'What is 22 divided by 7, to 3 decimal places?', text: ['3.143'] },
  { id: 38, held: true, code: true, q: 'A film starts at 19:40 and lasts 2 hours 35 minutes. What time does it end?', text: ['22:15', '10:15'] },
  { id: 39, held: true, code: true, q: 'What day of the week is 60 days after Monday 5 October 2026?', ...day('friday') },
  { id: 40, held: true, code: true, q: 'What date is 90 days after 15 January 2027?', ...date('2027-04-15') },
  { id: 41, held: true, code: true, q: 'How many days are there between 1 January 2027 and 1 June 2027?', num: 151 },
  { id: 42, held: true, code: true, q: 'Is 2032 a leap year?', text: ['yes', 'true'], not: ['no', 'false'] },
  { id: 43, held: true, code: false, q: 'What is the capital of Australia?', text: ['canberra'] },
  { id: 44, held: true, code: false, q: 'How many continents are there?', num: 7 },
  { id: 45, held: true, code: false, q: 'Translate "thank you" into Spanish.', text: ['gracias'] },
  { id: 46, held: true, code: true, q: 'Sort these words alphabetically: pear, apple, mango.', compact: 'apple,mango,pear' },
  { id: 47, held: true, code: true, q: 'What is the average of 4, 9 and 20?', num: 11 },
  // HELD-OUT 2 (2026-09-28 00:50): committed before the blind-spot fixes
  // (percentages as fractions, clock times, sort/order in the gate, numbered
  // lists in the scorer) -- aimed at them, plus a general mix. Run once per model.
  { id: 48, held: 2, code: true, q: 'What is 7.5% of 240?', num: 18 },
  { id: 49, held: 2, code: true, q: 'What is 35% of 60?', num: 21 },
  { id: 50, held: 2, code: true, q: 'A £120 coat is reduced by 15%. What is the new price in pounds?', num: 102 },
  { id: 51, held: 2, code: true, q: 'A meeting starts at 09:50 and lasts 1 hour 25 minutes. What time does it end?', text: ['11:15'] },
  { id: 52, held: 2, code: true, q: 'A flight departs at 22:30 and takes 3 hours 45 minutes. What time does it land, in the same time zone?', text: ['02:15', '2:15'] },
  { id: 53, held: 2, code: true, q: 'What time is it 4 hours 50 minutes after 11:20?', text: ['16:10', '4:10'] },
  { id: 54, held: 2, code: true, q: 'Sort these words alphabetically: kiwi, banana, cherry.', compact: 'banana,cherry,kiwi' },
  { id: 55, held: 2, code: true, q: 'Put these numbers in order from largest to smallest: 8, 23, 15, 4.', compact: '23,15,8,4' },
  { id: 56, held: 2, code: true, q: 'Arrange these names alphabetically: Zoe, Adam, Mia.', compact: 'adam,mia,zoe' },
  { id: 57, held: 2, code: true, q: 'How many times does the letter o appear in "chocolate"?', num: 2 },
  { id: 58, held: 2, code: true, q: 'What is 918 × 64?', num: 58752 },
  { id: 59, held: 2, code: true, q: 'What day of the week will 1 January 2030 be?', ...day('tuesday') },
  { id: 60, held: 2, code: true, q: 'How many days are there between 14 February 2027 and 1 May 2027?', num: 76 },
  { id: 61, held: 2, code: false, q: 'What is the capital of Japan?', text: ['tokyo'] },
  { id: 62, held: 2, code: false, q: 'Who painted the Mona Lisa?', text: ['leonardo', 'da vinci'] },
  // PROBE (2026-09-28 00:50): problem types not covered yet, to find what breaks
  // next -- no claims, no tuning. 63's answer depends on the day it's run (the
  // model has no clock); 64 needs remembered facts, then arithmetic, and has no
  // digit (the gate won't offer code); 71 is ambiguous (3 April UK / 4 March US).
  { id: 63, probe: true, code: true, q: 'How many days are there until Christmas Day this year?', numFn: () => { const n = new Date(), x = new Date(n.getFullYear(), 11, 25); return Math.round((x - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); } },
  { id: 64, probe: true, code: true, q: 'How many years before the first Moon landing did the Titanic sink?', num: 57 },
  { id: 65, probe: true, code: true, q: 'Convert 5 miles to kilometres, to 2 decimal places.', text: ['8.05'] },
  { id: 66, probe: true, code: true, q: 'What is 100 degrees Fahrenheit in Celsius, to 1 decimal place?', text: ['37.8'] },
  { id: 67, probe: true, code: true, q: 'If I invest £1,000 at 5% interest compounded annually, how much will I have after 3 years, in pounds?', text: ['1157.63', '1157.62', '1,157.63', '1,157.62'] },
  { id: 68, probe: true, code: true, q: 'What is 3/8 plus 1/4, as a fraction?', text: ['5/8'] },
  { id: 69, probe: true, code: true, q: 'What is -15 plus 8 times 3?', num: 9 },
  { id: 70, probe: true, code: true, q: 'How many words are in this sentence: "The quick brown fox jumps over the lazy dog"?', num: 9 },
  { id: 71, probe: true, code: true, q: 'If today is 3/4/2027, what date will it be in 10 days?', text: ['2027-04-13', '2027-03-14', '13 april 2027', '14 march 2027', 'april 13, 2027', 'march 14, 2027'] },
  { id: 72, probe: true, code: true, q: 'What is 1,000,000 divided by 3, rounded to the nearest whole number?', num: 333333 },
  { id: 73, probe: true, code: true, q: 'A recipe for 4 people uses 300 g of flour. How much flour is needed for 6 people, in grams?', num: 450 },
  // WORDS (2026-09-28, discovery -- committed before any run, no tuning): longer
  // problems mixing words and numbers. Expected trouble, written down first:
  // irrelevant numbers (75, 85 -- the values check demands every number be used),
  // numbers as words (76, 86 -- no digit, so the gate never offers Python),
  // two-part answers (81, 84 -- `all`: every part must appear), a classic trap (83),
  // chained percentages (79), VAT inside prices (82), and half-up money rounding
  // (77: the true 32.045 is £32.05; Python's float formatting gives 32.04 -- both accepted).
  { id: 74, words: true, code: true, q: 'A café sells coffee at £2.80 and cake at £3.50. How much do 3 coffees and 2 cakes cost, in pounds?', num: 15.4 },
  { id: 75, words: true, code: true, q: 'Sam is 34 and has 3 children. He buys 4 packs of 12 eggs and uses 17 of them. How many eggs are left?', num: 31 },
  { id: 76, words: true, code: true, q: 'Twelve friends share a bill of one hundred and eighty pounds equally. How much does each pay, in pounds?', num: 15 },
  { id: 77, words: true, code: true, q: 'A car uses 6.5 litres of fuel per 100 km and fuel costs £1.45 a litre. What does a 340 km trip cost in fuel, in pounds?', text: ['32.05', '32.04'] },
  { id: 78, words: true, code: true, q: 'A contractor charges £45 an hour and works from 09:15 to 16:45 with a 30-minute unpaid lunch. What is the pay for the day, in pounds?', num: 315 },
  { id: 79, words: true, code: true, q: 'A £200 jacket is discounted by 20%, then a further 10% is taken off the sale price. What is the final price, in pounds?', num: 144 },
  { id: 80, words: true, code: true, q: 'One tap fills a 120-litre tank in 8 minutes and another fills it in 12 minutes. How many minutes do they take together?', num: 4.8 },
  { id: 81, words: true, code: true, q: 'An invoice dated 14 November 2026 is due 30 days later. On what date, and what day of the week, is it due?', all: [['2026-12-14', '14 december 2026', 'december 14, 2026'], ['monday']] },
  { id: 82, words: true, code: true, q: 'My expenses this month: rent £950, electricity £84.20, broadband £32, phone £18.50, council tax £156. Rent and council tax have no VAT; the other three prices include 20% VAT. How much VAT did I pay in total, in pounds?', num: 22.45 },
  { id: 83, words: true, code: true, q: 'If 5 machines make 5 widgets in 5 minutes, how many minutes would 100 machines take to make 100 widgets?', num: 5 },
  { id: 84, words: true, code: true, q: 'Split £100 between Anna and Ben in the ratio 3:2. How much does each get?', all: [['60'], ['40']] },
  { id: 85, words: true, code: true, q: 'A school trip uses 3 coaches, each carrying 52 pupils, plus 11 teachers. Tickets cost £7.50 per pupil and teachers go free. The trip leaves at 8:30. What is the total ticket cost, in pounds?', num: 1170 },
  { id: 86, words: true, code: true, q: 'My train leaves at half past nine in the morning and the journey takes forty minutes. What time do I arrive?', text: ['10:10'] },
  // MESSY (2026-09-28, committed before the question-resolution step exists):
  // typos, numbers as words, casual phrasing -- what people actually type. 87
  // keeps a correctly spelt quoted word amid typos; 92 and 94 are near-misses.
  { id: 87, messy: true, code: true, q: 'hw many tims dose the leter r apear in "strawberry"', num: 3 },
  { id: 88, messy: true, code: true, q: 'whats 17 percent of two hundred and forty', num: 40.8 },
  { id: 89, messy: true, code: true, q: 'if i leave at quarter to 3 in the afternoon and drive 2 and a half hours when do i get there', text: ['17:15', '5:15'] },
  { id: 90, messy: true, code: true, q: 'wot day of teh week is 25 dec 2026', ...day('friday') },
  { id: 91, messy: true, code: true, q: 'how many days til 1 jan 2027 from 28 sept 2026', num: 95 },
  { id: 92, messy: true, code: false, q: 'capital of frnace?', text: ['paris'] },
  { id: 93, messy: true, code: true, q: 'three hundred and twelve divided by eight', num: 39 },
  { id: 94, messy: true, code: false, q: 'who rote hamlet', text: ['shakespeare'] },
  // STEPS (2026-09-28, committed before the multi-step loop exists): questions
  // where a later step depends on an earlier result. One program can do each of
  // them; whether the model chooses to look at an intermediate result is the finding.
  { id: 95, steps: true, code: true, q: 'Milk costs £1.80 for 2 litres or £2.55 for 3 litres. At the cheaper price per litre, how much would 12 litres cost, in pounds?', num: 10.2 },
  { id: 96, steps: true, code: true, q: 'Plan A costs £12 a month plus 5p per text. Plan B costs £17 a month with unlimited texts. I send 150 texts a month. Which plan is cheaper, and by how much per year, in pounds?', all: [['plan b', 'b is cheaper', 'plan_b', "'b'", '"b"', 'b:'], ['30']] },
  { id: 97, steps: true, code: true, q: 'Starting from 1 January 2027, a payment is due every 45 days. On what date is the fourth payment due, and what day of the week is it?', all: [['2027-06-30', '30 june 2027', 'june 30, 2027'], ['wednesday']] },
];
for (const c of CASES) c.set = c.steps ? 'steps' : c.messy ? 'messy' : c.words ? 'words' : c.probe ? 'probe' : c.held === 2 ? 'held2' : c.held ? 'held' : 'tune';

export const PROMPT_TOOLS = 'You are a helpful, concise assistant. You cannot see the individual letters of words, and you make arithmetic and date mistakes. '
  + 'So if a question needs counting, arithmetic or a date or time calculation, never work it out in your head: think briefly about what to compute, '
  + 'then write one ```python code block (standard library only) that prints ONLY the final answer. It will be run for you and its output shown. '
  + 'Give dates as YYYY-MM-DD and weekdays as English names. If the question needs no calculation, answer it directly and briefly, with no code.';
// Added after the first stand-in run, which showed the model skipping code when
// it felt sure (strawberry: answered "2" in its head, 0/3): same prompt, but any
// question involving letters, numbers, dates or times must go through code.
export const PROMPT_TOOLS_STRICT = PROMPT_TOOLS.replace('So if a question needs counting, arithmetic or a date or time calculation, never work it out in your head:',
  'So for ANY question that involves counting letters, numbers, arithmetic, percentages, dates or times -- even if it looks easy and even if you think you know the answer -- never work it out in your head:');
export const PROMPT_PLAIN = 'You are a helpful, concise assistant.';

// The nudge (added with the strict prompt): plain code spots a question with
// something to compute -- a digit, or a quoted word plus letters/counting --
// and, if the reply came back without code, asks once more for the code.
// (Month/weekday names and bare quotes were tried first and nudged the
// near-misses "Translate "good morning"" and "...moved to thursday" into code.)
export const looksComputable = (q) => /\d/.test(q) || (/"[^"]+"/.test(q) && /\b(letters?|leters?|how many|hw many|count|spell|backwards|app?ears?|occurs?|times|tims)\b/i.test(q)) // spell/backwards added with case 28
  || /\b(sort|order|arrange|alphabetical(ly)?)\b/i.test(q); // added after held-out 46 ("Sort these words alphabetically") never got the tool
export const NUDGE = 'Please answer that with a ```python code block that prints only the final answer, as instructed.';
export const extractPython = (reply) => (/```(?:python|py)?[ \t]*\n([\s\S]*?)```/i.exec(reply || '') || [])[1] || null;

// Pass/fail in plain code. For a code answer `out` is what the code printed;
// otherwise it's the model's own reply.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export function check(c, out) {
  // Small number words count too ("eight legs"). Fixed after the first run, which scored that as a miss.
  const s = String(out || '').toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (w) => ' ' + WORDS.indexOf(w) + ' ');
  if (c.numFn) c = { ...c, num: c.numFn() };
  if (c.num != null) {
    const nums = (s.replace(/(\d),(?=\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []);
    if (typeof c.num === 'bigint') return nums.some((n) => /^\d+$/.test(n) && BigInt(n) === c.num);
    return nums.some((n) => Math.abs(Number(n) - c.num) < 1e-6);
  }
  // Numbered or bulleted lists count as lists ("1. apple\n2. mango" -- held-out 46 was marked wrong for that).
  if (c.all) return c.all.every((alts) => alts.some((t) => s.includes(t))); // multi-part answers: every part must appear
  if (c.compact) return s.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, '')).join(',').replace(/[\s\[\]()]/g, '').replace(/,+/g, ',').includes(c.compact);
  return c.text.some((t) => s.includes(t)) && !(c.not || []).some((t) => s.includes(t));
}

// ------------------------------------------------------------------ typed answers
// The model declares the answer's type and returns it from answer(); a fixed
// wrapper (not the model's code) checks the type and formats the value. Plain
// code also infers the type from the question where it can, and that wins.
// A second check: the code must use the question's own values (the quoted
// word, the numbers) -- a hard-coded guess fails it. One retry with the reason.

export function inferType(q) {
  // Two-part questions (added after the word-problem set: "On what date, and what
  // day of the week", "How much does each get" were forced down to one value).
  // (Widened after the rewrite said "and on what day" / "each person get".)
  // "each" only counts when two people are named (Anna and Ben); "12 friends ... how much does each pay" is one value.
  if (/\band (on |at |in |by )?(what|which|how)\b/i.test(q) || (/\beach( \w+)? (get|gets|pay|pays|receive|receives)\b/i.test(q) && /\b[A-Z][a-z]+ and [A-Z][a-z]+\b/.test(q))) return 'multi';
  const dp = /(\d+) decimal places?/i.exec(q);
  if (dp) return 'decimal:' + dp[1];
  if (/day of the week/i.test(q)) return 'weekday';
  if (/\b(what|which) date\b/i.test(q)) return 'date';
  if (/\bwhat time\b/i.test(q)) return 'time';
  // "How many minutes/litres..." is a measure, not a count: 4.8 minutes is fine (the taps question was rejected for that).
  if (/\bhow many (minutes|hours|seconds|litres|liters|km|kilometres|miles|metres|meters|kg|grams|pounds|days on average)\b/i.test(q)) return 'number';
  if (/\bhow many\b|\bnumber of\b/i.test(q)) return 'int';
  if (/£|\bin pounds\b|\bprice\b/i.test(q)) return 'decimal:2';
  // Added after the first typed Nano run (declared "number" for a sort, "date" for a leap-year question):
  if (/\b(sort|order|arrange)\b/i.test(q)) return 'list';
  if (/^\s*(is|are|was|were|does|do|did|can|could|has|have|will)\b/i.test(q)) return 'yesno';
  return null;
}
export const declaredType = (code) => ((/ANSWER_TYPE\s*=\s*["']([^"']+)["']/.exec(code || '') || [])[1] || '').trim().toLowerCase() || null;

// The question's own values the code doesn't mention (empty = fine).
export function missingInputs(q, code) {
  const miss = [];
  for (const m of q.matchAll(/"([^"]+)"/g)) if (!code.includes(m[1])) miss.push('"' + m[1] + '"');
  // Thousands commas joined first: "1,000,000" is one number, not 1, 000, 000 (probe 67/72 were rejected for that).
  q = q.replace(/(\d),(?=\d{3}\b)/g, '$1');
  const nums = new Set(q.replace(/\d+ decimal places?/gi, '').match(/\d+(?:\.\d+)?/g) || []);
  // By value too: "2027-03-01" uses the question's "1" (a Nano run was rejected for that).
  const inCode = [...new Set((code.match(/\d+(?:\.\d+)?/g) || []).map(Number))];
  const has = (v) => inCode.some((x) => Math.abs(x - v) < 1e-9);
  // Added after held-out 33/38: a percentage may appear as a fraction (12.5% -> 0.125,
  // 15% off -> 0.85), and a clock time as "19:40" or 1940.
  const pct = new Set([...q.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => m[1]));
  const used = new Set();
  for (const [, hh, mm] of q.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) if (code.includes(hh + ':' + mm) || has(Number(hh + mm))) used.add(hh).add(mm);
  for (const n of nums) {
    if (used.has(n) || new RegExp('(?<!\\d)' + n.replace('.', '\\.') + '(?!\\d)').test(code) || has(Number(n))) continue;
    if (pct.has(n) && [n / 100, 1 - n / 100, 1 + n / 100, 100 - n, 100 + n].some(has)) continue;
    miss.push(n);
  }
  return miss;
}

// The looser check (added after the word-problem set, where "use every number"
// forced irrelevant ones -- Sam's age, the tank's size -- into the sum): letter
// questions must use the quoted word, and the code must use at least one of the
// question's numbers. Hard-coded answers are caught separately, in Python, by
// looking at the code itself (see pyWrapper). missingInputs above is kept for the record.
export function inputProblem(q, code) {
  const quoted = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((w) => !code.includes(w));
  if (quoted.length && /\b(letters?|how many|count|spell|backwards|words?)\b/i.test(q)) {
    return 'your code does not use ' + quoted.map((w) => '"' + w + '"').join(', ') + ' from the question -- work on the string itself in Python (slicing, len(), .count()); do not write the answer yourself';
  }
  // (A "uses none of the question's numbers" check lived here; removed after the
  // full Nano run 2026-09-28: Nano returned the correct literal for 2^64 and never
  // understood that message, 0/3 -- the code-reading hard-coding check in pyWrapper
  // covers literal answers and says how to compute.)
  return null;
}

export const PROMPT_TYPED = 'You are a helpful, concise assistant. You cannot see the individual letters of words, and you make arithmetic and date mistakes. '
  + 'So for ANY question that involves counting letters, numbers, arithmetic, percentages, dates or times -- even if it looks easy and even if you think you know the answer -- never work it out in your head: '
  + 'think briefly, then write one ```python code block (standard library only) that (1) sets ANSWER_TYPE to one of "int", "number", "decimal:N" (N decimal places), "date", "weekday", "time", "text", "multi", '
  + 'and (2) defines def answer(): which computes the result from the question\'s own values and returns it (an int, float, datetime.date or str; if the question asks for more than one thing, a dict such as {"Anna": 60, "Ben": 40}). '
  + 'Use only the numbers that matter and ignore irrelevant details. '
  + 'If you need to see an intermediate result before finishing, you may first write code that prints it (no answer() yet): you will be shown the output and can continue. '
  + 'Do not print anything: the code will be run, checked and formatted for you. If the question needs no calculation, answer it directly and briefly, with no code.';
export const NUDGE_TYPED = 'Please answer that with a ```python code block that sets ANSWER_TYPE and defines def answer(), as instructed.';

// Appended to the model's code. Checks answer()'s value against the type and
// prints it with a marker; a failed check raises "ANSWER CHECK: <reason>".
export const pyWrapper = (type, code = '') => String.raw`
import datetime as _dt, re as _re, ast as _ast
_T = ${JSON.stringify(type)}
_SRC = ${JSON.stringify(code)}
def _hardcoded():
    # answer() returns only fixed values, with no computation or branching:
    # "return 14200761", "return datetime.date(2028, 3, 1)", "return ['a', 'b']".
    try:
        _f = [n for n in _ast.walk(_ast.parse(_SRC)) if isinstance(n, _ast.FunctionDef) and n.name == "answer"][0]
    except Exception:
        return False
    def _lit(v):
        if v is None or isinstance(v, _ast.Constant):
            return True
        if isinstance(v, _ast.UnaryOp):
            return _lit(v.operand)
        if isinstance(v, (_ast.List, _ast.Tuple, _ast.Set)):
            return all(_lit(e) for e in v.elts)
        if isinstance(v, _ast.Dict):
            return all(_lit(e) for e in v.values)
        if isinstance(v, _ast.Call):
            _n = getattr(v.func, "attr", getattr(v.func, "id", ""))
            return _n in ("date", "datetime", "time", "str", "int", "float") and all(_lit(a) for a in v.args)
        return False
    _rets = [n for n in _ast.walk(_f) if isinstance(n, _ast.Return)]
    _logic = any(isinstance(n, (_ast.If, _ast.IfExp, _ast.For, _ast.While, _ast.Compare, _ast.BoolOp)) for n in _ast.walk(_f))
    return bool(_rets) and all(_lit(n.value) for n in _rets) and not _logic
if _hardcoded():
    raise TypeError("ANSWER CHECK: answer() just returns a fixed value -- put the question's values in the code and compute from them (for example items = [...] then return sorted(items), or len(word), or a * b) instead of writing the answer yourself")
_r = answer()
if _T == "auto":
    # No type inferred from the question: format by what the value is (the
    # model's own ANSWER_TYPE is only a hint -- enforcing it pushed a sort into
    # returning numbers[0] on Nano).
    _T = ("yesno" if isinstance(_r, bool) else "int" if isinstance(_r, int) else "number" if isinstance(_r, float)
          else "date" if isinstance(_r, (_dt.date, _dt.datetime)) else "list" if isinstance(_r, (list, tuple)) else "text")
def _bad(msg):
    raise TypeError("ANSWER CHECK: answer() returned " + repr(_r)[:60] + " (" + type(_r).__name__ + "); " + msg)
def _num():
    if isinstance(_r, bool) or not isinstance(_r, (int, float)):
        _bad("this question needs a number")
_W = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
if _T == "int":
    _num()
    if isinstance(_r, float):
        if not _r.is_integer():
            _bad("this question needs a whole number")
        _r = int(_r)
    _out = str(_r)
elif _T == "number":
    _num()
    _out = str(_r) if isinstance(_r, int) else str(int(_r)) if _r.is_integer() else repr(round(_r, 10))
elif _T.startswith("decimal:"):
    _num()
    _out = format(_r, "." + _T.split(":")[1] + "f")
elif _T == "date":
    if isinstance(_r, _dt.datetime):
        _r = _r.date()
    if isinstance(_r, str):
        try:
            _r = _dt.date.fromisoformat(_r.strip())
        except ValueError:
            _bad("this question needs a date (a datetime.date or 'YYYY-MM-DD')")
    if not isinstance(_r, _dt.date):
        _bad("this question needs a date")
    _out = _r.isoformat()
elif _T == "weekday":
    if isinstance(_r, (_dt.date, _dt.datetime)):
        _r = _r.strftime("%A")
    if not isinstance(_r, str) or _r.strip().capitalize() not in _W:
        _bad("this question needs a weekday name")
    _out = _r.strip().capitalize()
elif _T == "time":
    if isinstance(_r, (_dt.datetime, _dt.time)):
        _r = _r.strftime("%H:%M")
    elif isinstance(_r, int) and not isinstance(_r, bool) and 0 <= _r <= 2359 and _r % 100 < 60:
        _r = "%02d:%02d" % (_r // 100, _r % 100)  # 2215 -> 22:15 (a held-out Nano answer)
    _m = _re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", _r) if isinstance(_r, str) else None
    if not _m or int(_m.group(1)) > 23 or int(_m.group(2)) > 59:
        _bad("this question needs a time as HH:MM")
    _out = "%02d:%s" % (int(_m.group(1)), _m.group(2))
elif _T == "multi":
    def _f(v):
        if isinstance(v, bool):
            return "yes" if v else "no"
        if isinstance(v, (_dt.date, _dt.datetime)):
            return v.isoformat()[:10]
        if isinstance(v, float):
            return str(int(v)) if v.is_integer() else repr(round(v, 10))
        return str(v)
    if not (isinstance(_r, (dict, list, tuple)) and len(_r) >= 2):
        _bad("the question asks for more than one thing -- return a dict with each part, for example {\"date\": d, \"weekday\": d.strftime(\"%A\")}")
    if isinstance(_r, dict):
        _out = ", ".join(str(k) + ": " + _f(v) for k, v in _r.items())
    elif isinstance(_r, (list, tuple)):
        _out = ", ".join(_f(v) for v in _r)
    else:
        _out = _f(_r)
elif _T == "yesno":
    _s = _r.strip().lower().rstrip(".") if isinstance(_r, str) else None
    if _s in ("yes", "no", "true", "false"):
        _r = _s in ("yes", "true")
    elif _s is not None and (_s.startswith("no") or _s.startswith("not ")):
        _r = False  # "not a leap year" (a Nano run returned exactly this)
    if not isinstance(_r, bool):
        _bad("this question needs yes or no (return True or False)")
    _out = "yes" if _r else "no"
elif _T == "list":
    if not isinstance(_r, (list, tuple)):
        _bad("this question needs a list")
    _out = ", ".join(str(x) for x in _r)
else:
    if isinstance(_r, bool):
        _out = "yes" if _r else "no"
    elif isinstance(_r, (list, tuple)):
        _out = ", ".join(str(x) for x in _r)
    else:
        _out = str(_r)
print("__ANSWER__=" + _out)
`;

// Harness tidying before a run (added after the second typed Nano run): strip
// indentation common to every line (" ANSWER_TYPE = ..." -> IndentationError)
// and pre-import the modules it kept using without importing (datetime x3).
export function tidyCode(code) {
  const lines = code.replace(/\t/g, '    ').split('\n');
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return 'import datetime, math, calendar\n' + lines.map((l) => l.slice(Math.min(ind, l.match(/^ */)[0].length))).join('\n');
}

// ------------------------------------------------------------------ normalising (plain code)
// Number words and clock phrases -> digits, only when the question has a
// calculation cue (so "name two capitals" is left alone and never gated into code).
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000, million: 1000000 };
const NUMWORD = '(?:' + [...Object.keys(SMALL), ...Object.keys(SCALE)].join('|') + ')';
const NUMRUN = new RegExp('\\b' + NUMWORD + '(?:(?:[\\s-]+and[\\s-]+|[\\s-]+)' + NUMWORD + ')*\\b', 'gi');
const CUE = /\b(plus|minus|times|divided|multiplied|percent|share|shared|split|each|total|how (many|much)|altogether|left|remain\w*|average|sum|cost\w*|pay\w*|days?|hours?|minutes?|arrive|leave|when|what time|squared|cubed)\b/i;
function wordsToNumber(run) {
  let total = 0, cur = 0;
  for (const w of run.toLowerCase().split(/[\s-]+/)) {
    if (w === 'and') continue;
    if (w in SMALL) cur += SMALL[w];
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else { total += (cur || 1) * SCALE[w]; cur = 0; }
  }
  return total + cur;
}
// Questions relative to today ("how many days until Christmas?") get today's date
// attached, in plain code: in the chat, Nano ignored the date in its system prompt
// and answered "Today is Tuesday, May 14, 2024. There are 234 days until Christmas."
// Only with a date-arithmetic cue too, so "who is currently president?" is left alone.
const RELATIVE = /\b(today|tomorrow|yesterday|tonight|now|this (year|month|week)|next (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|last (week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|until|till|'til|til|ago|from now|how old)\b/i;
const DATE_Q = /\bhow (many|long|old)\b|\bwhat (date|day)\b|\bwhich (date|day)\b|\bwhen\b|\bwhat day of the week\b/i;
export const todayText = (now = new Date()) => now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '')
  + ' (' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ')';
export const needsToday = (q) => RELATIVE.test(q) && DATE_Q.test(q) && !/\(Today is /.test(q);
export function normaliseQuestion(q, now = new Date()) {
  if (needsToday(q)) q = q.replace(/\s*$/, '') + ' (Today is ' + todayText(now) + '.)';
  if (!CUE.test(q)) return q;
  let s = q.replace(/\b(half past|quarter past|quarter to)\s+(\w+)(\s+in the (morning|afternoon|evening)|\s*(a\.?m\.?|p\.?m\.?)(?![a-z]))?/gi, (m, kind, hw, _x, part, ap) => {
    let h = hw.toLowerCase() in SMALL ? SMALL[hw.toLowerCase()] : /^\d{1,2}$/.test(hw) ? Number(hw) : null;
    if (h == null || h < 1 || h > 12) return m;
    const mins = /half/i.test(kind) ? '30' : /past/i.test(kind) ? '15' : '45';
    if (/to/i.test(kind)) h = h === 1 ? 12 : h - 1;
    if ((/afternoon|evening/i.test(part || '') || /^p/i.test(ap || '')) && h < 12) h += 12;
    return String(h).padStart(2, '0') + ':' + mins;
  });
  s = s.replace(NUMRUN, (m) => (/^one$/i.test(m.trim()) ? m : String(wordsToNumber(m)))); // a lone "one" stays ("one tap fills...")
  s = s.replace(/(\d)\s*percent\b/gi, '$1%');
  return s;
}

// ------------------------------------------------------------------ write-up
export const PROMPT_WRITEUP = 'You write the final answer to the user\'s question in one or two short, plain sentences. '
  + 'A computer has already worked out the result: use it exactly as given (you may add units, a currency sign or words from the question), '
  + 'and do not recalculate, round or change it. Do not add any other numbers.';
// Every part of the computed result must appear, unchanged, and every number in
// the sentence must come from the result or the question. Returns a problem or null.
export function checkWriteup(result, sentence, question) {
  if (!sentence) return 'empty';
  if (sentence.length > 600) return 'too long';
  const clean = (x) => String(x).toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/£/g, '');
  const S = clean(sentence);
  const numsOf = (x) => (clean(x).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const sNums = numsOf(sentence);
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const parts = /: /.test(result) ? result.split(/,\s*(?=[^,:]+: )/).map((p) => p.split(': ').slice(1).join(': ')) : result.split(/,\s*/);
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
    if (iso) {
      const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
      if (!(S.includes(part) || (S.includes(MONTHS[m - 1]) && sNums.includes(d) && sNums.includes(y)))) return 'result date ' + part + ' not in the sentence';
    } else if (/^-?\d+(\.\d+)?$/.test(part)) {
      const v = Number(part);
      if (!sNums.some((x) => Math.abs(x - v) < 1e-9)) return 'result ' + part + ' not in the sentence unchanged';
    } else if (/^\d{2}:\d{2}$/.test(part)) {
      if (!S.includes(part) && !S.includes(part.replace(/^0/, ''))) return 'result time ' + part + ' not in the sentence';
    } else if (!S.includes(clean(part))) return 'result "' + part + '" not in the sentence';
  }
  const allowed = [...numsOf(result), ...numsOf(question)];
  for (const n of sNums) if (!allowed.some((x) => Math.abs(x - n) < 1e-9)) return 'the sentence adds the number ' + n;
  return null;
}

// ------------------------------------------------------------------ question resolution
// A first, throwaway model call rewrites the question clearly -- spelling fixed,
// numbers as digits, times as HH:MM, assumptions stated -- without answering it.
// Plain code then checks the rewrite kept the question intact; if not, the
// original is used. (Added 2026-09-28 at the user's suggestion.)
export const PROMPT_RESOLVE = 'Rewrite the user\'s question so it is clear and self-contained. Do NOT answer it. '
  + 'Fix spelling and grammar, but copy any text inside quotation marks exactly, letter for letter. '
  + 'Write every number as digits (for example "two hundred and forty" becomes 240), clock times as HH:MM in 24-hour time, and dates as "D Month YYYY". '
  + 'Keep every number and detail from the original and add nothing new. If something is ambiguous (for example 3/4/2027), '
  + 'choose the most likely reading for a UK user and record it as an assumption. Reply as JSON.';
export const RESOLVE_SCHEMA = { type: 'object', properties: { question: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['question', 'assumptions'] };

export function checkRewrite(orig, rewrite) {
  if (!rewrite || typeof rewrite !== 'string') return 'no rewrite';
  if (rewrite.length > orig.length * 3 + 200) return 'rewrite much longer than the question';
  for (const m of orig.matchAll(/"([^"]+)"/g)) if (!rewrite.includes(m[1])) return 'changed the quoted text "' + m[1] + '"';
  const nums = (s) => (s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const got = nums(rewrite);
  for (const n of nums(orig)) if (!got.some((x) => Math.abs(x - n) < 1e-9)) return 'dropped the number ' + n;
  return null;
}

export async function resolveQuestion(q, io) {
  let raw = '', parsed = null;
  try {
    raw = await io.resolve(PROMPT_RESOLVE, q, RESOLVE_SCHEMA);
    parsed = JSON.parse((/\{[\s\S]*\}/.exec(raw) || [raw])[0]);
  } catch (e) { return { question: q, assumptions: [], used: false, reason: 'no usable rewrite (' + String(e.message || e).slice(0, 60) + ')', raw }; }
  const rewrite = String(parsed.question || '').trim();
  const assumptions = Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 3) : [];
  const bad = checkRewrite(q, rewrite);
  return bad ? { question: q, assumptions: [], used: false, reason: bad, rewrite } : { question: rewrite, assumptions, used: rewrite !== q };
}

// The whole typed pipeline, shared by the page and the stand-in runner.
// io: { first(system, q) -> reply, again(text) -> reply (same conversation), py(code) -> { ok, out, err } }
export async function typedAnswer(q0, io, { resolve = false, writeUp = true, maxSteps = 3, onResult = null } = {}) {
  let q = q0;
  const r = { typed: true, problems: [], repaired: false, steps: [], assumptions: [] };
  // 1. Plain-code normalising: number words and clock phrases -> digits (instant, never wrong about what was said).
  const norm = normaliseQuestion(q0);
  if (norm !== q0) { r.normalised = norm; q = norm; }
  // 2. Optional model rewrite (off by default: on Nano it mostly failed its own check and cost 2-5 s).
  if (resolve && io.resolve) { r.resolved = await resolveQuestion(q, io); q = r.resolved.question; }
  r.inferred = inferType(q0) === 'multi' ? 'multi' : inferType(q);
  // Plain code decides whether tools are offered at all (added after Nano, told
  // "ANY question involving numbers", wrote code for 11 of 18 plain questions).
  if (!looksComputable(q)) { r.gated = true; r.reply = await io.first(PROMPT_PLAIN, q); r.code = null; r.final = r.reply; return r; }
  // Stated, not silent: an all-numbers date is read the UK way (a probe showed "3/4/2027" read as 4 March every time, unflagged).
  if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(q)) r.assumptions.push('Dates like 3/4/2027 are read as day/month/year (UK).');
  if (r.resolved) r.assumptions.push(...r.resolved.assumptions);
  r.reply = await io.first(PROMPT_TYPED, q + (r.assumptions.length ? '\n(Assumptions: ' + r.assumptions.join(' ') + ')' : ''));
  r.code = extractPython(r.reply);
  if (!r.code && looksComputable(q)) {
    r.nudged = true;
    const more = await io.again(NUDGE_TYPED);
    r.reply += '\n\n[nudged]\n\n' + more;
    r.code = extractPython(more);
  }
  if (!r.code) { r.final = r.reply; return r; }
  // 4. Write-up: the model phrases the answer; plain code checks the result is in it, unchanged, and nothing else numeric was added.
  const finish = async () => {
    if (onResult) { try { onResult(r.out); } catch {} }
    if (!writeUp || !io.writeup) return;
    try {
      const text = 'Question: ' + q + '\nComputed result: ' + r.out + (r.steps.length ? '\nIntermediate results: ' + r.steps.map((x) => x.out.split('\n').slice(0, 3).join('; ')).join(' | ') : '');
      const sentence = String(await io.writeup(PROMPT_WRITEUP, text) || '').trim();
      const bad = checkWriteup(r.out, sentence, q);
      if (bad) { r.writeupRejected = sentence; r.writeupProblem = bad; } else r.writeup = sentence;
    } catch (e) { r.writeupProblem = 'write-up failed: ' + String(e.message || e).slice(0, 80); }
  };
  const TRIES = 3; // first try + 2 retries
  let attempt = 0;
  while (attempt < TRIES) {
    r.declared = declaredType(r.code);
    r.type = r.inferred || 'auto';
    r.typeMismatch = !!(r.inferred && r.declared && r.inferred !== r.declared);
    const tidy = tidyCode(r.code);
    // 3. Multi-step: code with no answer() that prints something is a look at an
    // intermediate result. The model sees the output and continues -- at most
    // maxSteps blocks in all; each runs in a fresh sandbox.
    if (!/def\s+answer\s*\(/.test(r.code) && r.steps.length < maxSteps - 1) {
      const look = await io.py(tidy);
      if (look.ok && look.out.trim()) {
        r.steps.push({ code: r.code, out: look.out.trim().slice(0, 1500) });
        const next = await io.again('Your code printed:\n' + look.out.trim().slice(0, 1500) + '\nContinue with the next ```python block. Each block runs fresh, so repeat any values you need. If that is already the result, now write def answer() that computes it (do not type the value in).');
        let c = extractPython(next);
        if (!c) { // it answered in words after the step: ask once for the final code (the train question stopped here, 0/3)
          const fin = await io.again('Now reply with only a ```python block that defines def answer() computing the final result from the question\'s values.');
          c = extractPython(fin);
          if (!c) {
            // It computed the value in a printing step and then stopped: use that printed value,
            // if the step's code really computed it (not print(88)), through the same type check.
            // (Added after "How many days until Christmas?" printed 88 correctly and then gave no final code.)
            const step = r.steps[r.steps.length - 1];
            const val = step.out.split('\n').filter(Boolean).pop() || '';
            const computed = /[-+*\/%]|\w\(/.test(step.code.replace(/print\s*\(/g, '')) && !/^\s*print\(\s*['"]?[-\d.,:\/ ]+['"]?\s*\)\s*$/.test(step.code.trim());
            if (val && computed && step.out.split('\n').filter(Boolean).length <= 3) {
              r.type = r.inferred || 'auto';
              const lit = /^-?\d+(\.\d+)?$/.test(val) ? val : JSON.stringify(val);
              const run = await io.py('def answer():\n    return ' + lit + '\n' + pyWrapper(r.type, ''));
              const m = run.ok && /__ANSWER__=(.*)$/m.exec(run.out);
              if (m) { r.code = step.code; r.fromStep = true; r.out = r.final = m[1].trim(); r.checks = 'value printed by a computing step'; await finish(); return r; }
            }
            r.problems.push('no final code after an intermediate step'); break;
          }
        }
        r.code = c;
        continue; // a step is not a retry
      }
    }
    const inputs = inputProblem(q, r.code);
    let problem = null;
    if (!/def\s+answer\s*\(/.test(r.code)) problem = 'define def answer(): that returns the final value';
    else if (inputs) problem = inputs;
    else {
      const run = await io.py(tidy + '\n' + pyWrapper(r.type, tidy));
      const m = run.ok && /__ANSWER__=(.*)$/m.exec(run.out);
      if (m) {
        r.out = r.final = m[1].trim(); r.checks = attempt ? 'passed on retry' : 'passed';
        await finish();
        return r;
      }
      // The reason is on the "TypeError: ANSWER CHECK: ..." line -- not the traceback's copy of the raise statement.
      problem = run.ok ? 'answer() produced no value' : ((/TypeError: ANSWER CHECK: (.*)/.exec(run.err) || [])[1] || 'it failed with: ' + run.err);
    }
    r.problems.push(problem);
    attempt++;
    if (attempt === TRIES) break;
    r.repaired = true;
    const hint = r.type === 'time' ? ' For clock times use datetime: (datetime.datetime(2000, 1, 1, H, M) + datetime.timedelta(hours=..., minutes=...)).strftime("%H:%M").' : '';
    const fix = await io.again('Your code was rejected: ' + problem + '.' + hint + ' Reply with only a corrected ```python code block (ANSWER_TYPE and def answer()).');
    const c2 = extractPython(fix);
    if (!c2) break;
    r.code2 = r.code = c2;
  }
  r.final = ''; r.out = null; r.err = r.problems[r.problems.length - 1] || 'no final code';
  return r;
}
