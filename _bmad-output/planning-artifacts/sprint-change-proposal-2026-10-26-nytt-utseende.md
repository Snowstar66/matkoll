---
title: 'Kursändring: nytt utseende som en app i mobilen (Epic 11)'
date: 2026-10-26
status: godkänd (headless enligt docs/autonomi.md)
trigger: Pontus godkände tre mobilskisser 2026-10-26 och bad om "betydligt trevligare ux. Som ser proffsigare ut."
scope: Moderate
branch: epic/11-nytt-utseende
---

# Kursändring: nytt utseende som en app i mobilen (Epic 11)

Läge: batch och headless. Pontus har godkänt tre skisser och vill att hela appen ser ut och känns som en riktig app i mobilen. Alla val i det här förslaget går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Pontus använde appen i mobilen och bad om "betydligt trevligare ux. Som ser proffsigare ut." Pontus önskemål, med Pontus egna ord:

- Lagervarorna i kategorier: "Kanske protein, mejeri, grönsaker osv. Du får vara lite kreativ. Kanske nån ikon."
- "ta bort mängd i listan. jag kommer inte använda den tror jag. men fyll på med mer info om du har ngn"
- "en soptunna på varje iaf som raderar utan kontrollfråga"
- Inköpslistan "behöver också lyftas".
- "gör hela look and feel som det kommer se ut i mobilen"

Claude gjorde tre skisser, och Pontus godkände alla tre:

| Skiss | Pontus svar |
| --- | --- |
| Lagersaldo (`mockups/lagersaldo.html`) | "ja mycket snyggare enl din skiss" |
| Inköpslista (`mockups/inkopslista.html`) | "inköpslistan börjar bli mkt bättre" |
| Hela appen i mobilen (`mockups/matkoll-mobil.html`) | "ja nu börjar du verkligen hitta ux som app. bravo. håll den stilen" |

Skisserna ligger i `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/`. De innehåller bara påhittade varor.

Svaret på "som det kommer se ut i mobilen" är en och samma responsiva webbapp, plus "Lägg till på hemskärmen": ett webbappmanifest, en appikon och en temafärg, så att Matkoll öppnas i helskärm som en app.

### Typ av ändring

Nya önskemål från Pontus om utseende och känsla. Inget som är byggt är fel. Tre regler i `DESIGN.md` och `EXPERIENCE.md` ändras: kategorier får färgade ikonplattor ("Färgkoda kategorier eller avdelningar" var förbjudet), lagret visas utan mängder (FR-12) och avbockade listposter flyttas till "I korgen" (de stod förut kvar på sin plats).

### Redan i Epic 10 (planeras inte här)

- Story 10.4 byter namn på menyn och sidorna: "Hemma" blir "Lagersaldo" och "Lista" blir "Inköpslista". Katalognamnen får stor första bokstav.
- Story 10.2 lägger "Senaste foto … Visa" under kameraknappen.

Epic 11 planeras nu och byggs när Epic 10 är ihopslagen i `main`. Texterna här använder de nya namnen.

### Underlag

Kontrollerat i koden på `epic/10-spara-foto` (`4ceb250`) och i Next.js 16.4.3-dokumentationen i `node_modules/next/dist/docs/`:

