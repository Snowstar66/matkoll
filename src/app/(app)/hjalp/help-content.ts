import { appName, privacyText } from "@/app/app-info";
import { thingNoun } from "@/lib/thing-noun";
import type { HelpIconName } from "./help-icons";

// The texts of Hjälp och tips (Story 20.2, hjalp-valkomst.html): six areas, one per
// tab in tab order and then Konto (Boenden, Siri, the quick add and who sees the
// data). Each area has three "Så gör du" steps and its questions. They say what the
// app does today; when a feature changes, change its text here too
// (help-content.test.ts keeps the ids in step with the tabs' help anchors).

export type HelpStep = { icon: HelpIconName; title: string; text: string };

export type HelpQuestion = { question: string; answer: string };

export type HelpArea = {
  /** The anchor: `/hjalp#recept`. For the five tabs it is the tab's `helpId`. */
  id: string;
  /** The chip's name, the same as the tab's. */
  title: string;
  steps: readonly [HelpStep, HelpStep, HelpStep];
  faq: readonly HelpQuestion[];
};

const things = thingNoun.plural;

export const helpAreas: readonly HelpArea[] = [
  {
    id: "recept",
    title: "Recept",
    steps: [
      { icon: "link", title: "Spara ett recept", text: `Tryck + och klistra in en länk, fota eller skriv. ${appName} läser in resten.` },
      { icon: "pot", title: "Hitta något att laga", text: "Kan lagas nu visar recepten där inget saknas, och under Nästan de där 1–2 varor saknas. Tryck Vad kan jag laga nu? på Matvaror: dina recept och några nya idéer där allt finns hemma." },
      { icon: "steps", title: "Se vad som saknas", text: "Receptet visar vad som finns hemma, vad som saknas och vad som är på erbjudande. Köp det som saknas lägger varorna på inköpslistan." },
    ],
    faq: [
      {
        question: "Kan jag spara direkt från webbläsaren?",
        answer: `Ja, med Spara i ${appName} skickar du ett recept från en receptsajt utan att kopiera länken. Hur du slår på det står under Inställningar.`,
      },
      {
        question: "Vad betyder märket på receptet?",
        answer: "Vad som saknas hemma, till exempel Saknar 2 varor. Kan lagas nu betyder att allt finns.",
      },
      { question: "Hur sparar jag en favorit?", answer: "Tryck på hjärtat på receptet." },
      { question: "Kan jag ändra antal portioner?", answer: "Ja, med knapparna vid portionerna. Mängderna och vad som saknas räknas om." },
      {
        question: "Hur lägger jag ett recept på matsedeln?",
        answer: "Öppna receptet och tryck Lägg på matsedeln. Det hamnar på veckan utan dag, och knappen Välj dag låter dig välja en dag om du vill.",
      },
      {
        question: "Hur markerar jag en rätt som lagad?",
        answer: "Står rätten på matsedeln finns Markera som lagad under stegen i receptet. Det du bockar dras från Matvaror.",
      },
    ],
  },
  {
    id: "matsedel",
    title: "Matsedel",
    steps: [
      { icon: "calendar", title: "Välj vecka", text: "Denna vecka eller någon av de två nästa." },
      { icon: "plus", title: "Lägg till rätter", text: "Välj bland Favoriter, På erbjudande eller Alla recept och tryck +. Rätten hamnar på veckan utan dag." },
      { icon: "house", title: "Se vad som ska köpas", text: "Raden längst ner räknar varorna veckan behöver. Det du har hemma räknas bort." },
    ],
    faq: [
      { question: "Var hittar jag tidigare veckor?", answer: "Tryck Tidigare bredvid veckans datum. Där kan du hämta idéer igen." },
      {
        question: "Hur hittar jag rätter som är på erbjudande?",
        answer: "Öppna fliken På erbjudande under Lägg till rätter. Där står dina egna recept där en huvudvara är på erbjudande, med det mesta sparade överst och vad du sparar i kronor. Hittar du inget kan du få 2 nya idéer med erbjudandena; de sparas först när du granskat dem och trycker Spara och lägg på veckan.",
      },
      { question: "Spelar det roll vad jag har hemma?", answer: "Det styr inte vilka rätter du får förslag på. Det du har hemma räknas bara bort från vad du behöver köpa." },
      { question: "Kan jag välja dag för en rätt?", answer: "Ja, men du behöver inte. Tryck på dagen (eller Ingen dag) vid rätten och välj en dag. Där ändrar du också portionerna." },
      { question: "Måste jag skriva inköpslistan själv?", answer: "Nej, Inköpslistan räknas fram från veckans matsedel." },
      { question: "Är matsedeln samma i alla boenden?", answer: "Ja. Recept och matsedel är gemensamma; maten hemma hör till boendet." },
    ],
  },
  {
    id: "inkopslista",
    title: "Inköpslista",
    steps: [
      { icon: "list", title: "Listan räknas fram", text: "Från veckans matsedel, minus det du redan har, plus dina egna varor." },
      { icon: "check", title: "Bocka av", text: "Tryck på cirkeln. Det fungerar även utan nät." },
      { icon: "bag", title: "Lägg i Matvaror", text: `När du handlat, så vet ${appName} vad som finns hemma.` },
    ],
    faq: [
      { question: "Hur lägger jag till kaffe eller diskmedel?", answer: "Tryck Lägg till vara högst upp i listan, eller säg det till Siri." },
      {
        // Basvaror (Pontus 2026-11-02).
        question: "Varför står inte salt på listan?",
        answer: "Salt, peppar, vatten och vanliga kryddor är basvaror, som räknas som att ni alltid har hemma. Socker, mjöl, smör och olja räknas bara i små mängder, så 5 dl mjöl till en kaka hamnar på listan. Ändra listan i Inställningar → Basvaror.",
      },
      {
        question: "Kan jag handla till nästa vecka?",
        answer: "Ja. Tryck Denna vecka bredvid Att handla och välj vecka. Dina egna varor syns vilken vecka du än väljer.",
      },
      {
        question: "Hur lägger jag det jag handlat i Matvaror?",
        answer: `Bocka av varorna och tryck Lägg till i Matvaror. Då räknar ${appName} med att du har dem hemma nästa gång listan räknas fram.`,
      },
      {
        question: "Sparas det jag bockar av utan nät?",
        answer: "Ja, och det skickas när du är uppkopplad igen.",
      },
      {
        question: "Vad betyder siffran på fliken?",
        // Story 23.1: news from someone else since this device last looked.
        answer: "Hur många varor andra i hushållet har lagt till eller bockat av sedan du tittade senast. Det du själv gör räknas inte, och siffran försvinner när du öppnar listan. Den kan också synas på appikonen, slå på det i Inställningar → Appen.",
      },
      {
        question: "Var kommer erbjudandena ifrån?",
        // Story 17.11: in the cloud a job fetches them every morning and Sunday evening; a tap there gets the same answer.
        answer: "Från dina butikers egna sidor. I appen i molnet hämtas de automatiskt varje morgon, och nästa veckas kommer så fort butiken lagt ut dem (oftast söndag kväll eller måndag); annars trycker du Hämta veckans erbjudanden. Pristaggen på Inköpslista och Matsedel visar dem. Lägg de du vill ha på listan. Butikerna och länken till erbjudandena lägger du in i Inställningar.",
      },
      {
        question: "Kan jag fylla varukorgen på nätet?",
        answer: "Tryck Kopiera till varukorgen, öppna butikens webbplats och logga in, och klistra in listan i Claude in Chrome. Du granskar varukorgen och beställer själv. Dela listan skickar den som text i stället.",
      },
    ],
  },
  {
    id: "matvaror",
    title: "Matvaror",
    steps: [
      { icon: "fridge", title: "Välj plats", text: "Kyl, Frys eller Skafferi högst upp. Tryck + för en vara." },
      { icon: "camera", title: "Fota kylen", text: `${appName} föreslår varorna. Inget sparas förrän du bekräftar.` },
      { icon: "undo", title: "Ta bort och ångra", text: "Svep en rad åt vänster. Ångra finns kvar en stund." },
    ],
    faq: [
      {
        question: "Varför spelar Matvaror roll?",
        answer: "Det avgör vad som står som Kan lagas nu och vad som dras av på inköpslistan.",
      },
      { question: "Hur ändrar jag en vara?", answer: "Tryck på varan. Där kan du också ta bort den." },
      {
        question: "Kan jag fota frysen och skafferiet också?",
        answer: "Ja, Fotografera finns för varje plats: kylen, frysen och skafferiet.",
      },
      { question: "Kan jag ändra ett förslag från bilden?", answer: "Ja. Ändra eller avvisa varje förslag innan du sparar." },
      { question: "Hur tömmer jag kylen?", answer: "Töm kylen längst ned tar bort allt på platsen, efter en fråga." },
    ],
  },
  {
    id: "forrad",
    title: "Förråd",
    steps: [
      { icon: "door", title: "Börja med ett rum", text: "Tryck + Nytt rum, till exempel Förrådet eller Garaget." },
      { icon: "shelf", title: "Fota en hylla", text: `Öppna rummet och tryck Ta foto. ${appName} listar ${things}en på bilden.` },
      { icon: "ask", title: "Sök eller fråga", text: "Skriv överst, eller tryck ↑ och fråga: var är passen?" },
    ],
    faq: [
      {
        question: "Vad betyder siffran på fliken?",
        // Story 23.1: cards from someone else, and cards the AI has read, since this device last looked.
        answer: "Nya kort som andra i hushållet har tagit, och kort som är färdiglästa, sedan du tittade senast. Dina egna nya kort räknas inte. Siffran försvinner när du öppnar Förråd.",
      },
      {
        question: "Ska maten in här?",
        answer: `Nej, maten bor i Matvaror. Förråd är för ${things} som verktyg och annat som ligger i lådor och på hyllor.`,
      },
      { question: "Kan jag dela upp ett rum?", answer: "Ja, i rummet lägger du till lådor och egna platser." },
      { question: "Något har flyttats. Vad gör jag?", answer: "Ta ett nytt foto av platsen, så uppdateras listan." },
      { question: "Söker den i alla boenden?", answer: `Ja, sökningen går igenom ${things}en i alla dina boenden.` },
      {
        question: "Hur tar jag bort ett rum?",
        answer: `Ett tomt rum tar du bort med Ta bort rummet längst ned i rummet, och du kan ångra direkt. Har rummet ${things} eller kort väljer du ⋯ och Rensa rummet, och skriver rummets namn för att bekräfta.`,
      },
    ],
  },
  {
    id: "konto",
    title: "Konto",
    steps: [
      { icon: "pin", title: "Boenden", text: "Hemma och stugan: byt med nålmärket under rubriken." },
      { icon: "mic", title: "Siri", text: `Säg ”Hej Siri, ${appName}” och vad du vill lägga till.` },
      { icon: "phone", title: "Snabbtillägg", text: "En genväg på hemskärmen öppnar Lägg till vara direkt." },
    ],
    faq: [
      {
        question: "Var finns nålmärket?",
        answer: "Har du mer än ett boende står det med namnet under rubriken på Matsedel, Inköpslista, Matvaror och Förråd. På dator finns det i sidomenyn.",
      },
      {
        question: "Vad hör till ett boende?",
        answer: `Matvaror och ${things}. Inköpslistan räknar av det som finns i det valda. Recept och matsedel är gemensamma för alla boenden, och valet gäller i hela appen, på alla dina enheter.`,
      },
      {
        question: "Hur lägger jag till ett boende?",
        answer: "Under Inställningar, Boenden, lägger du till ett boende, byter namn eller tar bort ett.",
      },
      {
        question: "Hur sätter jag upp Siri?",
        answer: `Skapa en personlig nyckel under Inställningar, Siri och genvägar, och följ stegen i appen Genvägar på iPhone. Sedan säger du ”Hej Siri, ${appName}” och till exempel ”mjölk och ägg”.`,
      },
      {
        question: "Hur gör jag snabbtillägget?",
        answer: "Adressen /lista/lagg-till öppnar Inköpslistan med Lägg till vara redan öppen. Lägg den som genväg på hemskärmen, så skriver du in en vara på en sekund.",
      },
      // Story 21.2b: medlemmar och inbjudan.
      {
        question: "Hur bjuder jag in någon i hushållet?",
        answer: `Under Inställningar, Medlemmar, trycker du Bjud in någon. Dela länken i ett meddelande eller läs upp koden på 6 tecken. Den gäller i 7 dagar och för en person, och inget mejl skickas. Alla i hushållet kan bjuda in.`,
      },
      {
        question: "Hur går jag med i ett hushåll?",
        answer: `Öppna länken du fått, eller tryck Har du en kod? på inloggningssidan. Välj e-post och lösenord, så får du en egen inloggning och ser samma recept, matsedel, lista, matvaror och ${things} som de andra. Har du redan egna recept eller varor i ${appName} går det inte än.`,
      },
      {
        question: "Hur lämnar jag hushållet, eller tar bort någon?",
        answer: "Under Inställningar, Medlemmar. Den som lämnar eller tas bort får ett eget, tomt hushåll, och det den lagt in stannar kvar. Bara ägaren tar bort någon och kan göra någon annan till ägare. Lämnar ägaren blir den som varit med längst ägare.",
      },
      {
        question: "Var ändrar jag mitt namn?",
        answer: "Under Inställningar, Konto. Namnet syns för de andra i hushållet.",
      },
      { question: "Vem kan se min data?", answer: privacyText },
    ],
  },
];

