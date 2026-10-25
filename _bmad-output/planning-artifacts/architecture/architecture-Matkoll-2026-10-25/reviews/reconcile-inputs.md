---
type: review
target: ../ARCHITECTURE-SPINE.md
lens: reconcile-inputs
created: '2026-10-25'
inputs:
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/addendum.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md
  - docs/brief.md
  - docs/autonomi.md
---

# Avstämning: arkitekturspinen mot underlagen

## Utlåtande

Spinen täcker underlagens stora linjer väl: lagerregler, RLS, AI-porten, domänbegränsningen, mängdlogiken på ett ställe och en framräknad inköpslista. Men den har **7 allvarliga luckor eller motsägelser** som ger olika implementationer i olika stories om de inte rättas: var katalogkopplingen sker (före eller vid sparning), om JSON-LD går förbi AI-normaliseringen, datamodellfält som tappats ur ERD:n, inköpslistans överlägg som inte klarar UX:ens rättningar och borttagningar, tillåtelselistan som går att kringgå, seed av rader som tillhör en användare, och de kontrollerade listorna för butiksavdelning och plats. Därtill kommer 9 medelstora och 7 små punkter. Spinen bör uppdateras innan epics och stories skrivs.

Allvar: **Hög** = olika stories kommer att bygga olika saker, eller ett krav/en kontroll bryts. **Medel** = tyst krav som saknar ägare och upptäcks sent. **Låg** = förtydligande eller beslut som bör loggas.

---

## Hög

### H1. Katalogkopplingen sker vid sparning, men UX och PRD kräver den före

- **Källa:** PRD FR-5, FR-6 ("Ingenting sparas i receptbiblioteket förrän Pontus sparar", katalogingrediens kan ändras före sparning), FR-25 ("Avvisade lagerförslag sparas inte"); addendum "Ingrediensmatchning" punkt 2 ("syns i förhandsgranskningen"); EXPERIENCE Component Patterns "Ingrediensrad" (osäker koppling får "Kontrollera", ny katalogingrediens märks "Ny"), Flöde 1 steg 4–5, Flöde 3.
- **Vad som motsäger:** AD-10 säger att `saveRecipe(draft)` kopplar varje rad via `catalog.resolveIngredient`, alltså först vid sparning. Förhandsgranskningen kan då inte visa koppling, osäkerhet eller "Ny". AD-6 säger också att `resolveIngredient` **skapar** en ny katalogingrediens när inget matchar. Anropad från import eller bildanalys skapar den katalograder för recept som aldrig sparas och för lagerförslag som avvisas, vilket bryter FR-6 och FR-25. Matchningssteg 3 ("sedan AI-förslag") inne i en Server Action strider dessutom mot AD-9 (AI-arbete bara i Route Handlers som går att avbryta).
- **Föreslagen ändring:** Dela AD-6 i två funktioner. `matchIngredient(text)` är ren läsning och körs i AI-routen. Den returnerar `{ ingredientId | null, confidence: 'exact' | 'synonym' | 'ai' | 'new', proposed?: { name, section, location, defaultUnit } }` och läggs per rad i `RecipeDraft` och per förslag i `PantrySuggestion`. `ensureIngredient(match)` körs bara i sparande actions (`saveRecipe`, bekräfta lagerförslag, skapa lagervara, egen vara) och skapar katalogingrediens och synonym där. Skriv i AD-10: "En draft innehåller föreslagen koppling per rad; inget skrivs till katalogen före sparning."

### H2. JSON-LD går förbi AI-normaliseringen

