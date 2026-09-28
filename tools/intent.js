// Explicit requests win over automatic routing: "ask the weather API…", "spin
// something up in Python…", "look it up on Wikipedia", "don't use Python, just
// tell me…". Plain code, and it needs an instruction ("use / run / ask / check
// with…"), not just the word -- "I'm learning Python" is not a request for code.
// Returns { kind: 'python' | 'weather' | 'currency' | 'wiki' | 'none', rest, refersBack } or null.

const PATTERNS = [
  ['none', /\b(don'?t|do not|without|no need to)\s+(use\s+|using\s+|run\s+|call\s+)?(python|code|any tools?|tools|the (api|internet|web)|looking (it )?up|a calculator)\b|\bjust (answer|tell me|say)\b|\b(from|off the top of) (your )?(head|memory)\b/i],
  ['python', /\b(?:use|using|with|via|in|run|write|spin (?:something |it |this |that )?up in|do (?:it|this|that) in|check (?:it|this|that)? ?(?:with|in|using)|calculate (?:it|this|that)? ?(?:with|in|using)|compute (?:it|this|that)? ?(?:with|in|using)|work (?:it|this|that) out (?:with|in|using))\s+(?:some\s+|a\s+(?:bit of\s+|little\s+)?)?(?:python|code|a script|pyodide)\b|\b(?:run|write)\s+(?:some\s+|a\s+)?(?:python|code|script)\b/i],
  ['weather', /\b(?:ask|use|call|query|check|hit|try)\s+(?:the\s+)?(?:weather|forecast)(?:\s+(?:api|service|tool|data|app))?\b|\b(?:weather|forecast)\s+(?:api|service|tool)\b|\bopen-?meteo\b/i],
  ['currency', /\b(?:ask|use|call|query|check|hit|try)\s+(?:the\s+)?(?:currency|exchange[- ]rates?|fx|rates?)(?:\s+(?:api|service|tool|converter|data))?\b|\b(?:currency|exchange[- ]rate)\s+(?:api|service|tool|converter)\b|\bfrankfurter\b/i],
  ['wiki', /\b(?:look\s+(?:it|this|that|them)?\s*up|search|check|ask|find (?:it|this|that)?)\s+(?:on|in)\s+(?:wikipedia|wiki)\b|\b(?:wikipedia|wiki)\s+(?:it|that|this)\b|\b(?:use|ask|check|search)\s+(?:the\s+)?wikipedia\b|\bon wikipedia\b/i],
];
const NOT_A_REQUEST = /\b(learn|learning|teach|explain|what is|what's|history of|tips|course|tutorial|about|versus|vs\.?)\s+(python|code|coding|wikipedia)\b|\bpython (tips|course|tutorial|developer|job|snake)\b/i;
const REFERS = /^\s*(?:for|on|with|to)?\s*(?:it|that|this|those|them|the (?:last|previous) (?:one|question|answer))?\s*[?.!]*\s*$|\b(?:instead|as well|too|again)\b|^\s*(?:for|on|with)\s+(?:it|that|this|those|them)\b/i;

export function detectExplicit(text) {
  if (NOT_A_REQUEST.test(text)) return null;
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    // What's left once the instruction is removed: the actual question.
    let rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
    // Strip leftover connectors, whole words only ("Forth Bridge" must keep its "For").
    const LEAD = /^(?:[\s,:;.\-–—]+|(?:and|then|so|please|can you|could you|would you|to|for|about|on|just)\b|(?:work out|figure out|calculate|compute|tell me|find out|check|see)\b)\s*/i;
    for (let prev = null; prev !== rest; ) { prev = rest; rest = rest.replace(LEAD, ''); }
    rest = rest.replace(/[\s,:;\-–—]+$/g, '').trim();
    return { kind, rest, refersBack: !rest || REFERS.test(rest) };
  }
  return null;
}
