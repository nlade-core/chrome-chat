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
];

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
export const looksComputable = (q) => /\d/.test(q) || (/"[^"]+"/.test(q) && /\b(letters?|how many|count|spell|backwards)\b/i.test(q)); // spell/backwards added with case 28
export const NUDGE = 'Please answer that with a ```python code block that prints only the final answer, as instructed.';
export const extractPython = (reply) => (/```(?:python|py)?[ \t]*\n([\s\S]*?)```/i.exec(reply || '') || [])[1] || null;

// Pass/fail in plain code. For a code answer `out` is what the code printed;
// otherwise it's the model's own reply.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export function check(c, out) {
  // Small number words count too ("eight legs"). Fixed after the first run, which scored that as a miss.
  const s = String(out || '').toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (w) => ' ' + WORDS.indexOf(w) + ' ');
  if (c.num != null) {
    const nums = (s.replace(/(\d),(?=\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []);
    if (typeof c.num === 'bigint') return nums.some((n) => /^\d+$/.test(n) && BigInt(n) === c.num);
    return nums.some((n) => Math.abs(Number(n) - c.num) < 1e-6);
  }
  if (c.compact) return s.replace(/[\s\[\]()]/g, '').includes(c.compact);
  return c.text.some((t) => s.includes(t)) && !(c.not || []).some((t) => s.includes(t));
}

// ------------------------------------------------------------------ typed answers
// The model declares the answer's type and returns it from answer(); a fixed
// wrapper (not the model's code) checks the type and formats the value. Plain
// code also infers the type from the question where it can, and that wins.
// A second check: the code must use the question's own values (the quoted
// word, the numbers) -- a hard-coded guess fails it. One retry with the reason.

export function inferType(q) {
  const dp = /(\d+) decimal places?/i.exec(q);
  if (dp) return 'decimal:' + dp[1];
  if (/day of the week/i.test(q)) return 'weekday';
  if (/\b(what|which) date\b/i.test(q)) return 'date';
  if (/\bwhat time\b/i.test(q)) return 'time';
  if (/\bhow many\b|\bnumber of\b/i.test(q)) return 'int';
  if (/£|\bin pounds\b|\bprice\b/i.test(q)) return 'decimal:2';
  return null;
}
export const declaredType = (code) => ((/ANSWER_TYPE\s*=\s*["']([^"']+)["']/.exec(code || '') || [])[1] || '').trim().toLowerCase() || null;

// The question's own values the code doesn't mention (empty = fine).
export function missingInputs(q, code) {
  const miss = [];
  for (const m of q.matchAll(/"([^"]+)"/g)) if (!code.includes(m[1])) miss.push('"' + m[1] + '"');
  const nums = new Set(q.replace(/\d+ decimal places?/gi, '').match(/\d+(?:\.\d+)?/g) || []);
  for (const n of nums) if (!new RegExp('(?<!\\d)' + n.replace('.', '\\.') + '(?!\\d)').test(code)) miss.push(n);
  return miss;
}

export const PROMPT_TYPED = 'You are a helpful, concise assistant. You cannot see the individual letters of words, and you make arithmetic and date mistakes. '
  + 'So for ANY question that involves counting letters, numbers, arithmetic, percentages, dates or times -- even if it looks easy and even if you think you know the answer -- never work it out in your head: '
  + 'think briefly, then write one ```python code block (standard library only) that (1) sets ANSWER_TYPE to one of "int", "number", "decimal:N" (N decimal places), "date", "weekday", "time", "text", '
  + 'and (2) defines def answer(): which computes the result from the question\'s own values and returns it (an int, float, datetime.date or str). '
  + 'Do not print anything: the code will be run, checked and formatted for you. If the question needs no calculation, answer it directly and briefly, with no code.';
export const NUDGE_TYPED = 'Please answer that with a ```python code block that sets ANSWER_TYPE and defines def answer(), as instructed.';

// Appended to the model's code. Checks answer()'s value against the type and
// prints it with a marker; a failed check raises "ANSWER CHECK: <reason>".
export const pyWrapper = (type) => String.raw`
import datetime as _dt, re as _re
_T = ${JSON.stringify(type)}
if _T == "model":
    _T = str(globals().get("ANSWER_TYPE", "text")).strip().lower()
_r = answer()
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
    _out = str(_r) if isinstance(_r, int) else repr(round(_r, 10))
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
    _m = _re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", _r) if isinstance(_r, str) else None
    if not _m or int(_m.group(1)) > 23 or int(_m.group(2)) > 59:
        _bad("this question needs a time as HH:MM")
    _out = "%02d:%s" % (int(_m.group(1)), _m.group(2))
else:
    if isinstance(_r, bool):
        _out = "yes" if _r else "no"
    elif isinstance(_r, (list, tuple)):
        _out = ", ".join(str(x) for x in _r)
    else:
        _out = str(_r)
print("__ANSWER__=" + _out)
`;

// The whole typed pipeline, shared by the page and the stand-in runner.
// io: { first(system, q) -> reply, again(text) -> reply (same conversation), py(code) -> { ok, out, err } }
export async function typedAnswer(q, io) {
  const r = { typed: true, inferred: inferType(q), problems: [], repaired: false };
  r.reply = await io.first(PROMPT_TYPED, q);
  r.code = extractPython(r.reply);
  if (!r.code && looksComputable(q)) {
    r.nudged = true;
    const more = await io.again(NUDGE_TYPED);
    r.reply += '\n\n[nudged]\n\n' + more;
    r.code = extractPython(more);
  }
  if (!r.code) { r.final = r.reply; return r; }
  for (let attempt = 0; attempt < 2; attempt++) {
    r.declared = declaredType(r.code);
    r.type = r.inferred || r.declared || 'text';
    r.typeMismatch = !!(r.inferred && r.declared && r.inferred !== r.declared);
    const missing = missingInputs(q, r.code);
    let problem = null;
    if (!/def\s+answer\s*\(/.test(r.code)) problem = 'define def answer(): that returns the final value';
    else if (missing.length) problem = 'compute from the question\'s own values -- your code does not use ' + missing.join(', ');
    else {
      const run = await io.py(r.code + '\n' + pyWrapper(r.type));
      const m = run.ok && /__ANSWER__=(.*)$/m.exec(run.out);
      if (m) { r.out = r.final = m[1].trim(); r.checks = attempt ? 'passed on retry' : 'passed'; return r; }
      problem = run.ok ? 'answer() produced no value' : ((/ANSWER CHECK: (.*)/.exec(run.err) || [])[1] || 'it failed with: ' + run.err);
    }
    r.problems.push(problem);
    if (attempt === 1) break;
    r.repaired = true;
    const fix = await io.again('Your code was rejected: ' + problem + '. Reply with only a corrected ```python code block (ANSWER_TYPE and def answer()).');
    const c2 = extractPython(fix);
    if (!c2) break;
    r.code2 = r.code = c2;
  }
  r.final = ''; r.out = null; r.err = r.problems[r.problems.length - 1];
  return r;
}