- **Källa:** PRD FR-5 ("Stegen skrivs om i samma stil oavsett källa", mängd, enhet och ingrediens separeras); brief Epic 1 ("AI omvandlar receptet till ett eget enhetligt format … stegen skrivs om i samma stil"); FR-3 ("Saknas den, **eller är den ofullständig**").
- **Vad som motsäger:** AD-11 säger "JSON-LD används först; annars skickas sidans läsbara text till `parseRecipe`". Det kan läsas som att JSON-LD-recept aldrig går genom AI. Då blir `recipeIngredient` ("2 dl vispgrädde, gärna ekologisk") inte uppdelad i mängd, enhet och katalogingrediens, och stegen skrivs inte om. Ett kriterium för "ofullständig" saknas också.
- **Föreslagen ändring:** I AD-11/AD-10: JSON-LD är *indata* till `parseRecipe`, inte en ersättning för den. `parseRecipe` tar `{ kind: 'jsonld', data } | { kind: 'text', text } | { kind: 'image', … }`. Definiera "ofullständig" (saknar `recipeIngredient` eller `recipeInstructions`); då används sidans text. Titel, bild-URL, portioner och tid tas direkt från JSON-LD när de finns.

### H3. Datamodellfält från addendum och PRD saknas i spinen

- **Källa:** addendum "Datamodell"; PRD ordlistan §3, FR-8 (bild, titel, **tid**, portioner), FR-9, FR-11, FR-12, FR-19 ("på katalogingrediensens plats"), FR-21 ("de receptrader som hör till steget"), FR-26, FR-27, FR-28; EXPERIENCE Settings (Butik: namn, kedja, butiks-id, adress); DESIGN `recipe-row` ("35 min · 4 portioner").
- **Vad som saknas:** ERD:n visar bara relationer. Prosan nämner `meal_plan.is_current`, `store.is_selected` och `recipe.source`. Följande har konsekvenser i flera moduler och saknas:
  - `ingredient`: `name`, `normalized_name` (unik per användare; AD-6 gör bara synonymen unik), `section` (butiksavdelning), `location` (plats), `default_unit`. Används av listans gruppering, FR-19, FR-11 (förvald plats), exporten och AI-schemat.
  - `recipe`: `is_favorite` (FR-9), `total_time_minutes` (FR-8; JSON-LD `totalTime` är ISO 8601-varaktighet), `image_url`, `original_servings`. `recipe.source` blandar ihop "URL eller `ai`" och har inget värde för text- och fotoimport. Föreslå `source_kind` (`link | text | photo | ai`) + `source_url` (null utom för `link`). EXPERIENCE "Ett sparat AI-förslag får källan 'AI-förslag'" blir då en visningsregel.
  - `recipe_ingredient`: `original_text`, `quantity`, `unit`, `is_vague`, `position` och **stegkoppling** (addendum "ev. stegkoppling"). Utan den kan stegläget (FR-21) inte visa stegets receptrader. Ingen relation `recipe_step ↔ recipe_ingredient` finns i ERD:n.
  - `recipe_step`: `position`, `text`.
  - `pantry_item`: `location`, `quantity` (null = obegränsad), `unit`. Plats saknas helt i spinen trots FR-12 och FR-24.
  - `store`: `name`, `chain`, `external_store_id`, `address`, `url` (adress krävs i exporten enligt FR-26; addendum har URL men inte adress, PRD har adress; ta med båda).
  - `product_choice`: `product_name`, `package_size`, `url`, unik på `(user_id, ingredient_id, store_id)` (EXPERIENCE: "gäller för den katalogingrediensen i vald butik").
  - `meal_plan`: `name` eller period, `created_at` (för listan "Tidigare").
- **Föreslagen ändring:** Lägg till kolumnerna (eller en kompakt kolumntabell per tabell) i Datamodell, samt relationen `recipe_step ||--o{ recipe_ingredient : "används i (valfritt)"` eller `step_id` på receptraden. Byt `recipe.source` mot `source_kind` + `source_url`. Lägg fältet för stegkoppling i `RecipeDraft`.

### H4. Butiksavdelning och plats saknar kontrollerade listor

