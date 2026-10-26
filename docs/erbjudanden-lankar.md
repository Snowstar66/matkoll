# Veckans erbjudanden från en länk per butik – förstudie

Undersökt 2026-10-26 (vecka 44). Det här är en förstudie. Ingen kod är ändrad.

**Metod.** Jag hämtade varje erbjudandesida en gång med en vanlig HTTP GET (curl, utan JavaScript och utan inloggning) och sparade den lokalt för analys. WebFetch kunde inte användas för själva strukturanalysen, eftersom verktyget tar bort `<script>`-taggar och därmed den inbäddade datan. Därutöver hämtade jag robots.txt en gång per sajt och ICA:s butiks-sitemap en gång. Villkorssidorna lästes med WebFetch. Jag har inte crawlat något, inte försökt kringgå något skydd och inte anropat några interna API:er.

## Sammanfattning per kedja

| Kedja | URL-mönster | Server-fetch fungerar? | Data | Villkor | Rekommendation |
|---|---|---|---|---|---|
| **ICA** | `https://www.ica.se/erbjudanden/<butiksslug>-<butiksid>/`. Samma URL varje vecka, nytt innehåll. | **Ja.** Svaret är 200 och 0,86 MB. Alla erbjudanden (213 st) finns i `window.__INITIAL_DATA__`. Den synliga HTML-texten innehåller bara de första ~17. | Namn, märke, förpackning, erbjudandetext (`2 för 119 kr`, `Köp 3 betala för 2`, `25% rabatt`), jämförpris, ordinarie pris, `Max 1 köp/hushåll`, giltig t.o.m. (inget från-datum), kategori, EAN, bild och markering `Stammis`/`Klipp`. | robots.txt blockerar inte `/erbjudanden/`. Jag hittade inga allmänna användarvillkor för ica.se. ICA:s chattbotvillkor säger att rättigheterna till innehållet på ica.se tillhör ICA Sverige AB, att information får användas "för ditt personliga bruk" och att man inte ska försöka "få obehörig åtkomst till eller störa tjänster". | **Gör länken.** Läs `weeklyOffers` ur den inbäddade datan deterministiskt. AI behövs inte för att plocka ut erbjudandena. |
| **Willys** | `https://www.willys.se/erbjudanden/butik`. Butiken väljs i gränssnittet. Jag hittade ingen butiksspecifik URL. | **Nej.** Sidan är en Next.js-app där servern bara renderar "Välj butik för att se rätt erbjudanden och reklamblad". Erbjudandena hämtas med JavaScript efter att butik valts. | Ingen data utan JavaScript. | robots.txt blockerar inte `/erbjudanden/` men har `Crawl-delay: 10` och `Visit-time: 0400-0845` (UTC). App-villkoren förbjuder bl.a. att "kringgå eventuella tekniska skyddsåtgärder". E-handelsvillkoren gick inte att läsa utan JavaScript. | **Ingen länk.** Använd klistra in eller foto. |
| **Hemköp** | `https://www.hemkop.se/erbjudanden`. Butiken väljs i gränssnittet. | **Nej.** `__NEXT_DATA__` innehåller bara CMS-sidan, inga erbjudanden. | Ingen data utan JavaScript. | robots.txt är som Willys (`Crawl-delay: 10`, `Visit-time`). Användarvillkoren §15: användning av hemkop.se och dess innehåll är "endast tillåtet för ditt personliga bruk", och annan användning, "både kommersiell och privat", kräver tillstånd. | **Ingen länk.** Använd klistra in eller foto. |
| **Coop** | Gamla butiks-URL:er (`/butiker-varor--erbjudanden/butiker-import/coop/<butik>/`) omdirigeras till `https://www.coop.se/butiker-erbjudanden/`. Ett butiksspecifikt mönster är inte verifierat. | **Nej.** Sidan är en React-app bakom Cloudflare och renderar bara navigeringen på servern. Erbjudandena hämtas från ett externt API med en nyckel som ligger i sidan. Det API:et bör appen inte använda. | Ingen data utan JavaScript. | robots.txt blockerar inte erbjudandesidorna. Användarvillkoren gick inte att läsa utan JavaScript. | **Ingen länk.** Det digitala reklambladet (se Reservvägar) eller foto är bättre. |
| **Lidl** | Översikten `https://www.lidl.se/c/reklamblad/s10018018` är stabil. Erbjudandesidorna (`/c/<namn>/a<id>`) får nya id varje vecka. Erbjudandena är oftast nationella ("i alla butiker"). | **Delvis.** Översikten är serverrenderad och listar veckans reklamblad med datum, men inte varorna. Bladvisaren och erbjudandesidorna undersöktes inte vidare. | Datumintervall och vecka syns. Varorna gick inte att se med en hämtning. | robots.txt blockerar `/1*`–`/9*` och `/q/search`, men inte `/c/` eller `/l/`. Jag hittade inga användarvillkor för webbplatsen, bara "Juridik och Compliance" och villkoren för Lidl Plus. | **Ingen länk i första versionen.** Använd foto av bladet eller klistra in. |