- **Avdelningar:** `SECTIONS` i `src/features/catalog/domain/sections.ts` (Frukt och grönt, Bröd, Mejeri, Kött och fisk, Chark, Frys, Skafferi, Dryck, Övrigt) och samma lista som `check` på `ingredient.section`. AI:ns `hint.section` är fritext som `toSection` mappar med alias. Promptarna `analyze-image.md`, `parse-recipe.md` och `suggest-dishes.md` räknar upp avdelningarna. Exporten och inköpslistans ordning använder `SECTIONS`.
- **Lagervaran:** `pantry_item` har `id`, `user_id`, `site_id`, `ingredient_id`, `location`, `amount`, `unit` och `created_at`. Ingen `updated_at`. `set_pantry_items` och `add_to_pantry` ändrar mängden med `on conflict … do update`, så `created_at` står kvar. Ett byte av enhet eller plats ersätter raden, och då blir `created_at` ny. `restore_pantry_item` ("Ångra") och `restore_pantry_removal` sätter tillbaka raden med samma id men ny `created_at`. `pantry_removal.removed_rows` sparar `id, ingredient_id, location, amount, unit`.
- **Märket:** Story 6.5 ger varje lagerförslag `labels` (högst tre etiketter från modellen, "märke, sort och storlek som på förpackningen"). De sparas aldrig på lagervaran. En märkesrad kräver alltså en ny kolumn.
- **Produktval:** `product_choice.product_name` per katalogingrediens och butik (Story 7.2). Det kan visas som en etikett i inköpslistan utan ändring i databasen.
- **Lagersaldo i dag:** rubrikerna "Med mängd" (rader med mängd till höger) och "Finns hemma" (runda etiketter). En rad tas bort med svep vänster (`SwipeRow`), och en obegränsad vara bara i arket. `ToastProvider` har redan "Ångra" i 5 s, och en ny bekräftelse ersätter den förra.
- **Inköpslistan i dag:** grupperad per avdelning i `SECTIONS`-ordning, "från <rätt>" under varan, mängden till höger och en avbockad post kvar på sin plats. "Lägg i lagret" blir primärknapp ovanför "Skicka till ICA" när något är avbockat.
- **App-skalet:** flikfältet har egna linjeikoner (`src/components/icons.tsx`). `layout.tsx` har `viewportFit: "cover"` och `themeColor` från `theme-colors.ts`. Det finns inget manifest och ingen appikon utöver `favicon.ico`.
- **Next.js 16:** `app/manifest.ts` (`MetadataRoute.Manifest`) ger `/manifest.webmanifest`. `icon` och `apple-icon` kan vara filer eller kod (`ImageResponse` från `next/og`). `metadata.appleWebApp` ger `apple-mobile-web-app-title` och `apple-mobile-web-app-status-bar-style`. Proxyns `matcher` släpper redan igenom sökvägar med filändelse, men en genererad ikon har sökvägen `/icon` utan ändelse.
- **Inloggningen:** bara engångslänk (`signInWithOtp` och `auth/confirm`). En hemskärmsapp på iPhone har egen lagring, skild från Safari, och länken i Mail öppnas i Safari. Utan något mer skulle Pontus bli inloggad i Safari men inte i appen. Supabase skickar en kod (`{{ .Token }}`, `otp_length = 6`) i samma mejl om mallen tar med den.

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [x] | Pontus använde appen i mobilen efter Epic 8 och 10.1. Ingen story är fel. |
| 1.2 | Problemformulering | [x] | Appen fungerar men ser ut och känns som en webbsida. Pontus vill ha kategorier, mindre siffror, snabb borttagning och en app på hemskärmen. |
| 1.3 | Underlag | [x] | Avsnitt 1 och de tre godkända skisserna. |
| 2.1 | Pågående epic | [x] | Epic 10 byggs. Epic 11 rör inte dess stories och byggs efter den. |
| 2.2 | Ändringar på epic-nivå | [x] | Ny Epic 11 med sex stories. |
| 2.3 | Kommande epics | [x] | Epic 9 (vilar): veckans erbjudanden får samma kategorier och kort när den tas upp igen. Inget i dess krav ändras. |
| 2.4 | Ogiltiga eller nya epics | [x] | Inga ogiltiga. En ny. |
| 2.5 | Ordning | [x] | Epic 11 efter Epic 10, före Epic 9. |
| 3.1 | PRD | [!] | Nya krav FR-40–FR-44, NFR-12 och UJ-9 i addendumet. FR-1, FR-12, FR-13 och FR-16 får ändrade konsekvenser. Numren efter Epic 10:s (FR-39, NFR-11, UJ-8) och Epic 9:s (FR-36, NFR-10, UJ-7). |
| 3.2 | Arkitektur | [!] | Ny AD-27, "Appen på hemskärmen". Tillägg i AD-3 (kod), AD-12 (visningskategorier), AD-17 (plattornas tokens och emoji), AD-19 (märke och tid) och AD-20 ("Ångra" behåller `created_at`). |
| 3.3 | UX | [!] | `DESIGN.md`: nya tokens och komponenter, Do's and Don'ts och länkar till skisserna. `EXPERIENCE.md`: kategorier, Lagersaldo utan mängd, soptunnan, sökningen, "I korgen", flikfältet, hemskärmen, Flöde 9. UX-DR23–UX-DR28. |
| 3.4 | Andra artefakter | [!] | En migration (11.2), typer, e-postmallen (kod), proxyns `matcher`, appikoner, tester. Ingen ny miljövariabel. Checklistan för molnet får mallen med kod. |
| 4.1 | Direkt justering | Gångbar | Ny epic inom den befintliga strukturen. Medel insats, låg risk. |
| 4.2 | Återställning | Inte gångbar | Inget behöver göras om. |
| 4.3 | MVP-översyn | Inte gångbar | Ändrar utseende och lägger till. |
| 4.4 | Vald väg | [x] | Alternativ 1: direkt justering med en ny Epic 11. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1–5. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Headless: godkänt enligt grundregeln i `docs/autonomi.md`. Pontus godkände skisserna, och allt går att ändra. Inget kräver Pontus konton eller hemligheter nu. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-11: backlog`, sex stories och `epic-11-retrospective: optional`. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–8 och 10:** inget byggt beteende försvinner. Utseendet ändras i Recept, Matsedel, Inköpslista och Lagersaldo, och några beteenden ändras (avsnitt 2.3).
- **Epic 9 (vilar):** när den tas upp igen använder erbjudandena kategorierna och korten från 11.1.
- **Epic 11 (ny):** sex stories i ordning (avsnitt 4.4).

### 2.3 Påverkan på stories som redan är byggda

| Byggt i | Beteende nu | Med Epic 11 |
| --- | --- | --- |
| 1.3 | Flikfältet med linjeikoner, sidomenyn på dator | Samma flikar och namn (10.4). Ikonerna för Inköpslista och Lagersaldo byts till en kundvagn och ett kylskåp. Sidomenyn står kvar på dator. |
| 1.2 | Engångslänk | Mejlet har också en sexsiffrig kod, och inloggningssidan tar emot den. Länken fungerar som förut. |
| 1.10 | Receptrad med 72 px bild | Receptkort med bilden överst och statusetiketten och hjärtat på bilden. |
| 2.1 | "Med mängd" och "Finns hemma" | Kategorier med ikon. Ingen mängd. En rad per vara, också för obegränsade. |
| 2.3 | Svep vänster för "Ta bort" | Soptunna på varje rad, ingen fråga, "Ångra" i 5 s. Svepet tas bort i Lagersaldo. |
| 3.1 | Matsedelsrätt med 72 px bild, portionsväljare och statusetikett | Kort med 56 px bild, "6 av 8 hemma" och en mätare. Portionsväljaren står kvar. Längst ned "Visa inköpslistan". |
| 3.4 | Avbockad post står kvar, överstruken | Posten flyttas till "I korgen" längst ned. Framstegsraden "8 varor kvar" och "6 av 14 i korgen". |
| 3.3, 3.5 | "från Krämig kycklinggryta", mängd till höger | Rätternas namn utan "från", mängden efter namnet, "Egen vara" och "Saknas i lagret". |
| 3.6 | "Finns hemma?" i stället för mängd | "Saknas i lagret" (eller "Saknas i Stugan") på raden under. |
| 3.7, 7.3 | Två fasta knappar ovanpå varandra | Två fasta knappar i en rad, och ovanpå varandra när de inte får plats. |
| 6.2 | Rätta och Bekräfta sparar mängd och enhet | Sparar också märket från fotot (första etiketten). Arket Lagervara får fältet "Märke eller sort". |
| 7.2 | Produktvalet syns bara i arket | Produktvalet syns som en etikett på raden. |

### 2.4 PRD

- **Nya krav** (addendumet, "Tillägg till 1.1: Nytt utseende"):
  - FR-40: kategorier med ikon;
  - FR-41: Lagersaldo utan mängder, med soptunna och sökning;
  - FR-42: märke och tid på lagervaran;
  - FR-43: inköpslistan i butiken (framsteg, "I korgen", etikett för produktval);
  - FR-44: Matkoll på hemskärmen, med inloggning med kod.
- **NFR-12:** utseendet i mobilen håller tillgänglighetsgolvet.
- **Ändrade konsekvenser:** FR-1, FR-12, FR-13 och FR-16.
- **Användarresa UJ-9:** "Lördagshandling med appen".
- **Effektmål:** inget nytt. SM-2 och SM-3 gynnas.
- **Utanför Epic 11:** en native app, offline och push, en egen avdelning för såser i katalogen, märke från "Lägg i lagret", omsortering av kategorier och egna ikoner per vara.
- `prd.md` §8.3 får en punkt som hänvisar till addendumet.

### 2.5 Arkitektur

- **AD-27 (ny), "Appen på hemskärmen":** `src/app/manifest.ts`, ikonerna, `metadata.appleWebApp`, proxyns undantag för manifest och ikoner, ingen service worker och inga startbilder.
- **Tillägg:**
  - AD-3: inloggning med sexsiffrig kod från samma mejl (`verifyOtp({ email, token, type: 'email' })`), med samma tillåtelselista och samma svar oavsett adress;
  - AD-12: `catalog/domain/categories.ts` med `displayCategory(section, name)` och `CATEGORIES`, en ren visningsregel som aldrig sparas;
  - AD-17: plattornas tokens och regeln att emoji bara används som dekor i kategoriplattor;
  - AD-19: `pantry_item.label` (märke eller sort, valfri) och vad `created_at` betyder;
  - AD-20: "Ångra" sätter tillbaka `created_at` och `label`.
- `.memlog.md`: beslutet loggat.

### 2.6 UX

- **DESIGN.md:**
  - nya tokens: `tile-clay`, `tile-lilac` (med mörka värden), `overlay`, `tile-size`, `card-image`, `dish-thumb`, `row-min` och `meter-height`;
  - nya komponenter: Kategorirubrik, Listgrupp, Listrad, Soptunna, Mätare, Framstegsrad, Produktetikett, Receptkort, Rättkort, Korgrad och Appikon;
  - ändrade Do's and Don'ts (plattor är dekor, emoji bara i plattor);
  - länkar till skisserna och regeln att spine-dokumenten vinner vid konflikt.
- **EXPERIENCE.md:**
  - kategorierna och deras ordning;
  - Lagersaldo utan mängd, raden under varan, soptunnan och sökningen;
  - Inköpslistan med framsteg, "I korgen" och etiketten;
  - korten i Recept och Matsedel;
  - hemskärmen, koden och tillbakalänkar;
  - nya tillstånd och texter, Flöde 9;
  - Interaction Primitives (inget svep i Lagersaldo) och Responsive & Platform (helskärm).

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migration (11.2):** `pantry_item.label text` (valfri, 1–60 tecken). `set_pantry_items`, `apply_pantry_inventory`, `restore_pantry_item`, `restore_pantry_removal` och `pantry_removal.removed_rows` tar med `label` och `created_at`. Typerna genereras om.
- **Ingen migration för kategorierna.** "Såser & smaksättare" räknas fram ur namnet på en vara i Skafferi (avsnitt 3).
- **E-postmallen (11.6):** `supabase/templates/magic-link.html` får koden. Checklistan för molnet säger att mallen läggs in med koden.
- **Proxyn (11.6):** `matcher` släpper igenom `/manifest.webmanifest`, `/icon` och `/apple-icon` utan session.
- **Ingen ny miljövariabel och ingen ändring av AI-porten eller promptarna.**

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** en ny Epic 11 med sex stories i ordning.

| Alternativ | Insats | Risk | Bedömning |
| --- | --- | --- | --- |
| 1. Ny Epic 11 med sex stories | Medel | Låg | Vald |
| 1b. Fem stories som i förslaget, med märket i Lagersaldo-storyn | Medel | Låg | Inte vald. Märket kräver en migration som rör fem Postgres-funktioner. Den granskas bättre som en egen story före gränssnittet. |
| 1c. En native app (Expo, Swift) | Stor | Hög | Inte vald. Briefen säger webbapp, och en app på hemskärmen ger samma känsla. |
| 2. Återställning | – | – | Inte gångbar |
| 3. MVP-översyn | – | – | Inte gångbar |

### Beslut inom alternativ 1

| Fråga | Vald | Alternativ | Varför |
| --- | --- | --- | --- |
| Hur skiljs "Såser & smaksättare" från Skafferi? | En visningsregel: en vara i Skafferi vars namn slutar på eller är ett av orden i en lista (sås, senap, ketchup, majonnäs, dressing, vinäger, buljong, fond, salt, peppar, krydda …) visas under "Såser & smaksättare". Ren funktion i `catalog/domain/categories.ts` med tabelltest. | En ny avdelning i katalogen (migration, `SECTIONS`, `check`, tre promptar, aliasen, omklassning av befintliga varor och AI-utvärdering); ett AI-förslag per vara (ny kolumn och nytt fält i AI-svaret) | Inget sparas och inget i AI-flödet ändras, så regeln gäller direkt också för varor som redan finns. Ett fel syns bara som fel rubrik. Avdelningarna styr fortfarande exporten. Alternativet står som öppen fråga 14. |
| Vilka kategorier? | Nio, i butikens ordning: Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt | Avdelningarna rakt av (Kött och fisk skild från Chark) | Skisserna slår ihop Kött och fisk med Chark, och Mejeri heter "Mejeri & ägg". Avdelningarna är oförändrade under. |
| Ordning i Lagersaldo | Samma butiksordning som i Inköpslistan | En egen ordning per plats (Mejeri först i kylen, som i skissen) | En ordning att lära sig. Skissen visade ett exempel, inte en regel. |
| Ikoner | Emoji i en ljus platta (🥦 🍞 🥛 🥩 ❄️ 🥫 🧂 🥤 🛍️), dolda för skärmläsare. Flikfältet behåller linjeikonerna. | Egna linjeikoner (SVG) i plattorna | Det är så skisserna ser ut, och Pontus godkände dem. Emoji ser ut som i skissen på iPhone och kräver inga ritade ikoner. Kartan ligger på ett ställe och kan bytas mot SVG utan annan ändring. Öppen fråga 15. |
| Plattornas färger | Mint, ljusblått, sand och två nya ljusa toner (lera och syren) som bara används i plattor | Ingen färg | Skisserna. Plattorna är dekor: kategorins namn står alltid bredvid, så färgen bär ingen betydelse. Inget rött: leran är en ljus beige. |
| Raden under en lagervara | Märket om det finns ("Arla laktosfri"), annars "Tillagd idag", "Tillagd igår", "Tillagd för 4 dagar sedan" eller "Tillagd 24 okt" | Mängden; källan ("Från fotot igår"); både märke och tid | Pontus vill inte ha mängden men mer information. Märket säger mest. Tiden hjälper att se vad som är gammalt. En rad räcker, och källan sparas inte i dag. |
| Var kommer märket ifrån? | Den första etiketten från fotot när ett förslag bekräftas eller rättas, och fältet "Märke eller sort" i arket Lagervara. Ny kolumn `pantry_item.label`. | Bara från fotot; också från produktvalet vid "Lägg i lagret" | Fotot har redan etiketterna (6.5). Fältet låter Pontus rätta. Produktvalet kan läggas till senare utan ny migration. |
| Vad betyder "Tillagd"? | `created_at`: när raden skapades. En ändrad mängd ändrar den inte. "Ångra" sätter tillbaka den. | En ny `updated_at` | Det finns redan, och "när kom den hem" är det Pontus vill veta. |
| Soptunnan | Tar bort direkt, utan fråga, och den korta bekräftelsen "Tog bort Gräddfil." med "Ångra" i 5 s. Svepet tas bort i Lagersaldo. Soptunnan är grå. | Behåll svepet bredvid soptunnan | Pontus bad om det. Två vägar till samma sak på en rad är onödigt, och svepet kunde få Safari att gå bakåt. |
| Sök | Fältet "Sök i kylen" överst i listan när platsen har varor. Söker på namn och märke medan Pontus skriver. Töms när platsen eller stället byts. | Sök i hela lagret | Skissen. Listan är per plats. |
| Avbockade poster | Flyttas direkt till "I korgen" längst ned, som är hopfälld ("6 varor i korgen", "Visa"). En bock där tar tillbaka posten. | Står kvar en stund innan de flyttas; står kvar på sin plats | Skissen. Att flytta direkt ger ingen oväntad rörelse under nästa tryck. Öppen fråga 16. |
| Raden under en listpost | Rätterna med " · " emellan, "Egen vara", eller för en vag post "Saknas i lagret" (med flera ställen "Saknas i Stugan") före rätterna | "från …" som i dag | Skissen. "Saknas i Duved" ersätter "Finns hemma?", som var svårläst. |
| Produktval | En liten ljusblå etikett med produktens namn till höger på raden, avkortad | Bara i arket | Skissen ("Scan"). |
| De fasta knapparna | "Skicka till ICA" (sekundär) och "Lägg i lagret" (primär, när något är avbockat) i en rad. Får de inte plats står de ovanpå varandra. | Som i dag, ovanpå varandra | Skissen. |
| Portioner i Matsedel | Portionsväljaren står kvar i kortet, under raden "6 av 8 hemma" | Bara texten "4 portioner" som i skissen | FR-13 kräver att portionerna går att ändra, och arket skulle bli ett extra steg. |
| "Visa inköpslistan" i Matsedel | En knapp längst ned, utan antal | Med antal varor som i skissen | Antalet kräver att listan räknas fram också i Matsedel. Det kan läggas till senare. |
| Hemskärmen | `manifest.ts` med `display: standalone`, `start_url: /recept`, temafärgen `bg`, en appikon (morot på ljus grågrön botten) och `appleWebApp` med statusraden `default` | Service worker och offline; startbilder; en grön statusrad | Det räcker för att öppna i helskärm. Offline ingår inte (öppen fråga 1). Temafärgen är appens grågröna botten, som i dag. |
| Inloggning i appen på hemskärmen | En sexsiffrig kod i samma mejl som länken, och fältet "Kod från mejlet" på inloggningssidan | Bara länken; lösenord | Hemskärmsappen delar inte inloggningen med Safari, och länken öppnas i Safari. Koden är det enklaste som fungerar. Samma tillåtelselista och samma svar oavsett adress. |
| Navigering i helskärm | Varje sida under en flik har en synlig tillbakaknapp | Lita på svep | En hemskärmsapp har ingen bakåtknapp i webbläsaren. |
| "Ny"-etiketten och "från fotot" i skissen | Inte med | En etikett för nya varor och källan | Raden under varan räcker, och källan sparas inte. |
| "✨" på AI-knappen i skissen | Inte med | Gnistor | Voice and Tone säger "AI-förslag", aldrig gnistor. |

**Insats:** medel. 11.1 och 11.4 är störst.
**Risk:** låg. Det mesta är utseende. Migrationen i 11.2 lägger bara till en kolumn och ändrar funktioner som redan har tester. Koden i 11.6 rör inloggningen och prövas med samma tester som länken.
**Tidsplan:** Epic 11 byggs story för story i grenen `epic/11-nytt-utseende` när Epic 10 är ihopslagen.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Tillägg till 1.1: Nytt utseende (Epic 11)"** med mål, UJ-9, ordlista, FR-40–FR-44, NFR-12, ändrade konsekvenser, vad som ligger utanför och datamodellen.
- `prd.md` §8.3: en ny punkt som hänvisar till addendumet.

**Exempel, FR-12:**

```
FÖRE: Lagervaror med mängd visas som rader med mängden till höger. Obegränsade visas som etiketter under "Finns hemma".
EFTER (addendum, ändrade konsekvenser): Varje lagervara är en rad under sin kategori, utan mängd. Under namnet står märket eller när varan lades till (FR-41, FR-42).
```

Skäl: "ta bort mängd i listan. jag kommer inte använda den tror jag" (Pontus, 2026-10-26).

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` omfattar Epic 11, `binds` får FR-40–FR-44 och NFR-12, och `sources` får den här kursändringen och skisserna.
- Tillägg märkta "(Epic 11)" i AD-3, AD-12, AD-17, AD-19 och AD-20.
- **AD-27 (ny), Appen på hemskärmen.**
- Källträdet och Capability Map.
- `.memlog.md`: beslutet loggat.