- **Källa:** PRD §3 (Butiksavdelning: Frukt och grönt, Bröd, Mejeri, Kött och fisk, Chark, Frys, Skafferi, Dryck, Övrigt; Plats: Kyl, Frys, Skafferi); autonomi Standardval (samma listor); FR-5 (AI föreslår avdelning och plats).
- **Vad som saknas:** AD-12 låser enheterna men inte avdelning och plats, trots att de används i AI-scheman, katalogen, listans gruppering och ordning, exporten, platskorten och FR-19. Utan ett gemensamt schema hittar AI-adaptrar, lagret och listan på egna stavningar.
- **Föreslagen ändring:** Utöka AD-12 (eller lägg till AD-18): `catalog/domain/sections.ts` och `catalog/domain/locations.ts` med Zod-enum, fast visningsordning (listans grupper följer ordningen ovan) och Postgres-`check` eller `enum` i migrationen. AI-svarsschemat använder samma enum. Okänd avdelning blir `Övrigt`.

### H5. Inköpslistans överlägg klarar inte UX:ens rättningar, borttagningar och egna varor

- **Källa:** EXPERIENCE IA "Listpostdetalj: **Rätta mängd**, se ursprung, ange produktval, ta bort egen vara"; Interaction Primitives ("Svep vänster på en **listpost** … för att visa Ta bort", "kan ångras"); Component Patterns "Listpost" (vag post: avbockning betyder "har köpt den eller har den redan"); PRD FR-17 ("fritext, kopplas till katalogen **om det går**"), FR-19; addendum `shopping_list_item` (lagrad tabell med beräknad mängd, avbockad, egen vara, ursprung).
- **Vad som motsäger eller saknas:**
  1. AD-8 lagrar bara avbockningar och egna varor. En rättad mängd eller en borttagen *beräknad* listpost har ingen plats och försvinner vid nästa läsning.
  2. AD-6 säger "listposter … refererar alltid `ingredient_id`", medan ERD:n säger att `shopping_custom_item` kopplas "valfritt" och FR-17 säger "om det går". Det är en intern motsägelse. Det är också oklart vad "Lägg i lagret" gör med en egen vara utan katalogkoppling (till exempel "diskmedel"), eftersom en lagervara alltid kräver en katalogingrediens (FR-11).
  3. FR-19 för en avbockad "Finns hemma?"-post: vilken mängd hamnar i lagret? Med null blir varan obegränsad för alltid.
  4. Avvikelsen från addendum (lagrad `shopping_list_item` ersatt av en framräknad lista med överlägg) är ett medvetet val men är inte motiverad mot addendum eller loggad.
- **Föreslagen ändring:** Lägg till en tabell `shopping_line_override (meal_plan_id, line_key, quantity_override numeric null, hidden boolean)` i AD-8, eller utöka `shopping_check` till ett generellt överlägg per `line_key`, och låt `computeList` tillämpa det. Rätta AD-6: egna varor *får* sakna `ingredient_id`. Utan koppling grupperas de under Övrigt, och "Lägg i lagret" tar bort dem från listan utan att skapa en lagervara. En vag post blir lagervara utan mängd (obegränsad) bara om den inte redan finns; annars ändras inget. Skriv i spinen att AD-8 ersätter addendums `shopping_list_item` och logga det i `docs/beslutslogg.md` (autonomi Grundregel).

### H6. Tillåtelselistan går att kringgå, och då nås AI-tjänsten

