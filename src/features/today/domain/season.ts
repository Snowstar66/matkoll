// What is in season in Sweden, by month: a fixed editorial list of the produce Swedes
// know as that time's own (Swedish harvest, plus citrus and the stone fruit of the
// summer). The line names only the produce, never a recipe: it is a nudge to look for
// the primeur, not a menu. The item rotates with the day of the month, so it varies.

/** The definite form, which starts the sentence: "Pumpan". */
const s = {
  blodapelsiner: "Blodapelsinerna",
  citrus: "Citrusfrukterna",
  gronkal: "Grönkålen",
  rabarber: "Rabarbern",
  spenat: "Spenaten",
  sparris: "Sparrisen",
  radisor: "Rädisorna",
  farskpotatis: "Färskpotatisen",
  nypotatis: "Nypotatisen",
  jordgubbar: "Jordgubbarna",
  blabar: "Blåbären",
  artor: "Ärterna",
  nektariner: "Nektarinerna",
  persikor: "Persikorna",
  kantareller: "Kantarellerna",
  tomater: "Tomaterna",
  majs: "Majsen",
  plommon: "Plommonen",
  applen: "Äpplena",
  svamp: "Svampen",
  lingon: "Lingonen",
  pumpa: "Pumpan",
  rotfrukter: "Rotfrukterna",
  rotselleri: "Rotsellerin",
  clementiner: "Clementinerna",
  rodkal: "Rödkålen",
} as const;

/** Index 0 is January. */
export const seasonByMonth: readonly (readonly string[])[] = [
  [s.blodapelsiner, s.citrus, s.gronkal],
  [s.blodapelsiner, s.citrus, s.gronkal],
  [s.spenat, s.rotfrukter, s.gronkal],
  [s.rabarber, s.spenat, s.radisor],
  [s.sparris, s.rabarber, s.radisor],
  [s.farskpotatis, s.jordgubbar, s.sparris, s.radisor],
  [s.jordgubbar, s.blabar, s.nypotatis, s.artor, s.nektariner, s.persikor],
  [s.kantareller, s.tomater, s.majs, s.plommon, s.nektariner, s.persikor],
  [s.applen, s.svamp, s.lingon, s.plommon],
  [s.pumpa, s.applen, s.rotfrukter],
  [s.pumpa, s.gronkal, s.rotselleri],
  [s.gronkal, s.clementiner, s.rodkal],
];

/** The produce the season line names for a day: the month's list, rotated by the day of the month. */
export function seasonItem(month: number, day: number): string | null {
  const items = seasonByMonth[month - 1];
  if (!items) return null;
  return items[(day - 1) % items.length] ?? null;
}

/** "Pumpan är som bäst nu." */
export function seasonLine(month: number, day: number): string | null {
  const item = seasonItem(month, day);
  return item ? `${item} är som bäst nu.` : null;
}