## Pontus butik: Maxi ICA Stormarknad Östersund

- **Erbjudanden (länken att spara):** `https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/`. Adressen kommer från ICA:s butiks-sitemap, som robots.txt hänvisar till. Sidan anger samma adress som canonical. Butiks-id 1003733 är samma id som i e-handelns URL.
- **E-handelns URL** (`https://handlaprivatkund.ica.se/stores/1003733`), som redan finns i appen, är en annan plattform. Den visar e-handelns sortiment och priser, inte butikens veckoblad. Använd ica.se-adressen för veckans erbjudanden. Mönstret från butiks-id är `ica.se/erbjudanden/<slug>-<id>/`, men sluggen går inte att räkna ut från id:t. Låt därför Pontus klistra in hela adressen.
- **Digitalt reklamblad:** butikens egen sida länkar till `https://www.e-magin.se/latestpaper/s4rsrp27/paper` ("DRBlad"). Adressen pekar alltid på senaste bladet och är en bra reserv att fotografera eller skärmdumpa.
- **Vad hämtningen gav (v. 44):**
  - 213 erbjudanden i `offers.weeklyOffers`.
  - Giltighet `validTo`: 188 gäller t.o.m. 2026-11-01. Några få gäller längre, upp till 2026-11-22, och två har kortare tid.
  - Kategorier: 122 st är "Hem & fritid", vilket betyder mycket non-food på en Maxi. Resten är Färskvaror 24, Skafferivaror 22, Hälsa & skönhet 12, Bröd 11, Frukt & Grönt 10, Djupfryst 8 och Mejeri 4. Filtrera bort non-food.
  - Märkningar (`traits`): `Stammis` på 7 st, `Klipp` på 31 st och `Butiksunikt` på alla.
  - `restriction`: `Max 1 köp/hushåll` på 10 st och `Max 2 köp/hushåll` på 6 st.
  - `mechanicInfo` är färdig erbjudandetext. `parsedMechanics` delar upp samma sak strukturerat, t.ex. antal 2 och värde 119.
- **Exempel på ett erbjudande (förkortat):**

  ```json
  {
    "details": { "brand": "Arla", "name": "Herrgård®, Präst®, Grevé®", "packageInformation": "Ca 700 g", "mechanicInfo": "89 kr/kg" },
    "category": { "articleGroupName": "Färskvaror" },
    "validTo": "2026-11-01T00:00:00",
    "comparisonPrice": "", "restriction": "",
    "stores": [{ "regularPrice": "111,90-140,76", "referencePriceText": "Ord.pris 111:90-140:76 kr." }],
    "traits": ["Stammis", "Butiksunikt"]
  }
  ```