- **Källa:** PRD FR-1 ("Andra adresser får ingen åtkomst"), §6 Kostnad ("AI-tjänsten nås bara bakom inloggning"); brief Risker ("missbruk av nyckel"), AI-upplägg Tunnel ("bara Vercels serverfunktion får anropa modellen").
- **Vad som saknas:** AD-3 kontrollerar `ALLOWED_EMAILS` innan länken skickas och i `auth/callback`. Supabase-URL:en och den publika nyckeln finns i klienten, så vem som helst kan anropa Supabase Auth direkt (`signInWithOtp`/signup), få en giltig session och lägga den i cookies. `requireUser()` kontrollerar bara `getClaims()`, inte listan. En sådan session når alltså `/api/ai/*` (Pontus Mac eller en betald nyckel senare) och kan skriva egna rader via PostgREST.
- **Föreslagen ändring:** I AD-3: (a) stäng av öppen registrering i Supabase (`[auth] enable_signup = false` i `config.toml` och i molnprojektet) och skapa Pontus användare med seed- eller adminskript, eller använd en Auth Hook ("before user created") som kontrollerar listan; (b) `requireUser()` kontrollerar också att `claims.email` finns i `ALLOWED_EMAILS` och ger annars `unauthorized`. Lägg till ett integrationstest för en icke tillåten session mot en AI-route.

### H7. Seed av rader som tillhör en användare fungerar inte, varken lokalt eller i molnet

- **Källa:** PRD FR-7 (startlista koket.se och tasteline.com), FR-28 och EXPERIENCE Settings ("Förvald: Maxi ICA Stormarknad Östersund"); brief Epic 7 (butiks-id 1003733); spinen Datamodell ("`recipe_site` seedas …").
- **Vad som motsäger:** AD-4 ger varje tabell `user_id not null default auth.uid()`. `seed.sql` körs utan inloggad användare, innan Pontus konto finns, och `supabase db push` kör ingen seed i molnet. Startlistan för receptsajter och förvald butik hamnar alltså inte hos Pontus. Butiken nämns inte alls i seed.
- **Föreslagen ändring:** Lägg till en regel: standarddata per användare skapas av en idempotent `bootstrapUser()` som anropas från `auth/callback` (eller av en databastrigger på `auth.users`). Den skapar `recipe_site` (koket.se, tasteline.com) och `store` (Maxi ICA Stormarknad Östersund, ICA, 1003733, adress, URL) om de saknas. `seed.sql` används bara för lokal testdata.

---

## Medel

### M1. AAS-kontrollerna "vid varje commit" och kodgranskning saknas

- **Källa:** brief AAS-styrning "Tvingande kontroller" (hemlighetsskanning och lint **vid varje commit** och i CI; kodgranskning före varje sammanslagning; "blockerar sammanslagning **eller driftsättning**"); PRD NFR-8; autonomi "Stanna och fråga … om en säkerhetskontroll … skulle behöva stängas av".
- **Vad som saknas:** Spinen har bara CI. Den har ingen pre-commit-krok (gitleaks på staged-filer, lint/typkontroll på ändrade filer), ingen grenskydd på `main` med obligatoriska kontroller, inget krav på kodgranskning och ingen spärr för Vercel-driftsättning när CI fallerar. En ensam ägare kan inte godkänna sin egen PR på GitHub, så kravet behöver en konkret form.
- **Föreslagen ändring:** Lägg till AD "Tvingande kontroller": `lefthook` (eller `husky` + `lint-staged`) med `gitleaks protect --staged` och `eslint` i pre-commit, installerad via `prepare`-skript. Grenskydd på `main` med obligatoriska CI-jobb. Kodgranskning sker som ett obligatoriskt steg (till exempel `bmad-code-review`) vars resultat noteras i PR:en. Vercel driftsätter produktion bara från `main`, så att CI-spärren också gäller driftsättning. Lägg kontrollen i Capability-mappen under NFR-8.

### M2. Fotouppladdning: storleksgräns och format

- **Källa:** PRD FR-4 (foto av kokbokssida), FR-24; EXPERIENCE Responsive & Platform ("Kamera: Bakre kameran direkt", iPhone Safari är huvudmålet); spinen AD-15.
- **Vad som saknas:** Ett iPhone-foto är ofta 3–6 MB och kan vara HEIC. Vercel-funktioner tar emot högst 4,5 MB i förfrågan, och vision-modellen behöver inte full upplösning. Spinen säger inget om att förminska bilden eller om format, så bildanalysen kan fungera lokalt men falla i molnet.
- **Föreslagen ändring:** Lägg till i AD-15: klienten skalar ned bilden till JPEG (till exempel längsta sida 1600 px, under 1,5 MB) med canvas före uppladdning. Routen avvisar mer än 4 MB med en egen felkod (`image_too_large`), och bilden skickas som `multipart/form-data` till `/api/ai/analyze` och `/api/ai/import`.

