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
    date: "2026-11-06",
    title: "Nya kategorinamn",
    bullets: [
      "Kategorin Skafferi heter nu Torrvaror & konserver och Frys heter Fryst, så de inte blandas ihop med lagren.",
      "Det syns på Matvaror, Inköpslista och Erbjudanden. Lagren Kyl, Frys och Skafferi heter som förut.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Vad kan jag laga nu?",
    bullets: [
      "Ny knapp överst på Matvaror: Vad kan jag laga nu? Ett ark öppnas direkt, utan hopp till Recept.",
      "Dina recept där allt finns hemma står först, sedan upp till tre nya idéer från AI utan bild. Basvaror räknas som hemma.",
      "Saknar bara en vara visar rätter där en enda sak fattas, och Andra förslag ger nya idéer. Inget sparas utan Spara som recept.",
      "Raden Ät det här först är borta: det som legat längst står som tips överst i arket, och rätterna med det kommer först.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Förslagen från kylen saknar högst två varor",
    bullets: [
      "Vad kan jag laga? föreslår nu bara rätter där högst två varor saknas hemma, utöver dina Basvaror.",
      "Varje förslag visar hur många varor du har hemma och vad du behöver köpa till.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Förslag på Matsedel",
    bullets: [
      "Ny rad på Matsedel: Förslag från erbjudanden och lagret. Den visar dina egna recept som passar veckans erbjudanden och det du har hemma, med 6 av 8 hemma och vad du behöver köpa.",
      "Tryck Lägg på en dag och välj en dag i denna eller nästa vecka. Du kan också bara läsa förslagen eller öppna receptet.",
      "Vill du ha nya idéer kan du be om upp till två rätter från AI. Inget sparas utan att du säger Spara.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Erbjudanden i Recept",
    bullets: [
      "Nytt filter Erbjudanden i Recept: bara recept där en huvudvara är på rea, de med flest erbjudanden först och sedan de där minst saknas.",
      "Korten visar upp till två erbjudanden och +N. Under filtret står veckan och butiken, och Visa erbjudanden öppnar listan.",
      "Erbjudanden som ICA skriver som produktnamn, till exempel Herrgård, kopplas nu till rätt vara hos dig, så fler recept kommer med.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Vad kan jag laga?",
    bullets: [
      "På Matvaror finns nu knappen Vad kan jag laga? Tryck, så letar Livskoll efter rätter med det du har hemma och tar dig till Recept.",
      "Erbjudanden finns nu också på Matsedel, med pristaggen uppe i hörnet.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Skanningslinje i Kylfoto",
    bullets: [
      "Medan Livskoll läser ditt foto av kylen sveper en tunn ljus linje långsamt över bilden, så det syns att något pågår.",
      "Har du slagit på Minska rörelse i telefonen visas ingen linje.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Notiser från hushållet",
    bullets: [
      "Slå på notiser under Inställningar, Notiser, så får du veta när någon annan lägger till varor, skriver en lapp, tar ett nytt kort i Förrådet eller ändrar matsedeln.",
      "Ändringar som kommer tätt samlas till en notis, till exempel \"3 nya varor på listan\". Det du själv gör ger ingen notis.",
      "Du väljer själv vad du vill få notis om. Varor och lappar är på från början.",
      "På iPhone och iPad behöver Livskoll ligga på hemskärmen för att kunna skicka notiser.",
    ],
  },
  {
    date: "2026-11-05",
    title: "Enhetligare knappar",
    bullets: [
      "Receptsajter och Boenden tar bort en rad med samma soptunna som resten av appen.",
      "Tomma dagar i Matsedel visar en plus-ikon bredvid Lägg till.",
    ],
  },
  {
    date: "2026-11-04",
    title: "Varorna droppar in när kylen läses",
    bullets: [
      "När fotot av kylen läses dyker varorna upp som rader, en efter en, och siffran poppar upp på fotot.",
      "Du ser \"4 hittills\" medan resten läses, och grå rader visar att fler är på väg.",
      "Med Minska rörelse visas raderna utan rörelse.",
    ],
  },
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