- **Svaret innehåller också sessionsdata:** en anonym `publicAccessToken`, cookies, ett sessions-id och interna API-adresser i `env`. Appen ska bara läsa `offers.weeklyOffers`. Den får aldrig använda token eller API-adresserna, och sådant får aldrig sparas eller loggas.
- **Format:** `__INITIAL_DATA__` är en JavaScript-literal, inte strikt JSON. Den innehåller `undefined` och `new Map([])`. Den måste tolkas tolerant genom att ta ut blocket och ersätta de kända konstruktionerna, och får **aldrig** köras med `eval` eller `Function`.
- **Svarshuvuden:** `ratelimit-limit: 72` per 60 s och Akamai framför. En hämtning per vecka ligger långt under gränsen. Hämtningen gjordes med webbläsarens User-Agent. Om Akamai godtar appens egen User-Agent (`Matkoll/1.0`) är **inte provat**, och det ska inte lösas genom att utge sig för att vara en webbläsare. Om ICA nekar ska appen falla tillbaka på klistra in eller foto.

## Rekommendation: "länk per butik i Inställningar"

1. **Spara en erbjudande-URL per butik**, med ett separat domänfilter för erbjudanden (första versionen bara `www.ica.se`). Återanvänd inte listan över receptdomäner. Validera att adressen har mönstret `/erbjudanden/<slug>-<id>/`.
2. **Hämta på servern via den befintliga fetch-porten** (`src/server/fetch`). Gränserna 3 MB och 10 s räcker, eftersom ICA-sidan är 0,86 MB. Hämta bara när Pontus trycker på knappen, högst en gång per butik och vecka, och cacha resultatet till och med `validTo`. Använd en ärlig User-Agent som säger vad appen gör (dagens säger "personal recipe import").
3. **ICA: läs den inbäddade datan deterministiskt, inte med AI.**
   - Receptimportens väg fungerar inte här: `extractRecipePage` tar bort skript och kapar texten vid 12 000 tecken, så AI:n skulle bara se ungefär de första 17 erbjudandena av 213.
   - En egen parser för `weeklyOffers` ger alla fält strukturerat: namn, märke, erbjudandetext, jämförpris, ordinarie pris, max-köp, `validTo`, Stammis och kategori.
   - Den är gratis, snabb och går att testa mot en fixtur.
   - AI kan användas i ett andra steg för att matcha erbjudandena mot katalogen. Läsningen av sidan behöver ingen AI.
4. **Fall tillbaka till klistra in eller foto** när parsern inte hittar `weeklyOffers`, när svaret är 403/429/captcha eller när kedjan inte stöds. Fortsätt ge en tydlig felkod, t.ex. `fetch_blocked` eller "sidan har ändrats", och erbjud klistra in eller foto direkt. Det är samma mönster som `offersPasteTextInstead`. Reklambladslänken (e-magin) kan visas som hjälp: "öppna bladet och fotografera".
5. **Willys, Hemköp, Coop och Lidl:** ingen länkhämtning. Visa reservvägarna. Kedjornas interna JSON-API:er (Coop har en nyckel i sidan, Axfood laddar via JavaScript) ska inte användas. Det vore att använda ett API som inte är publicerat, och Willys app-villkor nämner att man inte får kringgå tekniska skyddsåtgärder.

## Stabilitetsrisker

- **Strukturändringar:** `window.__INITIAL_DATA__` och fältnamnen (`weeklyOffers`, `details.mechanicInfo`, `traits`) är ICA:s interna frontend-format och inget publicerat API. De kan ändras utan förvarning; frontend-bygget är versionsmärkt (`__BUILD_V__`). Parsern ska validera med ett schema och hellre misslyckas tydligt än gissa.
- **Botskydd:** ICA ligger bakom Akamai med rate limit och Coop bakom Cloudflare. Ett nej (403, 429 eller en utmaningssida) ska ge reserv, aldrig nya försök i en loop.
- **URL-ändringar:** Coops gamla butiksadresser omdirigeras redan till en generell sida. ICA:s slug kan ändras om butiken byter namn. Följ redirect, och visa "länken pekar inte längre på en erbjudandesida" när det inte går.
- **Innehåll:** Erbjudanden saknar från-datum, och vissa gäller flera veckor. Medlemsmärkningen (`Stammis`) är en etikett i datan. Hur den ska tolkas mot priset bör visas som det står, inte räknas om.