### M3. När Macen sover: AI-tjänsten nås inte

- **Källa:** PRD §6 ("Pontus Mac, som måste vara igång"); brief AI-upplägg ("Macen hålls vaken och ansluten till laddare", "Datorn måste vara igång när appen används", "tänkläget är avstängt"); EXPERIENCE State Patterns "AI-tjänsten nås inte … Resten av appen fungerar"; NFR-7 ("går att avbryta eller göra om").
- **Vad som saknas:**
  - Ingen tidsgräns för anslutningen. När tunneln är nere svarar Cloudflare med en HTML-felsida (502/530/1033). Den måste mappas till `ai_unavailable` och får inte räknas som `ai_invalid` med två nya försök.
  - Avbrott: `AbortController` i klienten stoppar inte genereringen i LM Studio om inte `request.signal` skickas vidare till AI SDK-anropet. Annars blockerar en avbruten import Macens enda modell.
  - Ingen regel om att sidor och `data` aldrig anropar AI vid rendering. Det är det som håller resten av appen igång.
  - Tänkläget är avstängt: adaptern för `lmstudio` måste stänga av tänkläget (Qwen3 "no think") och inte förlita sig på inställningar i LM Studio.
  - LM Studio ska bara lyssna på localhost (ingen LAN-port). Variablerna för Cloudflare Access-token ska finnas i `env.ts` och `.env.example`.
- **Föreslagen ändring:** Komplettera AD-9: anslutningstidsgräns cirka 5 s, så att ett svar som inte är JSON eller ett nätverksfel ger `ai_unavailable` utan nya försök; `signal` skickas genom porten till adaptern; inga AI-anrop i `data` eller vid rendering; `lmstudio`-adaptern stänger av tänkläget. Komplettera AD-14 med `CF_ACCESS_CLIENT_ID` och `CF_ACCESS_CLIENT_SECRET` (valfria när `AI_PROVIDER=lmstudio` körs lokalt). Lägg en rad i driftdiagrammet: "LM Studio binder 127.0.0.1; Macen vaken på laddare".

### M4. Atomära skrivningar över flera tabeller och moduler

- **Källa:** PRD FR-19 (avbockade varor blir lagervaror och försvinner från listan), FR-14 ("Använd igen skapar en ny matsedel"), FR-6 och FR-10 (spara och ändra recept med rader och steg); spinen AD-6 ("slår ihop" katalogingredienser), AD-8 ("i samma action").
- **Vad som saknas:** supabase-js har inga transaktioner över flera anrop. "Lägg i lagret" skriver i två moduler (lagret, överlägget), `saveRecipe` i fyra till fem tabeller, och att byta `is_current` med partiellt unikt index kräver två uppdateringar i rätt ordning. När katalogingredienser slås ihop måste `ingredient_id` pekas om i tabeller som AD-1 säger att bara andra moduler får skriva.
- **Föreslagen ändring:** Lägg till en regel: skrivningar över flera tabeller görs i en Postgres-funktion (`security invoker`, så att RLS gäller) som skapas i en migration och anropas med `rpc` från ägarmodulens `data`. Namnge dem: `save_recipe`, `commit_checked_to_pantry`, `set_current_meal_plan`, `merge_ingredients`. Gör ett uttalat undantag i AD-1 för `merge_ingredients` (katalogen äger ompekningen i databasen).

### M5. Varukorgsexportens innehåll och skydd är inte låst

