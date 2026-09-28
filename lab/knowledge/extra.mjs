// Added 2026-09-28 BEFORE any lookup code: requests that name places or people but
// need NO lookup (creative, advice, opinion, how-to, translation). A lookup on any
// of these is a false trigger.
export const NO_LOOKUP = [
  [101, 'Write a short poem about Edinburgh Castle.'],
  [102, 'Tell me a joke about the Forth Bridge.'],
  [103, 'Draft a short email inviting my team to the Edinburgh Festival Fringe.'],
  [104, 'Give me three ideas for a day out in Glasgow.'],
  [105, 'Imagine you are Ada Lovelace and describe your morning.'],
  [106, 'Rewrite this more politely: the meeting with Sarah is cancelled.'],
  [107, 'What do you think makes a good holiday in Scotland?'],
  [108, 'How do I boil an egg?'],
  [109, "Translate 'good night' into Spanish."],
  [110, 'Write a haiku about the River Thames in autumn.'],
].map(([id, q]) => ({ id, kind: 'nolookup', q }));