## Villkor (vad texterna säger)

- **ICA:**
  - robots.txt tillåter allt för `*` utom `/templates/ajaxresponse.aspx`. GPTBot och meta-externalagent blockeras bara från djupa `/butiker/`- och `/recept/`-sökvägar.
  - `handlaprivatkund.ica.se/robots.txt` är tom.
  - Jag hittade inga allmänna användarvillkor för ica.se.
  - Chattbotvillkoren säger att innehållet på ica.se tillhör ICA Sverige AB eller dess licensgivare och att genererad information får användas för personligt bruk. Man får inte "kopiera, reproducera, distribuera, modifiera, återpublicera eller kommersiellt utnyttja" den.
  - Köpvillkoren för e-handel nämner inte automatiserad åtkomst.
- **Willys:** robots.txt har `Crawl-delay: 10` och `Visit-time: 0400-0845`. Villkoren för Willys app förbjuder bl.a. att kopiera, dekonstruera eller "kringgå eventuella tekniska skyddsåtgärder". Villkorssidan för e-handel visade ingen text utan JavaScript.
- **Hemköp:** robots.txt som Willys. Användarvillkoren §15 (Immateriella rättigheter): användning är "endast tillåtet för ditt personliga bruk", och annan användning, "både kommersiell och privat", kräver Hemköps tillstånd.
- **Coop:** robots.txt tillåter erbjudandesidorna. "Användarvillkor för kundkonto hos Coop" visade ingen text utan JavaScript.
- **Lidl:** robots.txt blockerar inte `/c/` eller `/l/`. Jag hittade inga användarvillkor för webbplatsen.
- Ingen av de texter jag läste nämner robotar eller skrapning uttryckligen. Det här är en sammanfattning av texterna, ingen juridisk bedömning.

## Reservvägar per kedja

- **ICA:** butikens digitala reklamblad via e-magin (`latestpaper`-länk per butik, finns i ica.se-sidans data) och ICA-appen.
- **Willys och Hemköp:** reklamblad per butik efter butiksval på webben samt kedjornas appar (Willys Plus, Klubb Hemköp).
- **Coop:** digitalt reklamblad på `dr.coop.se/Butik/<butiksnamn>?c=<år>-<vecka>`, sett i sökresultat men inte hämtat, samt Coop-appen för medlemspriser.
- **Lidl:** nationella reklamblad på `lidl.se/l/sv/reklamblad/...` (datum i adressen) och Lidl Plus-appen för Lidl Plus-erbjudanden.
- **Inga RSS-flöden hittades**, och jag hittade ingen öppet publicerad PDF-länk. För alla kedjor gäller appens befintliga vägar: klistra in text eller fotografera bladet.

## Tester

- Tester får **aldrig** anropa kedjornas sajter. Följ mönstret i `src/server/fetch/fixture-sites.ts` och `tests/fixtures/sites/manifest.json`, så att hämtningen går mot sparade sidor.
- **Fixturen** ska vara en nedbantad ICA-sida som bara innehåller ett `<script>` med `window.__INITIAL_DATA__ = {...}` och några få erbjudanden. Ta med ett med `Stammis`, ett med `Max 1 köp/hushåll`, ett `MultiLine` (`Köp 3 betala för 2`) och ett non-food. Konstruktionerna `undefined` och `new Map([])` ska vara kvar så att den toleranta tolkningen testas.
- **Ta bort** `publicAccessToken`, cookies, sessions-id, `env`-adresser, butikens sidfot och bild-URL:er. Checka inte in mer verklig butiksdata än vad som behövs.
- **Testa även felfallen:** sidan saknar `__INITIAL_DATA__`, `weeklyOffers` är tom, svaret är 403/429 och sidan är för stor. Varje fall ska ge fallback till klistra in eller foto.
