import { appName } from "@/app/app-info";
import { thingNoun } from "@/lib/thing-noun";

// The texts of Hjälp och tips (Story 19.2): one section per tab, in tab order,
// then Siri and the quick add, and Boenden. They say what the app does today;
// when a feature changes, change its tip here too (help-content.test.ts keeps
// the ids in step with the tabs' help anchors).

export type HelpTip = { title: string; text: string };

export type HelpSection = {
  /** The anchor: `/hjalp#recept`. For the five tabs it is the tab's `helpId`. */
  id: string;
  title: string;
  tips: readonly HelpTip[];
  /** Whether the section has a chip in the row at the top (the five tabs have; the two last do not). */
  chip: boolean;
};

export const helpSections: readonly HelpSection[] = [
  {
    id: "recept",
    title: "Recept",
    chip: true,
    tips: [
      {
        title: "Spara ett recept",
        text: `Tryck på + och klistra in en länk, skriv eller klistra in texten, eller fota receptet. ${appName} läser in ingredienser och steg och sparar det som alla andra recept.`,
      },
      {
        title: "Spara direkt från webbläsaren",
        text: `Med Spara i ${appName} skickar du ett recept från en receptsajt utan att kopiera länken. Hur du slår på det står under Inställningar.`,
      },
      {
        title: "Vad kan jag laga nu?",
        text: "Kan lagas nu visar recepten med det du har hemma, de som saknar minst överst. Märket på varje recept säger vad som saknas. Hjärtat sparar ett recept som favorit.",
      },
      {
        title: "Laga steg för steg",
        text: "Öppna ett recept och tryck Laga nu: då visas ett steg i taget och skärmen hålls tänd. Du kan ändra portionerna först, så räknas mängderna om.",
      },
      {
        title: "Lägg på matsedeln",
        text: "Från ett recept väljer du en dag och lägger det på matsedeln.",
      },
    ],
  },
  {
    id: "matsedel",
    title: "Matsedel",
    chip: true,
    tips: [
      {
        title: "Planera tre veckor framåt",
        text: "Välj denna vecka eller någon av de två nästa. Tryck + eller Lägg till rätt, välj recept och dag.",
      },
      {
        title: "Se vad som finns hemma",
        text: "Varje rätt visar hur många av ingredienserna du redan har i Matvaror, så du ser vad som behöver köpas.",
      },
      {
        title: "Tidigare veckor",
        text: "Tryck Tidigare bredvid veckans datum, så ser du matsedlarna du har haft. Där kan du hämta idéer igen.",
      },
      {
        title: "Från matsedel till inköpslista",
        text: "Du behöver inte göra något mer: Inköpslistan räknas fram från veckans matsedel.",
      },
    ],
  },
  {
    id: "inkopslista",
    title: "Inköpslista",
    chip: true,
    tips: [
      {
        title: "Listan räknas fram",
        text: "Den bygger på matsedeln. Det du redan har i Matvaror dras av, och varorna sorteras efter avdelning i butiken.",
      },
      {
        title: "Bocka av när du handlar",
        text: "Tryck på cirkeln vid en vara för att bocka av den. Det fungerar även utan nät och sparas när du är uppkopplad igen.",
      },
      {
        title: "Egna varor",
        text: "Tryck Lägg till egen vara för sådant som inte står på matsedeln, till exempel kaffe eller diskmedel. Du kan också säga det till Siri.",
      },
      {
        title: "Lägg i Matvaror när du handlat",
        text: "Bocka av varorna och tryck Lägg till i Matvaror, så vet Livskoll att du har dem hemma nästa gång listan räknas.",
      },
      {
        title: "Erbjudanden",
        text: "Pristaggen visar veckans erbjudanden i dina butiker. Tryck Hämta veckans erbjudanden första gången, och lägg de du vill ha på listan. Butikerna väljer du i Inställningar.",
      },
      {
        title: "Så fyller du varukorgen",
        text: "Tryck Kopiera till varukorgen. Öppna butikens webbplats och logga in, öppna Claude in Chrome och klistra in listan, och granska varukorgen och beställ själv. Dela listan skickar den som text i stället.",
      },
    ],
  },
  {
    id: "matvaror",
    title: "Matvaror",
    chip: true,
    tips: [
      {
        title: "Kyl, Frys och Skafferi",
        text: "Välj plats högst upp. Tryck + för att lägga till en vara, och tryck på en vara för att ändra den.",
      },
      {
        title: "Fota för att fylla på",
        text: `Tryck Fotografera kylen (eller frysen, skafferiet). ${appName} föreslår varor från bilden. Inget sparas förrän du bekräftar, och du kan ändra eller avvisa varje förslag.`,
      },
      {
        title: "Ta bort och ångra",
        text: "Svep en rad åt vänster, eller tryck på varan och Ta bort. Ångra finns kvar en stund. Töm kylen längst ned tar bort allt på platsen efter en fråga.",
      },
      {
        title: "Det styr dina recept",
        text: "Vad du har här avgör vad som står som Kan lagas nu och vad som dras av på inköpslistan.",
      },
    ],
  },
  {
    id: "forrad",
    title: "Förråd",
    chip: true,
    tips: [
      {
        title: `${thingNoun.plural.charAt(0).toUpperCase()}${thingNoun.plural.slice(1)}, inte mat`,
        text: `Förråd är till för ${thingNoun.plural} som verktyg och annat som ligger i lådor och på hyllor. Maten bor i Matvaror.`,
      },
      {
        title: "Börja med ett rum",
        text: "Tryck + Nytt rum längst ned, till exempel Förrådet eller Garaget. I rummet kan du lägga till lådor och egna platser.",
      },
      {
        title: "Fota så hittar du igen",
        text: `Öppna ett rum, tryck Ta foto och fota rummet, en hylla eller en låda. ${appName} listar ${thingNoun.plural}en på bilden, och du kan ta ett nytt kort när något har flyttats.`,
      },
      {
        title: "Sök eller fråga",
        text: `Skriv överst för att söka bland ${thingNoun.plural}en i alla dina boenden, eller tryck ↑ för att ställa en fråga, till exempel var skruvdragaren finns.`,
      },
    ],
  },
  {
    id: "siri",
    title: "Siri och snabbtillägg",
    chip: false,
    tips: [
      {
        title: "Lägg till varor med Siri",
        text: `Skapa en personlig nyckel under Inställningar, Siri och genvägar, och följ stegen i appen Genvägar på iPhone. Sedan säger du "Hej Siri, ${appName}" och vad du vill lägga till, till exempel "mjölk och ägg".`,
      },
      {
        title: "Snabbtillägg från hemskärmen",
        text: "Adressen /lista/lagg-till öppnar Inköpslistan med Lägg till egen vara redan öppen. Lägg den som genväg på hemskärmen när du vill skriva in en vara på en sekund.",
      },
    ],
  },
  {
    id: "boenden",
    title: "Boenden",
    chip: false,
    tips: [
      {
        title: "Flera boenden",
        text: "Har du mer än ett ställe, till exempel hemma och stugan, visas ett nålmärke med namnet under rubriken på Matsedel, Inköpslista, Matvaror och Förråd. På dator finns det i sidomenyn. Tryck på det för att byta.",
      },
      {
        title: "Vad som hör till boendet",
        text: `Matvaror och ${thingNoun.plural} hör till ett boende, och Inköpslistan räknar av det som finns i det valda. Recept och matsedel är gemensamma. Valet gäller i hela appen, på alla dina enheter.`,
      },
      {
        title: "Lägg till eller ta bort",
        text: "Under Inställningar, Boenden, lägger du till ett boende, byter namn eller tar bort ett.",
      },
    ],
  },
];
