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
];

export const PROMPT_TOOLS = 'You are a helpful, concise assistant. You cannot see the individual letters of words, and you make arithmetic and date mistakes. '
  + 'So if a question needs counting, arithmetic or a date or time calculation, never work it out in your head: think briefly about what to compute, '
  + 'then write one ```python code block (standard library only) that prints ONLY the final answer. It will be run for you and its output shown. '
  + 'Give dates as YYYY-MM-DD and weekdays as English names. If the question needs no calculation, answer it directly and briefly, with no code.';
export const PROMPT_PLAIN = 'You are a helpful, concise assistant.';

export const extractPython = (reply) => (/```(?:python|py)?[ \t]*\n([\s\S]*?)```/i.exec(reply || '') || [])[1] || null;

// Pass/fail in plain code. For a code answer `out` is what the code printed;
// otherwise it's the model's own reply.
export function check(c, out) {
  const s = String(out || '').toLowerCase();
  if (c.num != null) {
    const nums = (s.replace(/(\d),(?=\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []);
    if (typeof c.num === 'bigint') return nums.some((n) => /^\d+$/.test(n) && BigInt(n) === c.num);
    return nums.some((n) => Math.abs(Number(n) - c.num) < 1e-6);
  }
  return c.text.some((t) => s.includes(t)) && !(c.not || []).some((t) => s.includes(t));
}