- **Källa:** PRD FR-26 (per **icke avbockad** listpost: vara, mängd, enhet, produktval; butikens namn och adress; osäkra matchningar rapporteras separat), §6 Butikens villkor ("Matkoll gör aldrig något i butiken själv"); brief Epic 7 ("Agenten beställer aldrig själv"); addendum formatskiss (instruktionen "Välj närmast större förpackning … Beställ inte.", butiks-URL, gruppering per avdelning); EXPERIENCE "Urklipp nekat".
- **Vad som saknas:**
  - AD-16 låser bara rubrikraden och versionen. Det krav som faktiskt skyddar mot beställning, instruktionsraden "Beställ inte", står inte i spinen.
  - Det är inte bestämt hur vaga poster ("Finns hemma?") och poster med olika enheter ska exporteras.
  - Kopiering till urklipp i iOS Safari misslyckas om `writeText` körs efter en `await` (användarens tryck räknas inte längre).
- **Föreslagen ändring:** I AD-16: lista vad exporten måste innehålla (bara icke avbockade poster; grupperade i avdelningsordning; butikens namn, kedja, id, adress och URL; produktval; ordagrann instruktion med "Beställ inte" och "rapportera osäkra varor separat"). Bestäm att vaga poster utelämnas och att poster med olika enheter exporteras med receptets mängd. Golden-file-testet kontrollerar instruktionsraden. Exporttexten beräknas av `exportBasket` på redan laddad listdata, så att kopieringen sker synkront i tryckhändelsen.

### M6. Sökning medan man skriver saknar läsväg från klienten

- **Källa:** EXPERIENCE Component Patterns "Sökfält" (söker på titel och ingrediens, även synonymer, efter 200 ms paus, i Recept, Lägg till rätt och Lagervara); PRD FR-8, FR-11 ("söker i katalogen (även på synonymer)").
- **Vad som motsäger:** AD-2 säger att läsning bara sker i Server Components via `data` och att det inte finns någon klientcache. Sökning medan man skriver i ark (Lägg till rätt, Lagervara) passar inte den modellen.
- **Föreslagen ändring:** Bestäm en väg i AD-2. Antingen (a) laddar sidan hela receptlistan eller katalogen med synonymer (en användare, litet datamängd) och filtrerar i klienten med en ren `domain`-funktion, eller (b) tillåts läsande Server Actions som börjar med `requireUser()`. Rekommendation: (a) för recept och katalog.

### M7. Borttagning, kaskader och "Ångra"

- **Källa:** EXPERIENCE Kort bekräftelse ("Efter borttagning med knappen Ångra i 5 s"), Interaction Primitives ("Övriga borttagningar kan ångras"; "ta bort matsedel" kräver bekräftelse); PRD FR-10 (ta bort recept), FR-14 (tidigare matsedlar).
- **Vad som saknas:** Spinen anger inget `on delete`-beteende förutom `auth.users`. Vad händer med `meal_plan_recipe` i tidigare matsedlar när ett recept tas bort? Vad händer med `pantry_item`, `product_choice` och receptrader när en katalogingrediens tas bort eller slås ihop? Hur fungerar ångra: ska raden återskapas, eller behövs mjuk borttagning?
- **Föreslagen ändring:** Lägg till en kort regel: FK från receptrader, lagervaror och produktval till `ingredient` är `restrict` (en katalogingrediens tas inte bort, den slås ihop). `meal_plan_recipe → recipe` är `cascade`. Den aktuella matsedeln räknas om. "Ångra" återskapar raden med samma `id` via en action, eftersom borttagningen är hård, utom för beräknade listposter som döljs med överlägget (H5).

### M8. Inloggningsflödet: omdirigering, länk i annan webbläsare och e-postgräns

