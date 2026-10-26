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

## Version 1.1: Flera ställen

Beslutad av Pontus 2026-10-26 (`docs/beslutslogg.md`, "Ordning för tilläggen efter 1.0"). Underlag: `docs/backlog-efter-1-0.md`, punkt 1, och kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-flera-stallen.md`. Byggs som Epic 8. Kraven i `prd.md` gäller som förut, med de avgränsningar som står nedan.

### Mål

Pontus har lager på mer än ett ställe, till exempel hemma och i vinterstugan. Matkoll ska komma ihåg vad som finns i stugans kyl, frys och skafferi, så att Pontus handlar rätt inför resan dit och varken köper dubbelt (två ketchup) eller saknar något (senap).

**Användarresa UJ-6. Pontus ska till stugan.** På fredagen lägger Pontus helgens rätter på matsedeln och byter till Stugan under Lista. Listan räknas nu mot stugans lager. Ketchup finns i stugan och kommer inte med, men senapen är slut och står på listan. Pontus handlar på vägen. I stugan trycker hen "Lägg i lagret", och varorna hamnar i stugans kyl och skafferi. På söndagen väljer hen Hemma igen. **Kantfall:** Pontus vill veta om det finns kaffe i stugan medan hen är hemma. Hen väljer Stugan i Hemma, ser skafferiet och väljer Hemma igen.

### Ordlista (tillägg)

- **Ställe:** ett ställe där Pontus har ett lager, till exempel Hemma eller Stugan. Varje ställe har platserna Kyl, Frys och Skafferi. Det första stället heter Hemma, och befintligt lager ligger där.
- **Valt ställe:** det ställe som gäller just nu, alltid exakt ett. Det sparas på servern och gäller på alla Pontus enheter.
- **Lager** betyder i 1.1 lagret på ett ställe. Lagret summeras aldrig över ställen.

### Nya krav

#### FR-29: Hantera ställen

Pontus kan lägga till ställen, byta namn på dem och ta bort ett ställe som är tomt.

**Konsekvenser (testbara):**
- Befintligt lager ligger efter uppdateringen på stället "Hemma", som är valt. Inga lagervaror försvinner eller ändras.
- Ett namn har 1–40 tecken och är unikt per användare, utan hänsyn till stora och små bokstäver. Det får finnas högst 10 ställen.
- Ett ställe kan tas bort bara om det inte har några lagervaror och inte är valt. Det sista stället kan aldrig tas bort.
- Varje ställe har samma tre platser (Kyl, Frys, Skafferi), och samma regler för lagervaror som i 1.0 (FR-11, AD-19).

#### FR-30: Välja ställe

Pontus kan välja vilket ställe som gäller, med ett tryck i Hemma.

**Konsekvenser (testbara):**
- Valt ställe styr Hemma, lagningsstatusen och "X av Y hemma" (FR-8, FR-13, FR-20), rangordningen och AI-förslagen (FR-22, FR-23), inköpslistans avdrag (FR-15), "Lägg i lagret" (FR-19) och bildanalysen (FR-24, FR-25).
- Valet sparas på servern direkt och gäller på alla enheter tills Pontus väljer ett annat ställe. Matkoll byter aldrig ställe på egen hand.
- När det finns fler än ett ställe syns valt ställe i Hemma, inköpslistan, matsedeln, receptvyn och receptbiblioteket med filtret "Kan lagas nu".

#### FR-31: Se ett ställes lager på distans

Pontus kan se lagret på vilket ställe som helst, var hen än är.

**Konsekvenser (testbara):**
- Att välja ett ställe i Hemma visar dess platser och lagervaror. Matkoll använder aldrig enhetens position.
- Lagervaror på ett ställe kan läggas till, ändras och tas bort på distans, på samma sätt som på plats (FR-11).

#### FR-32: Inköpslistan räknas mot valt ställe

Inköpslistan drar av lagret på valt ställe. Det syns vilket ställe det är, och stället går att byta direkt från listan.

**Konsekvenser (testbara):**
- Med Stugan vald och ketchup bara hemma kommer ketchup med på listan. Med senap i stugan kommer senap inte med.
- När det finns fler än ett ställe visar listan "Lager: Stugan" och knappen "Byt". Bytet är detsamma som att välja ställe i Hemma (FR-30).
- Avbockningar, rättade mängder, dolda poster och egna varor står kvar när stället byts (FR-18). En post som blir täckt försvinner från listan, men dess bock finns kvar och syns igen om posten kommer tillbaka.
- "Lägg i lagret" lägger varorna på det ställe som listan räknades mot. Bekräftelsen nämner stället när det finns fler än ett.
- Varukorgsexporten (FR-26) innehåller de poster som listan har för valt ställe. Formatet ändras inte.

#### FR-33: Skrivningar hamnar på det ställe som visades

Det Pontus sparar hamnar på det ställe som vyn visade när hen tryckte, även om stället har bytts på en annan enhet under tiden.

**Konsekvenser (testbara):**
- Arket Lagervara, borttagning med "Ångra", bekräftade lagerförslag, inventering, "Töm kylen" med "Ångra" och "Lägg i lagret" skickar med ställets id från vyn.
- "Ångra" sätter alltid tillbaka på det ställe som varorna togs bort från.
- Ett ställe som har tagits bort ger ett begripligt fel och ingen skrivning.

#### NFR-9: Migrering och svarstider för ställen

- Uppdateringen till 1.1 är en migration som bara lägger till. Den fungerar med 1.0-koden under driftsättningen (AD-5), och ett integrationstest visar att lagret har samma rader och mängder före och efter.
- Byte av ställe och visning av ett annat ställes lager svarar inom en sekund, som lagret i övrigt (NFR-7).

### Ändrade konsekvenser för befintliga krav

| Krav | I 1.1 |
| --- | --- |
| FR-8, FR-13, FR-20 | Lagningsstatus, "Saknar N varor" och "X av Y hemma" räknas mot valt ställe. |
| FR-11 | En lagervara hör till ett ställe och en plats. Arket Lagervara sparar på det ställe Hemma visar. Att flytta en vara till ett annat ställe ingår inte. |
| FR-12 | Platskorten och listan gäller valt ställe. |
| FR-15 | Avdraget görs mot valt ställe. |
| FR-19 | Varorna läggs på katalogingrediensens plats på det ställe som listan räknades mot. |
| FR-22, FR-23 | Rangordningen och AI-förslagen utgår från valt ställe. |
| FR-24, FR-25 | Fotot gäller en plats på valt ställe. Lagerförslag, inventering (6.4) och tömning (6.3) sparas på det stället. |

### Effektmål

SM-1 (mindre matsvinn, inga dubbelköp) gäller också i stugan. Nytt motmått: **SM-C3 Automatik i valet av ställe:** Matkoll gissar aldrig var Pontus är (ingen position och inget schema). Det skulle ge fel lager utan att det syns.

### Utanför 1.1

- Att flytta eller kopiera lagervaror mellan ställen.
- Att välja ställe automatiskt efter position eller tid.
- Att summera lagret över flera ställen, eller att räkna mot två ställen på en gång.
- En egen matsedel eller inköpslista per ställe. Den aktuella matsedeln är fortfarande en (AD-22).
- Ställen som delas med andra användare.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| pantry_site | Namn, normaliserat namn (unikt), vald (högst ett per användare) | – |
| pantry_item | Får `site_id` (inte null) | pantry_site |

Detaljerna står i arkitekturens AD-24.