### 4.3 UX

- `DESIGN.md`: frontmatter (tokens och komponenter), Brand & Style (skisserna och att spine-dokumenten vinner), Colors (plattorna), Components, Do's and Don'ts.
- `EXPERIENCE.md`: Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Responsive & Platform och Flöde 9.

### 4.4 Epics (`epics.md`)

Ny `## Epic 11: Nytt utseende` med:

1. **Story 11.1: Gemensam grund för nytt utseende.** Kategorierna, tokens, kategorirubriken, listgruppen och listraden, soptunnan, mätaren och flikfältets ikoner.
2. **Story 11.2: Märke och tid på lagervaror.** Kolumnen `label`, märket från fotot, fältet i arket och "Ångra" som behåller tid och märke.
3. **Story 11.3: Lagersaldo i nytt utseende.** Kategorier, ingen mängd, raden under varan, soptunnan och sökningen.
4. **Story 11.4: Inköpslistan i nytt utseende.** Kategorier, runda bockar, framstegsraden, "I korgen", raden under posten, produktetiketten och de fasta knapparna.
5. **Story 11.5: Recept och Matsedel i nytt utseende.** Receptkort och rättkort med mätare.
6. **Story 11.6: Matkoll på hemskärmen.** Manifestet, ikonerna, temafärgen, koden och tillbakaknapparna.

