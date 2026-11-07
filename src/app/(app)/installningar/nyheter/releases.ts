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
    date: "2026-11-07",
    title: "Enklare inloggning",
    bullets: [
      "Inloggningssidan har tre delar: lösenord, inloggning utan lösenord och inbjudan. Det som inte behövs just nu ligger ihopfällt.",
      "Logga in utan lösenord heter nu Skicka länk och kod. Koden från mejlet visas när mejlet är skickat, med Skicka igen under.",
      "Har du fått en inbjudan? öppnar ett fält som tar både koden med 6 tecken och koden med 8 tecken, med eller utan mellanslag.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Använd med telefonen",
    bullets: [
      "Spara i Livskoll och Siri och genvägar är nu en enda sida: Använd med telefonen, med ett kort för recept och ett för Siri.",
      "Receptsajterna i Importera recept öppnas i riktiga Safari när du använder appen på iPhone. Där finns adressfältet och Dela-knappen.",
      "Stegen för att bygga genvägen själv är omskrivna och ligger ihopfällda under Bygg genvägen själv.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Siffror på fotot i Förrådet",
    bullets: [
      "På ett kort i Förrådet visas varje föremål nu som en siffra på fotot, precis som i Kylfoto. Samma siffra står vid föremålet i listan under.",
      "Tryck på en siffra eller en rad: siffran blir större, namnet visas och resten av fotot dämpas mjukt runt föremålet.",
      "Det blir lugnare på bilden, och en siffra som sitter lite snett pekar fortfarande på rätt sak.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Lugnare matsedel och diskretare sortering",
    bullets: [
      "På Matsedel är Lägg till nya rätter ihopfälld tills du själv fäller ut den, och appen kommer ihåg ditt val.",
      "Rätter som redan ligger på veckan visas inte i listan, så den blir kortare och renare.",
      "Ett tryck på en ledig dag fäller ut listan åt dig.",
      "I Veckans erbjudanden är Sortera nu en liten text bredvid antalet: tryck för att växla mellan Avdelning och Bäst rabatt.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Tak för AI-kostnad",
    bullets: [
      "Varje hushåll får använda AI för ett visst belopp per dag, till att börja med 10 kr. Är taket nått får du veta det, och kan prova igen från midnatt.",
      "Appens ägare ändrar taket och ser vad varje hushåll har kostat under Inställningar, AI-kostnad. Ägarens eget hushåll är undantaget.",
      "Allt annat i appen fungerar som vanligt även när taket är nått.",
    ],
  },
  {
    date: "2026-11-07",
    title: "Välj vecka för rätter med extrapris",
    bullets: [
      "I Rätter med extrapris väljer du vilken vecka rätten ska läggas på: Denna vecka, Nästa vecka eller Om 2 veckor. Nästa vecka är förvald.",
      "Raderna visar dagen för veckan du valt, och de nya idéerna sparas på samma vecka.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Välj vecka från receptet",
    bullets: [
      "Under portionerna på receptet väljer du vilken vecka rätten ska ligga på: Denna vecka, Nästa vecka eller Om 2 veckor. Nästa vecka är förvald.",
      "Lägg på matsedeln sätter rätten på första lediga dagen i veckan du valt, och meddelandet säger vilken vecka det blev.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Matsedeln ser ut som en vecka",
    bullets: [
      "Veckans rätter står nu som en kalender: varje rätt har sin dag och datum i en grön kolumn till vänster. Tryck på dagen för att flytta rätten.",
      "Dagar utan rätt står som Ledig – lägg till. Tryck på en, så hamnar nästa rätt du lägger till på den dagen.",
      "Dina recept att lägga till ligger i en egen grå ruta under veckan, så de inte förväxlas med det du redan planerat.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Knappen Lägg till i Matvaror räknar",
    bullets: [
      "På inköpslistan visar knappen Lägg till i Matvaror hur många varor som flyttas när du trycker, till exempel 5.",
      "Siffran följer med när du bockar av eller ångrar en vara.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Idéerna är klara när du öppnar erbjudandena",
    bullets: [
      "När du hämtar veckans erbjudanden tar appen fram nya rätter åt dig i bakgrunden. Du behöver inte vänta eller trycka på något.",
      "Under Rätter med extrapris står idéerna redo under Nya idéer. Tryck på plus, granska och spara när du vill. Vill du ha andra förslag trycker du på Andra idéer.",
      "Samma idéer finns under På erbjudande i Matsedel.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Idéerna är klara när du öppnar erbjudandena",
    bullets: [
      "När du hämtar veckans erbjudanden tar appen fram nya rätter åt dig i bakgrunden. Du behöver inte vänta eller trycka på något.",
      "Under Rätter med extrapris står idéerna redo under Nya idéer. Tryck på plus, granska och spara när du vill. Vill du ha andra förslag trycker du på Andra idéer.",
      "Samma idéer finns under På erbjudande i Matsedel.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Matsedeln säger vad som hamnar på listan",
    bullets: [
      "När du lägger en rätt på veckan står det vilka varor som hamnade på inköpslistan, till exempel Tortillabröd, gräddfil och tomat står på inköpslistan.",
      "Den stora knappen Inköpslistan längst ner på Matsedel är borta. Inköpslistan finns i menyn längst ner, och hur många rätter och varor veckan har står under Veckans rätter.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Nya idéer med extrapris",
    bullets: [
      "Under Rätter med extrapris i Veckans erbjudanden kan du trycka på Nya idéer med extrapris och få två eller tre nya rätter som bygger på veckans extrapriser och det du har hemma.",
      "Varje idé kommer med en kort tanke om varför den passar just nu. Du granskar den och sparar den först när du vill.",
      "Samma knapp finns nu under På erbjudande i Matsedel, i stället för den gamla.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Svep bort recept",
    bullets: [
      "I receptlistan kan du svepa ett recept åt vänster och trycka Ta bort.",
      "Du får först en fråga, så inget försvinner av misstag.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Rätter med extrapris",
    bullets: [
      "Överst i Veckans erbjudanden ser du nu upp till tre av dina egna rätter som använder varor med extrapris, med det mesta sparade först.",
      "Tryck på plus för att lägga rätten på veckan, eller på Visa alla för att se alla i Recept.",
      "I Recept och i Matsedel står det nu tydligt att rätterna föreslås för att varorna har extrapris, och vilka varor det gäller.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Enklare Förråd",
    bullets: [
      "Nu finns en enda kamera i rummet: tryck Fota, ta en eller flera bilder och tryck Klar. Välj från album ligger som en liten länk bredvid.",
      "Summeringen överst är borta. Växla i stället mellan Lista och Kort med de två ikonerna, precis som i Recept. Appen kommer ihåg ditt val.",
      "Lådor där innehållet inte syns har en tydlig rad. Tryck på den så ser du vilka lådor det är, med en bild av var de står, och kan fota insidan på en av dem.",
      "Mer exakt plats heter nu Var i rummet?",
    ],
  },
  {
    date: "2026-11-06",
    title: "Kan lagas nu visar bara det som går att laga",
    bullets: [
      "Filtret Kan lagas nu i Recept visar nu bara recept där inget saknas (Basvaror räknas som hemma).",
      "Under dem finns raden Nästan med recept där 1–2 varor saknas, och varje recept säger vilka, till exempel Saknar grädde, dill.",
      "Recept där det saknas fler än två varor visas inte längre där.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Alla foton av kylen, frysen och skafferiet",
    bullets: [
      "Har du tagit flera foton av samma plats ser du dem nu alla. Under raden Senaste foto står Alla foton (antal).",
      "Fotona ligger som en rad med bilder, de nyaste först, med när de togs. Tryck på ett foto så ser du det med numren och kan ta bort det.",
      "Du ser bara foton som är sparade, alltså de som är yngre än 30 dagar.",
    ],
  },
  {
    date: "2026-11-06",
    title: "En Fota-knapp i Matvaror",
    bullets: [
      "Kyl, Frys och Skafferi har nu en knapp, Fota, som öppnar kameran.",
      "Under den finns en liten länk, Välj från album, när bilden redan finns i telefonen.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Idéer som från en vän",
    bullets: [
      "Vad kan jag laga nu? svarar nu som en vän vid kylen: en kort inledning och några idéer, också små saker som en sås, en dipp eller en macka.",
      "Varje idé är en rad med namn och en mening om hur. Det som saknar en enda vara hamnar under Saknar bara en vara.",
      "Tryck Gör ett recept av den på en idé du vill ha som recept. Inget sparas utan Spara som recept.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Tydligare Sök eller fråga i Förråd",
    bullets: [
      "Fältet Sök eller fråga ser nu ut som ett sökfält med kant och förstoringsglas, och skicka-pilen sitter i fältet.",
      "Ledtexten står under fältet, så det syns vad du skriver i och vad som bara är en förklaring.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Veckans rätter i rätt ordning",
    bullets: [
      "Veckans rätter ligger nu i dagordning, måndag till söndag. Rätter utan dag ligger sist.",
      "När du lägger till en rätt, från + på Matsedel, från ett AI-förslag eller från receptet, hamnar den på första lediga dag. I veckan som är nu börjar vi från idag. Är hela veckan full får rätten ingen dag.",
      "Raden säger vilken dag rätten ligger på, och i meddelandet kan du trycka Byt dag om du vill flytta den.",
    ],
  },
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
    title: "Planera veckan på Matsedel",
    bullets: [
      "Matsedel är nu stället där du planerar veckan: Veckans rätter överst och Lägg till rätter under, med flikarna Favoriter, På erbjudande och Alla recept.",
      "Tryck + så hamnar rätten på veckan utan dag. Du ser direkt hur många varor som hamnar på listan och kan välja dag efteråt. Längst ner står hur många varor veckan behöver köpa, och det du har hemma räknas bort.",
      "På erbjudande visar dina recept där en huvudvara är på rea, med vad du sparar i kronor. Hittar du inget kan du få 2 nya idéer med erbjudandena och granska dem innan något sparas.",
      "Panelen Förslag från erbjudanden och lagret, butiksvalet i Erbjudanden och AI-förslagen längst ner i Recept är borta.",
    ],
  },
  {
    date: "2026-11-06",
    title: "Receptet visar vad som saknas",
    bullets: [
      "Varje vara i receptet säger direkt om den finns hemma, saknas eller redan står på inköpslistan, och visar erbjudandet med vad du sparar.",
      "Köp det som saknas lägger bara de varorna på listan, och Ångra tar bort dem igen. Lägg på matsedeln är ett tryck och rätten hamnar på veckan utan dag. Välj dag är frivilligt.",
      "Laga nu med ett steg i taget är borttaget. Stegen står kvar i receptet.",
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
