# Matkoll – PRD-addendum

Tekniska val och underlag som hör till arkitektur och UX snarare än till PRD:n. Källor: `docs/brief.md` och `docs/autonomi.md`.

## Teknik (från brief och arbetsregler)

| Område | Val |
| --- | --- |
| Ramverk | Next.js (App Router), TypeScript strikt läge, pnpm |
| Styling | Tailwind CSS med tokens från `docs/ux/ux-spec.md`, inget tungt komponentbibliotek |
| Databas och inloggning | Supabase (Postgres, Auth med engångslänk, RLS). Lokal Supabase via CLI under utveckling |
| Drift | Vercel, efter att Epic 1–3 fungerar lokalt |
| AI-klient | Vercel AI SDK bakom ett eget gränssnitt: `parseRecipe`, `analyzeImage`, `suggestDishes`. Leverantör via miljövariabel: `lmstudio`, `anthropic`, `openai`, `mock` |
| Testmodell | Qwen3.6-35B-A3B i LM Studio, `http://localhost:1234` lokalt, Cloudflare Tunnel + Access när appen körs på Vercel |
| Validering | Zod för alla AI-svar och formulär, med nytt försök vid ogiltigt AI-svar |
| Promptar | Samlade på ett ställe, separat från koden |
| Tester | Vitest för logik, Playwright för huvudflödena, RLS-tester mot lokal Supabase |
| CI | GitHub Actions: lint, typkontroll, tester, hemlighetsskanning, RLS-tester |

## Datamodell (utgångspunkt)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| ingredient | Normaliserat namn, synonymer, butiksavdelning, plats, standardenhet, ev. vikt per dl/st | – |
| recipe | Titel, käll-URL, originalportioner, steg, bild-URL, favorit, tid | – |
| recipe_ingredient | Originaltext, mängd, enhet, vag, ev. stegkoppling | recipe, ingredient |
| pantry_item | Mängd (null = obegränsad), enhet, plats | ingredient |
| meal_plan | Namn eller period | – |
| meal_plan_recipe | Valt antal portioner | meal_plan, recipe |
| shopping_list_item | Beräknad mängd, enhet, avbockad, egen vara, ursprung | meal_plan, ingredient |
| recipe_site | Domän, aktiv | – |
| store | Namn, kedja, butiks-id, URL, vald | – |
| product_choice | Produktnamn, förpackningsstorlek, länk | ingredient, store |

Alla tabeller har `user_id` och RLS.

## Ingrediensmatchning

Största risken enligt briefen. Utgångspunkt:
1. Exakt träff på normaliserat namn eller synonym i katalogen.
2. Annars föreslår AI-tjänsten en befintlig katalogingrediens eller en ny (namn, avdelning, plats, standardenhet), som syns i förhandsgranskningen.
3. Pontus rättning sparas som synonym, så att samma originaltext matchar rätt nästa gång.

## Varukorgsexport – formatskiss

```
Matkoll – inköpslista för Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733)
https://handla.ica.se/...

Mejeri
- Grädde, 3 dl – önskad produkt: Arla Matlagningsgrädde 15 % 5 dl
- Smör, 1 st

Frukt och grönt
- Gul lök, 2 st
...

Instruktion: lägg varorna i varukorgen. Välj närmast större förpackning när mängden inte matchar.
Rapportera varor du är osäker på i en separat lista. Beställ inte.
```

Exakt format bestäms i arkitekturen och dokumenteras så att Claude in Chrome kan följa det.

## Version 1.2: Veckans erbjudanden