Översikten, Requirements Inventory (FR40–FR44, NFR12, UX-DR23–UX-DR28), FR Coverage Map och Epic List är uppdaterade.

### 4.5 Sprintstatus

```yaml
  epic-11: backlog
  11-1-gemensam-grund-för-nytt-utseende: backlog
  11-2-märke-och-tid-på-lagervaror: backlog
  11-3-lagersaldo-i-nytt-utseende: backlog
  11-4-inköpslistan-i-nytt-utseende: backlog
  11-5-recept-och-matsedel-i-nytt-utseende: backlog
  11-6-matkoll-på-hemskärmen: backlog
  epic-11-retrospective: optional
```

### 4.6 Epic-kontext och spec-utkast

- `_bmad-output/implementation-artifacts/epic-11-context.md`, i samma form som `epic-10-context.md`.
- Spec-utkast med status `draft`: `spec-11-1-gemensam-grund-for-nytt-utseende.md`, `spec-11-2-marke-och-tid-pa-lagervaror.md`, `spec-11-3-lagersaldo-i-nytt-utseende.md`, `spec-11-4-inkopslistan-i-nytt-utseende.md`, `spec-11-5-recept-och-matsedel-i-nytt-utseende.md` och `spec-11-6-matkoll-pa-hemskarmen.md`.

