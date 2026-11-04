// Nyheter: what is new in Livskoll, written for the people who use it (no
// technical words), newest first. A change people can see gets an entry here in
// the same PR. Each entry has a date (YYYY-MM-DD), a title and 2–5 short bullets;
// releases.test.ts keeps the order and the dates in check.

export type Release = {
  /** The day it reached the app, "2026-11-04". */
  date: string;
  title: string;
  bullets: readonly string[];
};

export const releases: readonly Release[] = [
  {
    date: "2026-11-04",
    title: "Kylfotot på datorn och mängd i raden",
    bullets: [
      "Tryck på mängden i en rad, till exempel 1 förp, så kan du ändra den direkt med − och +.",
      "På datorn står fotot till vänster och listan till höger. Fotot följer med när du bläddrar.",
      "Håll musen över en rad så lyser dess siffra på fotot.",
      "Med piltangenterna går du mellan raderna, och mellanslag bockar av eller på.",
    ],
  },
  {
    date: "2026-11-04",
    title: "Kylfotot och lappen",
    bullets: [
      "Fotot och raderna hänger ihop: tryck på en siffra på fotot så syns varan i listan, och tvärtom.",
      "Fler varor får sin siffra på fotot.",
      "Förkasta inläsningen slänger en inläsning du inte vill ha. Ångra tar tillbaka den.",
      "Den som skrev en lapp kan ta bort den.",
    ],
  },
  {
    date: "2026-11-02",
    title: "Basvaror och en enklare lista",
    bullets: [
      "Basvaror: det ni alltid har hemma, som salt och peppar, hamnar inte på inköpslistan.",
      "En inköpslista, Att handla, med veckan som ett litet val bredvid.",
      "Recepten visar ingredienserna i grupper och stegen med rubriker.",
      "Snabbkameran i Förrådet tar flera bilder i rad och sparar dem på en gång.",
      "Fotot av kylen läses in snabbare och granskas i en kompakt lista med bockrutor.",
    ],
  },
  {
    date: "2026-11-02",
    title: "Hushållet",
    bullets: [
      "Bjud in dem du bor med under Inställningar, Medlemmar. Alla får en egen inloggning.",
      "Se vem som lade till eller bockade av något.",
      "Lappen på kylskåpet: skriv en rad som de andra ser.",
      "Små brickor visar vad någon annan har lagt till sedan du tittade sist, på appikonen också om du vill.",
    ],
  },
  {
    date: "2026-11-01",
    title: "Livskoll i molnet",
    bullets: [
      "Livskoll finns på livskoll.vercel.app och fungerar på alla dina enheter. Det du sparar lagras i EU.",
      "En välkomsttur visar det viktigaste. Du kan se den igen från Hjälp och tips.",
      "Hjälp och tips har sökning, steg och vanliga frågor för varje flik.",
      "Tyck till: skicka en idé, ett betyg eller ett problem direkt från appen.",
    ],
  },
  {
    date: "2026-11-01",
    title: "Ny look och nytt namn",
    bullets: [
      "Appen heter Livskoll och har en ny ikon: ett hus med en bock.",
      "Ett lugnare utseende med kategorier, ikoner och flikarna längst ner.",
      "Recept, Matsedel, Inköpslista, Matvaror och Förråd har fått samma stil.",
      "I Förrådet kommer rummen först, och sakerna heter föremål.",
    ],
  },
];

/** The newest entry's date: what "Nytt sedan sist" compares with. */
export const latestReleaseDate = releases[0]!.date;

/** The entries grouped by day, newest first, for the page. */
export function releasesByDate(list: readonly Release[] = releases): { date: string; entries: Release[] }[] {
  const groups: { date: string; entries: Release[] }[] = [];
  for (const release of list) {
    const last = groups.at(-1);
    if (last?.date === release.date) last.entries.push(release);
    else groups.push({ date: release.date, entries: [release] });
  }
  return groups;
}

const longMonths = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "2026-11-04" → "4 november 2026". */
export function releaseDateText(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${longMonths[month! - 1]} ${year}`;
}