/** The area the address names (`#matvaror`), or Recept. */
export function areaFromHash(hash: string): string {
  const id = hash.replace(/^#/, "");
  return helpAreas.some((area) => area.id === id) ? id : (helpAreas[0]?.id ?? "");
}

/**
 * Lower case without accents, one UTF-16 unit for one, so a match's place in the folded text
 * is its place in the text: "Öppna" → "oppna".
 */
export function fold(text: string): string {
  return text
    .split("")
    .map((unit) => unit.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("sv-SE").charAt(0) || unit)
    .join("");
}

/** The words of a search, folded. */
export function searchWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

export type HelpHit = {
  area: HelpArea;
  kind: "step" | "question";
  title: string;
  text: string;
};

/** The steps and questions of every area that hold every word of `query`, ignoring case and å/ä/ö. */
export function searchHelp(query: string): HelpHit[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const hits: HelpHit[] = [];
  const matches = (title: string, text: string) => {
    const folded = fold(`${title} ${text}`);
    return words.every((word) => folded.includes(word));
  };
  for (const area of helpAreas) {
    for (const step of area.steps) if (matches(step.title, step.text)) hits.push({ area, kind: "step", title: step.title, text: step.text });
    for (const item of area.faq) if (matches(item.question, item.answer)) hits.push({ area, kind: "question", title: item.question, text: item.answer });
  }
  return hits;
}

/** `text` cut into plain parts and the parts that match a word of the search, for the underline. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const words = searchWords(query);
  const folded = fold(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let at = folded.indexOf(word); at >= 0; at = folded.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k += 1) marked[k] = true;
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  for (let k = 0; k < text.length; k += 1) {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[k]) last.text += text[k];
    else parts.push({ text: text[k]!, match: marked[k]! });
  }
  return parts;
}