- **Källa:** EXPERIENCE State Patterns "Inte inloggad" ("Efter länkklick tillbaka till sidan man försökte nå"); PRD FR-1 ("förbli inloggad på enheten"); iPhone Safari som huvudmål.
- **Vad som saknas:**
  - Parametern som tar Pontus tillbaka (`next`) skickas genom e-postlänken och måste begränsas till relativa sökvägar inom appen. Annars blir den en öppen omdirigering.
  - Standardflödet i `@supabase/ssr` (PKCE) kräver att länken öppnas i samma webbläsare som begärde den. En länk från Mail-appen eller Gmail kan öppnas i en annan.
  - Supabase inbyggda e-post i molnet har en låg gräns för antal utskick.
- **Föreslagen ändring:** I AD-3: validera `next` som en sökväg som börjar med `/` men inte `//`; använd e-postmallen med `token_hash` + `verifyOtp` i `auth/callback`, så att länken fungerar oberoende av webbläsare; notera att egen SMTP kan behövas i molnet (läggs på Pontus checklista).

### M9. Hur lagret summeras per katalogingrediens

- **Källa:** PRD FR-15 ("Lagervaror med mängd i samma enhet dras av"), FR-19 ("eller ökar en befintlig med samma enhet"), FR-12 (lagret per plats), §3 Obegränsad.
- **Vad som saknas:** AD-7 beskriver jämförelsen men inte vilka lagerrader som slås ihop. Samma ingrediens kan finnas i Kyl och Frys, i olika enheter, eller både med och utan mängd. FR-19 "en befintlig" kräver en identitetsregel.
- **Föreslagen ändring:** I AD-7: `coverage` summerar alla lagervaror för samma katalogingrediens och enhet oavsett plats. Finns någon obegränsad lagervara räknas behovet som täckt. Identiteten för FR-19 är `(ingredient_id, unit, location)`, med ett unikt index (`unit` null behandlas som lika).

---

## Låg

### L1. "Vikt per dl/st" motsäger "enheter räknas aldrig om"

- **Källa:** addendum `ingredient` ("ev. vikt per dl/st"); brief Datamodell (samma).
- **Vad som motsäger:** AD-7 och AD-12 säger att enheter aldrig räknas om, och PRD SM-C1 och §7 avstår från exakt omräkning.
- **Föreslagen ändring:** Skriv uttryckligen att kolumnen inte finns i v1, och logga valet.

### L2. AI-testuppsättningen ska köras vid varje byte av leverantör

- **Källa:** brief AI-upplägg "Testuppsättning … körs vid varje leverantörsbyte"; PRD §10.1 fråga 2.
- **Vad som saknas:** Spinen skjuter upp innehållet men beskriver inte mekanismen. CI kör bara `mock`.
- **Föreslagen ändring:** Lägg till konventionen `pnpm eval:ai` (läser `tests/fixtures/ai/`, kör mot `AI_PROVIDER` och skriver en rapport). Skriptet körs manuellt mot den riktiga modellen och ingår inte i CI.

### L3. Felformen behöver parametrar, åtgärd och klientfel

- **Källa:** EXPERIENCE Voice and Tone ("koket.se släppte inte in oss. Klistra in recepttexten i stället."; "[domän] är inte en godkänd receptsajt." + "Öppna inställningar"); State Patterns "Utan nät", "AI-svar ogiltigt" (vid import läggs "eller klistra in texten" till), "Import … Avbryt".
- **Vad som saknas:** AD-13 har `{ code, message }`. Åtgärdsknappen ("Klistra in text i stället", "Öppna inställningar", "Försök igen") och meddelandet bestäms per kod. Det saknas koder för `cancelled`, `image_too_large` och `not_found`, och klientens nätverksfel (en Server Action som inte når servern kastar ett fel i klienten) har ingen kod.
- **Föreslagen ändring:** Lägg till en valfri `action?: 'paste_text' | 'open_settings' | 'retry'` i felet, eller en tabell från kod till åtgärd i `errors.ts`. Lägg till koderna ovan och en klientomslutning som mappar nätverksfel till `offline`, med meddelandet från State Patterns.

### L4. Godkända receptsajter som Pontus själv lägger till