Beslutad av Pontus 2026-10-26 (`docs/backlog-efter-1-0.md`, punkt 2, den enkla första versionen). Underlag: kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden.md`. Byggs som Epic 9, efter Epic 8 (version 1.1). Kraven i `prd.md` och i avsnittet om version 1.1 gäller som förut.

### Mål

Pontus vill att AI-förslagen tar hänsyn till vad som är billigt i butiken den här veckan. Pontus klistrar in texten från butikens erbjudandesida, eller fotograferar reklambladet, och AI:n plockar ut erbjudandena med samma teknik som receptimporten och bildanalysen. AI-förslagen prioriterar sedan rätter som använder varor på erbjudande i vald butik.

**Användarresa UJ-7. Pontus planerar veckan efter reklambladet.** På söndagen kommer ICA:s reklamblad för nästa vecka. Under Recept väljer Pontus filtret "Kan lagas nu" och trycker "Lägg in erbjudanden". Pontus fotograferar första sidan, och Matkoll visar 18 erbjudanden för vecka 45. Pontus tar bort två som inte är mat och sparar. Sedan trycker Pontus "Föreslå rätter med AI". Två av de tre förslagen har raden "På erbjudande: fläskfilé, broccoli". Pontus sparar ett av dem och lägger det på matsedeln. **Kantfall:** Pontus klistrar in en länk till butikens erbjudandesida. Matkoll hämtar inte sidan, utan ber Pontus kopiera texten på sidan eller ta en skärmbild.

### Ordlista (tillägg)

- **Erbjudande:** en vara som en butik säljer billigare under en vecka och som Pontus har lagt in. Det har namnet som det står i bladet, varan i grundform och priset som text ("29,90 kr/kg", "3 för 2"). Ett erbjudande kopplas till en katalogingrediens när det går, annars bara till varans namn.
- **Veckans erbjudanden:** de erbjudanden som gäller för vald butik och en vecka (måndag–söndag, svensk tid). Det är den senaste vecka som Pontus har lagt in och som inte är slut.

### Nya krav

#### FR-34: Lägga in veckans erbjudanden

Pontus kan lägga in erbjudanden för vald butik genom att klistra in text från butikens sida eller fotografera reklambladet (eller välja en skärmbild).

**Konsekvenser (testbara):**
- AI-tjänsten plockar ut erbjudandena: namnet som det står, varan i grundform och priset som text. Svaret valideras mot ett schema, som vid import (FR-5).
- Pontus ser erbjudandena i en lista före sparning och kan ta bort de som inte ska med. Ingenting sparas förrän Pontus trycker "Spara".
- Erbjudandena sparas för den butik och den vecka som arket visade. Veckan är den här veckan eller nästa, och Pontus väljer.
- Flera inläsningar för samma butik och vecka läggs ihop, så att ett blad med flera sidor kan läsas in en sida i taget. Samma vara två gånger blir ett erbjudande.
- Text som bara är en länk hämtas aldrig. Matkoll säger att den inte hämtar sidor från butiker och föreslår att Pontus kopierar texten eller tar en skärmbild.
- Erbjudanden skapar aldrig nya katalogingredienser.

#### FR-35: Se och ta bort veckans erbjudanden

Pontus kan se de erbjudanden som är inlagda för vald butik och en vecka, ta bort ett och ta bort alla.

**Konsekvenser (testbara):**
- Antalet syns i Recept med filtret "Kan lagas nu", vid knappen "Föreslå rätter med AI".
- En borttagning kan ångras i den korta bekräftelsen.
- Erbjudanden för en vecka som är slut används aldrig och tas bort när Pontus sparar nya erbjudanden.

#### FR-36: AI-förslag med veckans erbjudanden

AI-förslagen (FR-23) prioriterar rätter som använder varor på erbjudande i vald butik den här veckan.

**Konsekvenser (testbara):**
- Utan inlagda erbjudanden är AI-förslagen som i 1.0.
- Med erbjudanden får AI-tjänsten varornas namn bredvid lagret. Ett förslag som använder varor på erbjudande har raden "På erbjudande: fläskfilé, broccoli", och förslagen med flest sådana varor visas först.
- Förslagen utgår fortfarande från lagret: varje förslag använder minst två varor som finns hemma (Epic 5). Från 1.1 är det lagret på valt ställe.
- Lagningsstatus, filtret "Kan lagas nu" och rangordningen ur biblioteket (FR-8, FR-22) påverkas inte av erbjudanden.
- Om erbjudandena inte går att läsa visas förslagen ändå, utan erbjudanden.

#### NFR-10: Erbjudanden utan hämtning från butiker

- Matkoll hämtar aldrig något från en butiks webbplats. Ingen kod i flödet anropar `fetch` eller `safeFetch`, och ett test visar det. Tester och fixturer använder bara påhittade erbjudanden.
- Text och bilder från reklamblad är data, aldrig instruktioner till AI-tjänsten. Foton förminskas i klienten och sparas aldrig (AD-15).
- Inläsningen visar förlopp och går att avbryta och göra om, som import och bildanalys (NFR-7). Raden med veckans erbjudanden svarar inom en sekund.

### Effektmål

SM-5 (variation) får stöd, eftersom veckans erbjudanden ger nya idéer. Nytt motmått: **SM-C4 Fullständighet i erbjudanden:** Matkoll jagar inte alla erbjudanden eller exakta priser. Det räcker att de viktigaste råvarorna i bladet kommer med. Att läsa hela bladet felfritt skulle göra flödet långsamt utan att förslagen blir bättre.

### Utanför 1.2

- Att hämta erbjudanden automatiskt varje vecka från ICA, Willys, Coop och Lidl. Det kräver att varje kedjas webbplats och villkor utreds, och det kan gå sönder när kedjorna ändrar sina sidor. Det är ett senare alternativ, tillsammans med utredningen inför 1.3.
- Att klistra in en länk som servern hämtar (öppen fråga 8 i `docs/oppna-fragor.md`).
- Erbjudanden i inköpslistan, i varukorgsexporten och i rangordningen ur biblioteket.
- Prisjämförelse och kostnadsberäkning (PRD §7).
- Erbjudanden från flera butiker på en gång. Förslagen använder vald butik.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| store_offer | Vecka (måndagens datum), namn som i bladet, vara i grundform, pris som text | store, ingredient (valfritt) |

Detaljerna står i arkitekturens AD-25.
