// Follow-up questions against an open article, with the section(s) that
// genuinely answer them. `expect` is a regex over the picked heading.
export const FOLLOWUPS = [
  // Same language as the article
  { lang: 'en', title: 'Edinburgh', q: 'what is the economy based on?', expect: /^Economy$/ },
  { lang: 'en', title: 'Edinburgh', q: 'what is the weather like?', expect: /Climate/ },
  { lang: 'en', title: 'Edinburgh', q: 'which football clubs are there?', expect: /Football/ },
  { lang: 'en', title: 'Edinburgh', q: 'can I get a tram from the airport?', expect: /Trams|Air/ },
  { lang: 'en', title: 'Edinburgh', q: 'who runs the city council?', expect: /Governance|Politics/ },
  { lang: 'en', title: 'Edinburgh Castle', q: 'what is the one o\'clock gun?', expect: /One O'Clock Gun/ },
  { lang: 'en', title: 'Edinburgh Castle', q: 'was it ever besieged for a long time?', expect: /Lang Siege|Wars of Scottish Independence|Civil War/ },
  { lang: 'en', title: 'Edinburgh Castle', q: 'is there a big old cannon?', expect: /Mons Meg/ },
  // Cross-language: English question, French article
  { lang: 'fr', title: 'Édimbourg', q: 'what is the economy like?', expect: /Économie/ },
  { lang: 'fr', title: 'Édimbourg', q: 'what is the climate like?', expect: /Climat/ },
  { lang: 'fr', title: 'Édimbourg', q: 'how do I get there by train?', expect: /Train|Transports/ },
  { lang: 'fr', title: 'Tour Eiffel', q: 'how tall is it?', expect: /Données techniques/ },
  { lang: 'fr', title: 'Tour Eiffel', q: 'who built it and how long did it take?', expect: /Construction|Chantier|Montage/ },
  // Cross-language: French question, English article
  { lang: 'en', title: 'Edinburgh', q: 'quel temps fait-il à Édimbourg ?', expect: /Climate/ },
  { lang: 'en', title: 'Edinburgh Castle', q: 'à quoi sert le canon de treize heures ?', expect: /One O'Clock Gun/ },
];

// Does the chat model answer in the language it was asked in, given a
// source in the other language? (The preamble is the one the app sends.)
export const REPLY_LANGUAGE = [
  { lang: 'fr', title: 'Édimbourg', q: 'What is Edinburgh best known for?', want: 'en' },
  { lang: 'en', title: 'Edinburgh', q: 'Pour quoi Édimbourg est-elle connue ?', want: 'fr' },
  { lang: 'fr', title: 'Tour Eiffel', q: 'Quand la tour a-t-elle été construite ?', want: 'fr' },
];