- **Källa:** PRD FR-7 (lägg till utan kodändring), EXPERIENCE Settings ("bara domännamn, valideras"); brief Domänbegränsning.
- **Vad som saknas:** Hur en domän normaliseras (gemener, utan schema, sökväg och `www.`, punycode). Kontrollen "inga IP-adresser" i AD-11 gäller bara själva värdnamnet. En domän som läggs till och pekar på en privat adress (till exempel `127.0.0.1.nip.io`) kommer igenom.
- **Föreslagen ändring:** I AD-11: Zod-schema för domänen i `settings/domain`, och fetch-porten slår upp DNS och avvisar privata och lokala adresser före anslutning.

### L5. När en matsedel skapas

- **Källa:** PRD FR-13 (favorit med högst två tryck "räknat från matsedelsvyn **eller receptbiblioteket**"), FR-14; EXPERIENCE "Tom inköpslista – Utan matsedel".
- **Vad som saknas:** Vem skapar den aktuella matsedeln när ingen finns? Kan en egen vara läggas till utan matsedel, när AD-8 kopplar egna varor till matsedeln? Får samma recept finnas två gånger på en matsedel?
- **Föreslagen ändring:** `addToMealPlan` skapar en aktuell matsedel om ingen finns, och samma gäller när en egen vara läggs till. Samma recept får finnas två gånger (ingen unik nyckel på `meal_plan_recipe`), eller tvärtom; bestäm och skriv in det i spinen.

### L6. Spårbarhet enligt arbetsreglerna

- **Källa:** autonomi Grundregel och "Klart betyder" (`docs/beslutslogg.md`, `docs/oppna-fragor.md`, checklistan för Pontus).
- **Vad som saknas:** Spinen hänvisar inte till beslutsloggen för sina avvikelser från addendum (H5 punkt 4, L1, egna varor utan katalogkoppling) och lägger inte till nya punkter på Pontus checklista (egen SMTP enligt M8, Supabase Auth-inställningar enligt H6).
- **Föreslagen ändring:** Lägg till en rad under Deferred eller Miljöer: "Avvikelser från addendum loggas i `docs/beslutslogg.md`; molninställningar (signup av, SMTP, redirect-URL:er) läggs på Pontus checklista."

### L7. Redigera ett sparat recept

- **Källa:** PRD FR-6 ("rätta även efter sparning"), FR-10; EXPERIENCE IA "Ändra recept: Samma formulär som förhandsgranskningen".
- **Vad som saknas:** AD-10 säger att `saveRecipe(draft)` är den enda vägen in i biblioteket, men inte hur en ändring sker. Det är oklart om rader och steg ersätts eller uppdateras, och vad som händer med stegkopplingen (H3).
- **Föreslagen ändring:** `saveRecipe(draft)` tar ett valfritt `recipeId` och ersätter rader och steg i samma `save_recipe`-funktion (M4). En rättad katalogkoppling sparar synonymen enligt AD-6.

---

## Utanför underlagen (bra att veta i molnet)

- Supabase gratisprojekt pausas efter ungefär en vecka utan aktivitet. Det spelar roll om Pontus gör uppehåll. Lägg det under Deferred "Säkerhetskopiering" eller på checklistan.
- Vercel Hobby är för icke-kommersiellt bruk. Det fungerar för v1 men bör noteras inför "när fler ska använda appen".

## Det som stämmer (ingen åtgärd)

Lagerordning och modulgränser, RLS på alla tabeller med tester, domänbegränsning med test i CI, AI-port med mock, Zod och nya försök, inget anrop till receptsajter från webbläsaren, ett receptformat, ingen omräkning av enheter, inköpslistan räknas om när matsedeln ändras med bockar och egna varor kvar (FR-18), foton sparas inte, Wake Lock i klienten, designtokens som CSS-variabler, gren per epic, lokalt först och molnet efter Epic 1–3, och offline uppskjutet i enlighet med PRD §10.1.