## 5. Överlämning

- **Omfattning:** Moderate. En ny epic, en ny AD och tillägg i fem, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 11.1 → 11.6, utan att fråga mellan storyna. Spec-utkasten färdigställs när storyn påbörjas.
- **Gren:** `epic/11-nytt-utseende`, skapad från `epic/10-spara-foto`. När Epic 10 är ihopslagen slås `main` in i grenen innan 11.1 börjar. PR till `main`, med alla sex kontroller och en kodgranskning (AD-23). Planeringsdokumenten följer med i epic-grenen.
- **E2E-användare (en per spec):** `e2e-utseende-marke@matkoll.test` (11.2), `e2e-utseende-lager@matkoll.test` (11.3), `e2e-utseende-lista@matkoll.test` (11.4), `e2e-utseende-recept@matkoll.test` (11.5) och `e2e-utseende-app@matkoll.test` (11.6). 11.1 har bara komponenttester och kör de befintliga e2e-specarna.
- **Klart betyder:**
  - Lagersaldo och Inköpslista ser ut som skisserna, med samma kategorier och ikoner. Recept och Matsedel ser ut som helhetsskissen.
  - En lagervara visar märket eller "Tillagd …", aldrig mängden. Soptunnan tar bort direkt, och "Ångra" ger tillbaka raden med samma id, tid och märke.
  - Inköpslistan visar framstegsraden, flyttar avbockade poster till "I korgen" och visar produktvalet.
  - Matkoll kan läggas på hemskärmen på iPhone, öppnas i helskärm och loggas in med koden.
  - Alla vyer fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och med 44 px tryckytor.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs nu. När molnet sätts upp läggs e-postmallen in med koden. Tre frågor till efter användning står i `docs/oppna-fragor.md` (14–16). Hemskärmen och koden provas på riktig iPhone (listan "Att prova på riktig telefon").
