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
      { icon: "link", title: "Spara ett recept", text: `Tryck + i rubriken och klistra in en länk, fota eller skriv, och tryck Läs in recept. ${appName} läser in resten. Finns länken redan i Recept får du frågan om du vill öppna receptet eller spara en kopia. Mängder som näve, cups och oz behålls vid inläsning och räknas om till svenska mått. Hittas inget recept på en länk, till exempel från TikTok eller Instagram där receptet står i bildtexten, tar du en skärmbild av texten och väljer Använd Foto (en skärmbild per gång). Går texten att kopiera väljer du Klistra in text i stället.` },
      { icon: "pot", title: "Hitta något att laga", text: "Kan lagas nu visar recepten där inget saknas, och under Nästan de där 1–2 varor saknas. Tryck Vad kan jag laga nu? på Matvaror: dina recept och några nya idéer med det du har hemma." },
      { icon: "steps", title: "Se vad som saknas", text: "Receptet visar vad som finns hemma, vad som saknas (blå ring) och vad som är på erbjudande. Köp det som saknas lägger varorna på inköpslistan." },
    ],
    faq: [
      {
        question: "Kan jag spara direkt från webbläsaren?",
        answer: `Ja, med Spara i ${appName} skickar du ett recept från en receptsajt utan att kopiera länken. På iPhone lägger du till genvägen under Inställningar, Använd med telefonen, och trycker sedan Dela i Safari.`,
      },
      {
        question: "Vad betyder märket på receptet?",
        answer: "Vad som saknas hemma, till exempel Saknar 2 varor. Kan lagas nu betyder att allt finns.",
      },
      { question: "Hur sparar jag en favorit?", answer: "Tryck på hjärtat på receptet." },
      { question: "Kan jag ändra antal portioner?", answer: "Ja, med knapparna vid portionerna. Mängderna och vad som saknas räknas om." },
      {
        question: "Hur lägger jag ett recept på matsedeln?",
        answer: "Öppna receptet och tryck Lägg på matsedeln. Det hamnar på veckan du senast tittade på i Matsedel eller Inköpslista (annars denna vecka), under Ingen dag. Meddelandet har Ångra och Byt vecka, och pillen På matsedeln öppnar veckan där du väljer dag.",
      },
      {
        question: "Hur tar jag bort ett recept?",
        answer: "Öppna receptet och välj Ta bort i menyn ⋯ uppe till höger. Du får en fråga först, eftersom det inte går att ångra.",
      },
      {
        question: "Hur markerar jag en rätt som lagad?",
        answer: "Står rätten på matsedeln finns Markera som lagad under stegen i receptet. Det du bockar dras från Matvaror.",
      },
      {
        question: "Kan jag bocka av stegen medan jag lagar?",
        answer: "Ja. Tryck på stegets nummer så blir det en bock och steget tonas ner. Tryck igen för att ångra. Bockarna försvinner när du markerar receptet som lagat, när du trycker på Börja om under stegen, eller av sig själva efter 12 timmar, så nästa gång är alla steg öppna igen. De sparas bara på den här telefonen. Det går att stänga av under Inställningar, Tillval.",
      },
      {
        question: "Kan jag ta tid på ett steg?",
        answer: "Ja. Står det en tid i ett steg, till exempel 10 minuter, är den understruken. Tryck på den så startar en timer, som syns högst upp i receptet med vad den gäller, till exempel Bakpotatis, och tiden som är kvar. När den är slut ringer telefonen var tredje sekund tills du trycker på bocken, högst två minuter, även när ljudlöst läge är på (iOS 17 eller senare). Ljudet följer telefonens volym, och receptet måste vara öppet på skärmen. Android vibrerar också, iPhone kan inte vibrera från en webbapp. Behöver det lite till trycker du på +1 min eller +5 min. Skärmen släcks inte medan receptet är öppet. Båda går att stänga av under Inställningar, Tillval.",
      },
      {
        question: "Vad är kortet Dagens överst i Recept?",
        answer: "Ett litet kort med dagens datum på ett kalenderblad och en eller två rader om mat: en matdag som Kanelbullens dag, och vad som är som bäst just nu, till exempel pumpa, sparris eller blodapelsiner. Krysset döljer kortet till i morgon. Under Inställningar, Tillval, väljer du om kortet visas, om du vill ha Matdagar och Säsongens råvara (var för sig), och du kan lägga till namnsdagen och Kinesiska almanackan. Almanackan säger vad dagen passar för, gärna om mat, planering och ordning hemma, och en sak att undvika, på varsin rad. Den använder almanackans egna tecken: 宜 (yí) betyder lämpligt och 忌 (jì) betyder undvik. Allt räknas ut i appen.",
      },
      {
        question: "Kan jag dela ett recept med andra?",
        answer: `Ja. Öppna receptet, tryck ⋯ och Dela med andra. Då ser alla hushåll i ${appName} det under Delade i Recept, och receptet får märket Delat. Bara receptet delas: bild, ingredienser, steg och källa, aldrig anteckningar, favoriter, matsedel eller vad ni har hemma. De andra ser ert hushålls namn. Första gången ni delar frågar appen vad andra ska se att ni heter; hoppar ni över det står det Ett hushåll, och ni kan byta namn senare under Inställningar → Medlemmar. Det nyast delade receptet står först under Delade. En kopia som någon sparar delas aldrig vidare. Sparar någon en kopia står det Sparat av och hushållets namn under receptet. Sluta dela gör du i samma meny. Kopior som andra redan har sparat finns kvar hos dem.`,
      },
      {
        question: "Hur använder jag ett recept som någon annan delar?",
        answer: "Tryck Delade i Recept. Ett delat recept går att laga direkt: stegen, timern, portionerna och vad ni har hemma fungerar som vanligt. Spara i mina recept gör en egen kopia som ni kan ändra fritt. Lägg på matsedeln och Köp det som saknas sparar också en kopia, eftersom matsedeln och inköpslistan bara rymmer egna recept. När ni sparar ett delat recept, eller lägger det på matsedeln eller köper det som saknas, ser den som delar ert hushålls namn under Sparat av.",
      },
      {
        question: "Kan jag dela alla recept, eller dölja Delade?",
        answer: "Ja, under Inställningar, Tillval, Delade recept. Dela alla mina recept delar alla era recept, även nya. Sluta dela alla slutar dela allt på en gång. Stänger ni av Dela alla mina recept frågar appen om recepten som delas nu ska sluta delas, eller få vara kvar (Behåll dem). De två gäller hela hushållet. Visa delade recept döljer Delade på den här enheten.",
      },
      {
        question: "Hur vet jag om en rätt är nyttig?",
        answer: "Slå på Visa näring under Inställningar, Tillval. Då visar receptet en tallrik med hur mycket som är grönsaker, protein och kolhydrater, en enkel mening om vad rätten består av (till exempel \"Mycket protein och fett, lite grönsaker och fibrer\"; den beskriver bara och bedömer inte) och märken som Mycket grönt, Fisk, Baljväxter och Fullkorn när rätten har gott om det. Det är ingen poäng och inga råd, bara en ungefärlig bild som räknas från Livsmedelsverkets livsmedelsdatabas på det som går att väga. Saknas mängden för ris, pasta, potatis, kött eller fisk räknar vi på en vanlig portion och skriver Uppskattat. Står ingefära i cm, till exempel 5 cm färsk ingefära, räknas längden om till gram. Matolja till stekning räknas som cirka 5 g per portion. Det som är försumbart, som ingefära, örter och kryddor, listas men stoppar inte räkningen om mängden saknas. Slå på Visa kcal för kcal och gram per portion. I arket Näring visas protein, fett, kolhydrater och fiber som staplar mot ett riktvärde för en måltid, en tredjedel av en dag för en vuxen enligt nordiska näringsrekommendationerna. Riktvärdet är ungefärligt och inget krav. Kladdkakor och andra bakverk får också ett kort. Filtret Nyttigt i Recept visar rätter med mycket grönt, fisk eller baljväxter och lite rött kött. Under Näring i Tillval står hur många av era recept som näringen kan räknas för, och vad som oftast saknas.",
      },
    ],
  },
  {
    id: "matsedel",
    title: "Matsedel",
    steps: [
      { icon: "calendar", title: "Välj vecka", text: "Denna vecka, Nästa eller Om 2 v. Veckan du valt gäller också Inköpslistan och när du lägger en rätt på matsedeln från receptet." },
      { icon: "plus", title: "Lägg till rätter", text: "Veckan står som en kalender med dagens nummer under veckodagen (månaden står på första dagen och när den byter), och en ledig dag, en rad med ett plus, väljer du med ett tryck. Tryck + i rubriken eller fäll ut Lägg till nya rätter (den är ihopfälld tills du öppnar den, och ett tryck på en ledig dag öppnar den) och tryck + på en rätt: den hamnar på den lediga dagen du valt, annars på första lediga." },
      { icon: "house", title: "Se vad som ska köpas", text: "Raden under Veckans rätter räknar varorna veckan behöver. Det du har hemma räknas bort." },
    ],
    faq: [
      { question: "Var hittar jag tidigare veckor?", answer: "Tryck Tidigare bredvid veckans datum. Där kan du hämta idéer igen." },
      {
        question: "Hur hittar jag rätter som är på erbjudande?",
        answer: "Fäll ut Lägg till nya rätter och öppna fliken På erbjudande. Där står dina egna recept där en huvudvara är på erbjudande, med störst rabatt överst och en grön etikett för varje vara som är på erbjudande, till exempel Gul lök 10 kr/kg. Vill du ha något nytt finns Nya idéer under dem: när du hämtat erbjudandena tar appen fram två eller tre förslag med en tanke om varför, så de står redo när du öppnar. Tryck plus, granska och spara med Spara och lägg på veckan. Vill du ha andra förslag trycker du på Andra idéer.",
      },
      { question: "Spelar det roll vad jag har hemma?", answer: "Det styr inte vilka rätter du får förslag på. Det du har hemma räknas bara bort från vad du behöver köpa." },
      { question: "Kan jag välja dag för en rätt?", answer: "Ja, men du behöver inte: rätten får första lediga dag av sig själv. Tryck på dagen (eller Ingen dag) vid rätten och välj en dag. Där ändrar du också portionerna." },
      { question: "Måste jag skriva inköpslistan själv?", answer: "Nej, Inköpslistan räknas fram från veckans matsedel." },
      {
        question: "Kan appen hjälpa mig att välja på en restaurang?",
        answer: "Ja, om du slår på Menyrådgivare under Inställningar, Tillval. Då står Äter ute? under Matsedel. Där ser du en fråga och en knapp: Fota menyn (eller välj ett foto). Under knappen står vilka som är med; tryck på raden för att ändra det, lägga till en gäst eller öppna Smak och allergier. Appen läser menyn medan du väntar och visar rätterna när de dyker upp, och på vilken nivå den läste (Läs noggrannare kör om den med en starkare modell och tar längre tid). Sedan får varje person två eller tre förslag med en kort beskrivning av rätten, den bästa förvald. Tryck på den du vill ha så räknas Ni landar på om (priset i kronor är ungefärligt, märkt ca). Under Se hela menyn finns alla rätter med sökning, och ett tryck på en rätt visar vad den är, vad som är i och vem den passar. Klart visar Ert val: en ren sammanfattning att visa upp för servitören, där du också kan byta dryck för var och en. Bara förklara menyn visar menyn utan råd och utan markeringar. Rätter där någon kan vara allergisk visas inte bort utan flaggas i rött, med vem det gäller; i rättens ark står till exempel Anna: kan innehålla gluten. Fråga personalen. Allergiraden är en gissning utifrån fotot och kan vara fel: fråga alltid personalen. Fotot sparas inte. Vill ni välja åt flera finns du och hushållets medlemmar redan med under Inställningar, Medlemmar, Smak och allergier, och personer utan konto (barn, vänner) lägger du till under Utan konto eller som gäst på startsidan. Det går att fylla i utan att Menyrådgivare är på. Det du fyller i sparas för hushållet, så det syns på alla era telefoner, och alla i hushållet kan ändra. Vill du samla rätter att jämföra finns Lägg till Ikväll i rättens ark; den listan töms när du stänger fliken",
      },
      {
        question: "Vad betyder prickarna på recepten?",
        answer: "De visar vem rätten passar, och bara när någon sticker ut. En ifylld grön prick med bokstaven är den som älskar något i rätten, en beige prick med streckad kant är den som undviker något, och en röd ring med ett ord, till exempel Gluten, är en allergi. Passar rätten alla syns ingen rad alls. På receptlistan, på receptsidan, i Matsedel och i Vad kan jag laga nu? står prickarna där de grå och gröna raderna stod förut. På receptsidan visar ett tryck på raden meningarna, till exempel Anna älskar fetaost. Prickarna bygger på ingredienslistan, så kolla alltid själv vid allvarlig allergi. Röd ring betyder allergi. Ett tryck på en prick öppnar en liten bubbla med vad som gäller, till exempel Anna älskar fetaost (på dator visas den när du pekar på pricken). Under Inställningar, Tillval, Hushållet, väljer du för Visa vem rätten passar mellan Prickar, Text (raderna med ord) och Inget (ingen smakrad; allergivarningar finns kvar). Valet gäller bara den här enheten.",
      },
      {
        question: "Tar förslagen hänsyn till vad vi äter och inte äter?",
        answer: "Ja, om någon i hushållet fyllt i allergier eller smak (det de ogillar eller älskar) under Inställningar, Medlemmar, Smak och allergier. Det gäller även om du inte slagit på Menyrådgivare, och alla i hushållet kan ändra. Idéerna i Vad kan jag laga nu? och förslagen med extrapris visar inga rätter som kan innehålla något någon är allergisk mot, lägger det någon undviker sist med en markering och det någon älskar först. Era egna recept får en liten rad där något träffar, till exempel Anna undviker koriander eller, i rött, Kan innehålla gluten (Anna). Fyller ingen i något syns ingenting extra. Allergiraden bygger på ingredienslistan och kan missa något som är dolt i en vara: kolla alltid själv, särskilt vid allvarlig allergi.",
      },
      {
        question: "Hur fyller jag i vad någon gillar och inte gillar?",
        answer: "Under Inställningar, Medlemmar, Smak och allergier finns ett reglage per sak, från Ogillar via Hellre inte och Okej till Gillar och Älskar. Sakerna ligger i grupper (Protein, Maträtter, Smaker och råvaror) som du fäller ut; raden för gruppen säger hur många du ställt in. Rör bara det du har en åsikt om: allt som står på Okej räknas inte, och inget ifyllt betyder att personen äter allt. Ogillar och Hellre inte räknas som Undviker: rätten får en markering och föreslås inte i första hand, Ogillar mest. Gillar och Älskar får rätten att komma högre upp. Det finns många färdiga val, även för dryck, så du slipper skriva. Saknas något skriver du det under Lägg till egen sak (högst 40 tecken) och får ett eget reglage. Det du ställer in sparas för hushållet och styr Menyrådgivaren, receptlistan, AI-förslagen och Laga nu, och veckans Matsedel. Allergier ligger kvar som en egen sida: de får aldrig föreslås.",
      },
      {
        question: "Kan appen föreslå hela veckans middagar?",
        answer: "Ja, med Veckoagenten. Den är ett Tillval som är av från början: slå på Veckoagenten under Inställningar, Tillval (reglaget gäller bara den här telefonen). Då står ett kort överst i Matsedel: Föreslå veckan när veckan är tom och Fyll resten av veckan när du redan lagt några rätter. Är veckan full finns Gör om i ⋯ i rubriken. Inget körs av sig självt: förslaget tas fram först när du trycker. Du får varje dag med en mening om varför, och märken för erbjudande och det som snart går ut (dagen är en uppskattning av när varan håller till, räknad från när du la in den, så det står Håller till ca fredag). Byt en dag med Byt, lås en dag med låset så att Gör om låter den vara, och tryck Gör noggrannare för en starkare och dyrare modell. Inget sparas i Matsedel förrän du trycker Använd veckan, och utkastet finns kvar om du lämnar sidan och kommer tillbaka (Släng utkast tar bort det). Ett förslag som väntar visas på kortet i Matsedel med Se förslaget, Gör nytt och Förkasta, i ett dygn. Är det äldre säger kortet det och du får göra ett nytt; Förkasta tar bort det utan att något ändras i Matsedel. Använd veckan fyller bara dagar som är tomma, och du kan ångra i tio sekunder. Dina egna rätter, de du själv lagt på en dag, rörs aldrig: de visas som Din rätt, med lås, och agenten planerar resten av veckan runt dem. Allergier är en hård regel: ett recept som kan innehålla något någon i hushållet är allergisk mot föreslås aldrig. Lämnas några recept utanför står det med namn, och väljer du själv en sådan rätt visas den i rött med vem det gäller. Under Ställ in väljer du hur många middagar (3 till 7), budget, vegetariska dagar, dagar att hoppa över, matlådedagar, snabbt på vardagar, det som snart går ut, erbjudanden och vilka butiker som räknas. Valen gäller hela hushållet. Det kostar ungefär en öre per förslag med standardmodellen och ungefär tjugo gånger mer med Gör noggrannare; den som äger appen ser det under AI-kostnad, och dagens AI-tak gäller som för allt annat.",
      },
      {
        question: "Kan appen hjälpa mig hitta ett ställe att äta på?",
        answer: "Ja, med Äta ute (Tillval, av från början: slå på Äta ute under Inställningar, Tillval; reglaget gäller bara den här telefonen). Då står ett kort överst i Menyrådgivaren: Vet inte var ni ska äta? Där söker du i kartan med dina val ifyllda: skriv en ort eller ett postnummer, välj När (Ikväll, Lunch idag eller Valfri tid), ungefär hur långt (500 m till 5 km) och högst tre sorter under Sugen på, och tryck Sök i Apple Kartor eller Sök i Google Maps. Båda knapparna finns alltid, och knappen för din telefon står först. Kartan öppnas utanför appen med en färdig sökning, och där ser du alla ställen, öppettider och betyg. Det kostar ingenting och ingen AI behövs. Skriver du ingen ort använder kartappen telefonens egen plats. Trycker du Använd min plats frågar telefonen först då; platsen avrundas (cirka 1 km) och används bara för att öppna kartan runt dig, och för det valda avståndet är utsnittet ungefärligt (formen på länken är inte provad i alla kartappar). Har du en länk till menyn? Klistra in den under knapparna: appen hämtar sidan (bara https, högst 400 KB) och Menyrådgivaren föreslår rätter ur texten, som när du fotar en meny. Är menyn en bild eller PDF säger appen det, och då tar du ett foto i stället. Allergi gissas aldrig: en meny kan inte bevisa att en rätt är säker. Valen kommer ihåg på den här telefonen, ingenting sparas hos oss. Under Tillval finns också Låt agenten söka på webben (experimentell, av från början): då kommer en knapp Låt agenten föreslå ställen som söker på webben och läser restaurangernas egna sidor åt dig och ger tre till fem förslag med källor. Skriver du inte en ort kan telefonens plats slås upp hos OpenStreetMap (en tredje part, bara ortnamnet används). Adress, öppettider och betyg visas bara när en sida uttryckligen anger dem, med sidan angiven. Allt därifrån kan vara gammalt, så ring och kolla. Webbsökningen kostar cirka 1 kr per sökning och dagens AI-tak gäller; kartsökningen och menylänken är utan webbsökning.",
      },
      { question: "Är matsedeln samma i alla boenden?", answer: "Ja. Recept och matsedel är gemensamma; maten hemma hör till boendet." },
    ],
  },
  {
    id: "inkopslista",
    title: "Inköpslista",
    steps: [
      { icon: "list", title: "Listan räknas fram", text: "Från veckans matsedel, minus det du redan har, plus dina egna varor." },
      { icon: "check", title: "Bocka av", text: "Tryck på cirkeln. Det fungerar även utan nät." },
      { icon: "bag", title: "Lägg till i Matvaror", text: `När du handlat, så vet ${appName} vad som finns hemma.` },
    ],
    faq: [
      {
        question: "Varför frågar listan innan jag tar bort en vara?",
        answer: "Första gången du trycker på soptunnan (eller sveper bort en vara) frågar Inköpslistan om du vill ta bort den. Svarar du Ta bort går de följande borttagningarna direkt i en minut, och Ångra finns alltid kvar. Efter en minut utan borttagning frågar den igen, så ett felklick inte tar bort något.",
      },
      { question: "Hur lägger jag till kaffe eller diskmedel?", answer: "Tryck + i rubriken, eller säg det till Siri. Har du en hel lista att lägga in, välj Fota en lista eller Klistra in en lista i samma ruta." },
      {
        question: "Kan jag fota en lista?",
        answer: "Ja. Tryck + i rubriken och välj Fota en lista: ta en bild av en handskriven lapp, eller välj en skärmdump från till exempel Microsoft To Do. Appen läser raderna, och du ser dem innan något läggs till: bocka av det du inte vill ha och tryck Lägg till. Varor som redan står på listan är inte ibockade. Bilden sparas inte, och när dagens AI-tak är nått kan du i stället välja Klistra in en lista: en vara per rad, med eller utan punkter och mängder, och den läses utan AI.",
      },
      {
        // Basvaror (Pontus 2026-11-02).
        question: "Varför står inte salt på listan?",
        answer: "Salt, peppar, vatten och vanliga kryddor är basvaror, som räknas som att ni alltid har hemma. Socker, mjöl, smör och olja räknas bara i små mängder, så 5 dl mjöl till en kaka hamnar på listan. Ändra listan i Inställningar → Basvaror.",
      },
      {
        question: "Kan jag handla till nästa vecka?",
        answer: "Ja. Välj Nästa eller Om 2 v i raden överst, där varje vecka visar hur många varor den har. Dina egna varor syns vilken vecka du än väljer.",
      },
      {
        question: "Hur lägger jag det jag handlat i Matvaror?",
        answer: `Bocka av varorna och tryck Lägg till i Matvaror. Siffran på knappen visar hur många varor som flyttas. Då räknar ${appName} med att du har dem hemma nästa gång listan räknas fram.`,
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
        answer: "Från dina butikers egna sidor. I appen i molnet hämtas de automatiskt varje morgon, och nästa veckas kommer så fort butiken lagt ut dem (oftast söndag kväll eller måndag); annars trycker du Hämta veckans erbjudanden. Knappen Erbjudanden på Inköpslista och Matsedel visar dem. Överst står butik, vecka och när de hämtades, sedan Rätter med erbjudanden: dina recept och några nya idéer som passar veckans erbjudanden, med små gröna etiketter som Gul lök 10 kr/kg. Själva erbjudandena står längst ned, ordnade per avdelning. Lägg de du vill ha på listan. Butikerna och länken till erbjudandena lägger du in i Inställningar.",
      },
      {
        question: "Kan jag fylla varukorgen på nätet?",
        answer: "Tryck Kopiera till ICA-varukorgen sist i listan, öppna butikens webbplats och logga in, och klistra in listan i Claude in Chrome. Du granskar varukorgen och beställer själv. Dela listan skickar den som text i stället.",
      },
    ],
  },
  {
    id: "matvaror",
    title: "Matvaror",
    steps: [
      { icon: "fridge", title: "Välj plats", text: "Kyl, Frys eller Skafferi högst upp. Tryck + i rubriken för en vara." },
      { icon: "camera", title: "Fota kylen", text: `${appName} föreslår varor från fotot. Inget sparas förrän du bekräftar.` },
      { icon: "undo", title: "Ta bort och ångra", text: "Tryck på soptunnan. Ångra finns kvar en stund." },
    ],
    faq: [
      {
        question: "Varför spelar Matvaror roll?",
        answer: "Det avgör vad som står som Kan lagas nu och vad som dras av på inköpslistan.",
      },
      { question: "Hur ändrar jag en vara?", answer: "Tryck på varan. Där kan du också ta bort den, eller tryck på soptunnan på raden." },
      {
        question: "Kan jag fota frysen och skafferiet också?",
        answer: "Ja, Fota finns för varje plats: kylen, frysen och skafferiet.",
      },
      { question: "Kan jag ändra ett förslag från fotot?", answer: "Ja. Ändra eller avvisa varje förslag innan du sparar." },
      {
        question: "Vad händer när jag trycker Lägg till?",
        answer: "Förslagen sparas och granskningen stängs. Kylen är uppdaterad visas en stund med Ångra, som tar bort det du just lade till. Vill du inte ha förslagen alls trycker du Släng förslagen.",
      },
      {
        question: "Vad betyder att varor syntes inte på fotot?",
        answer: "Efter ett foto kan ett litet kort fråga om varor du har i appen men som inte syntes. Tryck Behåll om de finns kvar, eller Välj vilka och bocka för det som är slut. Det du lagt in de senaste tre dagarna räknas aldrig dit.",
      },
      {
        question: "Vad betyder Ät idag och ett antal dagar på en vara?",
        answer: "Varje vara i kylen har en egen hållbarhet, räknad från dagen du lade in den: köttfärs och fisk 1 dag, grädde 5, mjölk 7, hårdost 30. Sista dagen står Ät idag, därefter hur många dagar varan legat. Är hållbarheten okänd räknas 7 dagar i kylen, och i frysen 60. Skafferiet märks aldrig. Tiderna är försiktiga: titta och lukta alltid själv.",
      },
      {
        question: "Får jag en påminnelse när något bör ätas?",
        answer: "Ja, om du har notiser påslagna. På eftermiddagen kommer en notis om något i kylen bör användas, och när du trycker på den öppnas Matvaror. Finns inget att äta snart kommer ingen notis, och frysen ingår inte. Under Inställningar, Notiser, stänger du av Ät snart.",
      },
      { question: "Hur tömmer jag kylen?", answer: "Töm kylen längst ned tar bort allt på platsen, efter en fråga." },
    ],
  },
  {
    id: "forrad",
    title: "Förråd",
    steps: [
      { icon: "door", title: "Börja med ett rum", text: "Tryck + i rubriken, till exempel för Förrådet eller Garaget." },
      { icon: "shelf", title: "Fota en hylla", text: `Öppna rummet, välj Var i rummet? (Hela rummet, Hylla, Låda eller en egen plats) och tryck Fota. ${appName} listar ${things}en på bilden.` },
      { icon: "ask", title: "Sök eller fråga", text: "Skriv överst, eller tryck Fråga och fråga: var är passen?" },
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
        question: "Kan jag byta färg på appen?",
        answer: `Ja. Under Inställningar, Utseende, väljer du Grön, Blå, Lavendel, Persika, Sand, Rosa eller Egen, där du ställer in tonen själv med reglaget. Färgen ändras direkt, men bara på den här enheten, och Återställ till Grön tar dig tillbaka till hur ${appName} såg ut från början. Där väljer du också Textstorlek (Standard, Större eller Störst) och slår på Fetare text, också bara för den här enheten.`,
      },
      {
        question: "Hur sätter jag upp Siri?",
        answer: `Gå till Inställningar, Använd med telefonen. Skapa en nyckel, tryck Lägg till genvägen och klistra in rubriken när genvägen frågar. Sedan säger du ”Hej Siri, ${appName}” och till exempel ”mjölk och ägg”.`,
      },
      {
        question: "Hur gör jag snabbtillägget?",
        answer: "Adressen /lista/lagg-till öppnar Inköpslistan med Lägg till vara redan öppen. Lägg den som genväg på hemskärmen, så skriver du in en vara på en sekund.",
      },
      // Story 21.2b: medlemmar och inbjudan.
      {
        question: "Hur bjuder jag in någon i hushållet?",
        answer: `Tryck på ditt konto uppe till höger och välj Bjud in någon (eller gå via Inställningar, Medlemmar). Tryck Dela inbjudan och skicka den i ett meddelande, eller läs upp koden på 6 tecken. Den gäller i 7 dagar och för en person, och inget mejl skickas. Alla i hushållet kan bjuda in.`,
      },
      {
        question: "Hur går jag med i ett hushåll?",
        answer: `Öppna länken du fått, eller tryck Har du fått en inbjudan? på inloggningssidan och skriv koden. Välj e-post och lösenord, så får du en egen inloggning och ser samma recept, matsedel, lista, matvaror och ${things} som de andra. Har du redan egna recept eller varor i ${appName} går det inte än.`,
      },
      {
        question: "Hur lämnar jag hushållet, eller tar bort någon?",
        answer: "Under Inställningar, Medlemmar. Den som lämnar eller tas bort får ett eget, tomt hushåll, och det den lagt in stannar kvar. Bara ägaren tar bort någon och kan göra någon annan till ägare. Lämnar ägaren blir den som varit med längst ägare.",
      },
      // Story 21.1: appens ägare bjuder in ett hushåll.
      {
        question: `Hur får någon tillgång till ${appName}?`,
        answer: `Appens ägare bjuder in från Inställningar, Inbjudningar: skriv personens e-postadress och tryck Bjud in, och dela länken i ett meddelande. Personen gör ett eget konto med samma adress och får ett eget hushåll, som sedan kan bjuda in sin familj under Medlemmar. Inget mejl skickas. Frågar du efter tillgång, be ägaren om en inbjudan.`,
      },
      // Tak för AI-kostnad per hushåll.
      {
        question: "Vad betyder att dagens AI-tak är nått?",
        answer: "Varje hushåll får använda AI för ett visst belopp per dag, så att kostnaden hålls nere. När det är slut går det inte att be AI:n om något förrän nästa dag (från midnatt), men allt annat i appen fungerar som vanligt. Appens ägare bestämmer taket under Inställningar, AI-kostnad.",
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
