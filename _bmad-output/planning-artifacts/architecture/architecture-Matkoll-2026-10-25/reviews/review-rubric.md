---
title: Granskning mot checklista – ARCHITECTURE-SPINE (Matkoll)
reviewed: _bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md
date: 2026-10-25
lens: good-spine-rubrik (divergenspunkter, verkställbara regler, Deferred, FR/NFR-täckning, driftsramar, beslut i stället för motiveringar, mermaid)
context: prd.md, addendum.md, EXPERIENCE.md, docs/brief.md, docs/autonomi.md
---

# Granskning mot checklista – Matkoll-arkitekturen

## Omdöme

Arkitekturen pekar ut rätt kärnrisker (en ägare av matchningen, en mängdfunktion, en inköpslista som räknas fram, en AI-port, ett receptformat, ett felformat) och är i huvudsak skriven som beslut. Den är ändå inte klar som underlag för parallellt bygge. Sju luckor kan leda till att epics som byggs var för sig gör olika saker, eller till att en funktion slutar fungera i molnet:

1. Tillåtelselistan går att kringgå.
2. Överlägget för inköpslistan räcker inte för det UX kräver.
3. Det är oklart hur en modul läser en annan moduls data.
4. Förhandsgranskningen skriver till katalogen.
5. Driftsättningen i molnet är inte beslutad.
6. Foton blir för stora för Vercel.
7. Standarddata per användare saknar en väg in i databasen.

Ett av de tre mermaid-diagrammen (datamodellen) går inte att tolka.

| Allvar | Antal |
| --- | --- |
| Kritisk | 0 |
| Hög | 7 |
| Medel | 12 |
| Låg | 9 |

## Kontroll mot checklistan

| Punkt | Resultat |
| --- | --- |
| Låser de verkliga divergenspunkterna för nivån under | Delvis. Saknas: läsning mellan moduler och ingångsfiler (H3), ägare per tabell (H3), en förhandsgranskning som inte skriver (H4), mängdformatering (M4), klientmönster för formulär, optimistiska bockar och ångra (M5), e2e-inloggning (M7), RecipeDraft-innehåll för stegkoppling (M2), standarddata (H7). |
| Varje AD-regel är verkställbar och stoppar sin divergens | Mestadels. AD-1 motsäger sig själv (H3, M8). AD-3 stoppar inte konton utanför listan (H1). AD-6 krockar med FR-6 (H4). AD-8 täcker inte UX (H2). |
| Inget under Deferred kan få enheter att glida isär | Nästan. "Säkerhetskopiering: Supabase plattformsstandard" är vilseledande på Free-planen (H5). En ändrad normaliseringsregel gör lagrade nycklar inaktuella (L2). |
| FR-1..28 och NFR-1..8 täcks | FR-tabellen är komplett. NFR-3, NFR-4, NFR-5 och NFR-7 saknar rader i kartan. NFR-7 (svar inom 1 s) beror på region, som inte är beslutad (H5). NFR-8 saknar krav på kodgranskning och kontroller före commit (M6). Rättning av listpostmängd (EXPERIENCE) saknas (H2). |
| Driftsramar (miljöer, leverantörer, drift) | Miljöer och leverantörer är beslutade. Driftsättning, regioner, ordning för migrationer, förhandsmiljöer, återställning, säkerhetskopiering och Supabase Free-paus är inte beslutade (H5). |
| Beslut i stället för motiveringar | I huvudsak beslut. Några motiverande meningar finns kvar (L4). |
| Giltiga mermaid-diagram | Lagerdiagrammet och miljödiagrammet går att tolka. **ER-diagrammet går inte att tolka** (M9, verifierat med mermaid 11.4.1). |

## Fynd

### Hög

#### H1 – Tillåtelselistan går att kringgå (AD-3, FR-1, NFR-1)

**Problem:** Den publika Supabase-nyckeln finns i klienten. Med den kan vem som helst anropa Supabase Auth direkt (`/auth/v1/otp`, `verifyOtp`), skapa ett konto och få en giltig session, eftersom registrering är påslagen som standard. Kontrollen av `ALLOWED_EMAILS` sker bara i appens inloggningsformulär och i `auth/callback`. `requireUser()` kontrollerar bara att `getClaims()` lyckas. En sådan användare kan därför nå `/api/ai/*` (Pontus Mac och modellen via tunneln) och receptimporten, och kan skriva egna rader via PostgREST. RLS skyddar Pontus data, men FR-1 säger att "andra adresser får ingen åtkomst", och kostnadsskyddet i PRD §6 bygger på att AI bara nås av Pontus.

**Åtgärd:** Lägg till i AD-3:
- Registrering är avstängd: `[auth] enable_signup = false` i `supabase/config.toml` och i molnprojektet.
- Pontus konto skapas en gång med ett admin-skript (service role) eller i Supabase Studio, och `signInWithOtp` anropas med `shouldCreateUser: false`.
- `requireUser()` kontrollerar också att e-postadressen i claims finns i `ALLOWED_EMAILS`. Annars svarar den `unauthorized`.
- Ett integrationstest visar att direkt registrering via Supabase Auth misslyckas.

#### H2 – Överlägget för inköpslistan räcker inte för UX (AD-8, FR-16–FR-19, EXPERIENCE)

**Problem:** AD-8 lagrar bara avbockningar och egna varor. EXPERIENCE kräver mer:
- Listpostdetaljen ska kunna "Rätta mängd" på en beräknad listpost.
- Man ska kunna svepa vänster och "Ta bort" en listpost, inte bara en egen vara.
- Borttagning ska kunna ångras i 5 s.

Ingen av dessa går att uttrycka i AD-8:s datamodell. Olika stories kommer därför att uppfinna egna lösningar, till exempel lagra listan eller ignorera kravet.

"Lägg i lagret" ska dessutom skriva via `pantry`-actions och sedan rensa överlägget "i samma action". Supabase-js har ingen transaktion över flera anrop, så ett avbrott mitt i kan ge dubbla lagerökningar om man försöker igen.

**Åtgärd:**
- Utöka överlägget i AD-8 till en tabell `shopping_line_state(meal_plan_id, line_key, checked bool, hidden bool, amount_override numeric null)`, eller tre namngivna tabeller. `computeList` applicerar överlägget. "Ta bort" på en beräknad post sätter `hidden`. "Rätta mängd" sätter `amount_override`.
- Lägg till en atomicitetsregel: skrivningar som spänner över flera moduler, som "Lägg i lagret", görs i en Postgres-funktion (`rpc`). Funktionen definieras i en migration, ägs av den initierande modulen och listas som uttryckligt undantag i AD-1. Den är idempotent per `line_key` och läser om mängderna på servern, aldrig från klienten.
- Bestäm hur avbockade poster med vag mängd läggs i lagret: som obegränsad lagervara.

#### H3 – Läsning mellan moduler är motsägelsefull och tabeller saknar ägare (AD-1, Invariants, Capability Map)

**Problem:**
- Texten under diagrammet säger att en modul får importera en annan moduls `domain` och `actions`, "aldrig dess `data`". AD-1 säger samtidigt att andra moduler går via `actions` "eller exporterade läsfunktioner", som ligger i `data`. Just läsning mellan moduler är vanligast i appen: `shopping` läser `mealplan`, `recipes`, `pantry` och `catalog` (butiksavdelning). `recipes` läser `pantry` för lagningsstatus. Receptsökning på ingrediens läser synonymer i `catalog`. `suggestions` läser `pantry` och `recipes`.
- En gemensam `index.ts` som exporterar både server-actions, `data` (`server-only`) och `domain` bryter klientbygget, så fort en klientkomponent importerar `domain` via ingångsfilen. Det är ett känt problem med samlade ingångsfiler i Next.js.
- Ingen tabell har en uttalad ägarmodul. Ägaren av `product_choice` (`shopping` eller `settings`) och `store` framgår inte.
- AD-6 låter `catalog` "slå ihop" ingredienser. En sammanslagning måste peka om främmande nycklar i `recipe_ingredient`, `pantry_item`, `product_choice` och `shopping_*`, vilket AD-1 förbjuder.

**Åtgärd:**
- Ersätt raden under diagrammet med två ingångsfiler per modul: `index.ts`, som exporterar typer och `domain` och är säker i både klient och server, och `server.ts` (`import 'server-only'`), som exporterar namngivna läsfunktioner (`get*`, `list*`) från `data` och anropbara `actions`. Andra moduler importerar bara från dessa två filer. Lås det med `import/no-restricted-paths`.
- Lägg en kolumn "Ägare" i datamodellen. Förslag: `catalog` (ingredient, ingredient_synonym), `recipes` (recipe, recipe_ingredient, recipe_step), `pantry` (pantry_item), `mealplan` (meal_plan, meal_plan_recipe), `shopping` (shopping_*, product_choice), `settings` (store, recipe_site).
- Stryk sammanslagning ur AD-6, eftersom PRD:n bara kräver rättning. Behåll den bara som en Postgres-funktion i en `catalog`-migration, med uttryckligt undantag i AD-1.

#### H4 – Förhandsgranskningen skriver till katalogen (AD-6, AD-10, FR-5, FR-6, FR-17)

**Problem:** AD-6 säger att `resolveIngredient(text)` "skapar annars en ny katalogingrediens". Förhandsgranskningen måste visa koppling, "Kontrollera" och "Ny" innan något sparas, och FR-6 säger att ingenting sparas förrän Pontus sparar. Om importen anropar `resolveIngredient` för att visa förslagen skapas katalogposter för recept som aldrig sparas. Om den inte gör det finns ingen beslutad väg att räkna fram förslagen.

FR-17 kräver att egna varor kopplas till katalogen "om det går", så "diskmedel" ska inte skapa en katalogingrediens. AD-6 skapar ändå alltid en.

Det saknas också ett unikhetsvillkor på `ingredient`. Två rader "lök" i samma recept kan därför skapa två ingredienser.

**Åtgärd:** Dela upp AD-6 i två funktioner:
- `matchIngredient(text): { kind: 'match' | 'suggested' | 'new', ingredientId?, proposal? }`. Den skriver inte och används i förhandsgranskning, lagersökning och bildanalys.
- `resolveIngredient(match, { create: boolean })`. Den skriver och anropas bara från `saveRecipe`, när ett lagerförslag bekräftas och när Pontus väljer att skapa en ingrediens.

Egna varor anropar med `create: false`. Lägg till `unique (user_id, normalized_name)` på `ingredient`, och skapa med `on conflict do nothing` följt av en ny läsning. AI-steget i matchningen ska ingå i `parseRecipe`- och `analyzeImage`-svaret, inte vara ett anrop per rad.

#### H5 – Driftsramarna är inte beslutade (Miljöer och drift, Deferred, AD-5, NFR-7)

**Problem:** Molnet beskrivs som topologi men utan driftbeslut:
- Vad som startar en driftsättning är inte beslutat: Vercels Git-integration vid push till `main` eller manuellt. `autonomi.md` kräver att Pontus tillfrågas före publicering i produktion.
- Förhandsmiljöer för epic-grenar skulle peka på det enda Supabase-molnprojektet.
- Det är inte beslutat när och av vem `supabase db push` körs, eller om det sker före eller efter koddriftsättningen.
- Återställning är inte beslutad: Vercel Instant Rollback mot migrationer som bara går framåt.
- Region är inte vald. Vercel och Supabase i olika regioner äventyrar NFR-7 (1 s).
- Supabase Auth Site URL och redirect-URL:er saknas.
- Supabase Free pausar projekt efter 7 dagars inaktivitet och har inga nedladdningsbara säkerhetskopior. Raden "Säkerhetskopiering: Supabase plattformsstandard" under Deferred är därför fel för Free-planen.

**Åtgärd:** Lägg till en underrubrik "Driftsättning" med besluten:
- Produktion byggs bara från `main`.
- Förhandsdriftsättningar är avstängda eller saknar miljövariabler för Supabase.
- Ordningen är `supabase db push`, sedan driftsättning. Båda körs av Pontus, eller av ett manuellt GitHub Actions-flöde (`workflow_dispatch`) med godkännande av miljön.
- Migrationer är bakåtkompatibla med föregående koddriftsättning.
- Regionen är densamma för Vercel och Supabase, till exempel `arn1` och `eu-north-1`.
- Site URL och redirect-URL:er sätts i Pontus checklista.

Ersätt raden om säkerhetskopiering med ett beslut: ett schemalagt GitHub Actions-flöde kör `supabase db dump --data-only` varje vecka till ett privat artefaktlager, eller Pontus godkänner risken. Det flödet räknas också som aktivitet mot pausen.

#### H6 – Foton går inte igenom Vercel (AD-9, AD-15, FR-4, FR-24)

**Problem:** Mobilfoton är ofta 3–12 MB. Vercel Functions tar emot högst 4,5 MB i en förfrågan, och Server Actions har 1 MB som standard. Lokalt fungerar det, men i molnet misslyckas `analyzeImage` och fotoimport. Arkitekturen säger inget om storlek eller format, så fotoflödena i Epic 1 och Epic 6 kan lösa det olika eller inte alls.

**Åtgärd:** Lägg till i AD-15:
- Klienten skalar ned bilden före uppladdning med en gemensam funktion, `src/lib/image/downscale.ts`: längsta sida 1600 px, JPEG med kvalitet 0,8 och högst 1,5 MB.
- Bilden skickas som `multipart/form-data` till `/api/ai/*`.
- Servern avvisar större bilder än 4 MB med felkoden `image_too_large` i `errors.ts`.

#### H7 – Standarddata per användare saknar en väg in i databasen (AD-4, Datamodell, FR-7, FR-28)

**Problem:** `recipe_site` ska seedas med `koket.se` och `tasteline.com`, och butiken Maxi ICA Stormarknad Östersund (1003733) är förvald enligt ordlistan. Men varje tabell har `user_id not null default auth.uid()`. `seed.sql` körs utan inloggning, och vid `db reset` finns ingen användare. `seed.sql` körs inte heller vid `supabase db push` mot molnet. Epic 1 (receptsajter) och Epic 7 (butik) kommer därför att lösa standarddata på olika sätt (seed, trigger, kod i inloggningen), eller lämna molnet tomt.

**Åtgärd:** Lägg till en regel, i AD-4 eller en ny AD: standarddata per användare skapas av en idempotent funktion, `ensureUserDefaults()` i `settings/actions`, som anropas i `auth/callback` efter lyckad inloggning. Alternativet är en `security definer`-trigger på `auth.users` i en migration. `seed.sql` innehåller bara testanvändare för lokal utveckling. Skriv uttryckligen in butiken Maxi ICA som standarddata.

### Medel

#### M1 – Lagningsstatus aggregeras inte på ett ställe (AD-7, FR-8, FR-13, FR-20, FR-22)

**Problem:** `coverage.ts` ger status per rad. Hur `partial`, `other-unit` och `vague-missing` räknas i "Saknar N", "X av Y hemma" och rangordningen står bara som antagande i memloggen ("other-unit räknas som hemma, vag räknas aldrig som saknad"). Receptbiblioteket (Epic 1–2), receptvyn (Epic 4) och förslagen (Epic 5) kan därför räkna olika.

Det är inte heller beslutat om samma ingrediens och enhet får finnas på flera lagerrader, till exempel i Kyl och Frys. FR-19 ("ökar en befintlig med samma enhet") blir då tvetydig.

**Åtgärd:**
- Lägg till `pantry/domain/cookability.ts`: `cookability(lines, pantry) → { missing, home, total }`. Den är den enda aggregeringen, och tabellen över hur varje status räknas skrivs in i AD-7.
- `coverage` summerar lagret per (ingrediens, enhet) över alla platser.
- Lägg till `unique (user_id, ingredient_id, location, unit)` på `pantry_item`, där `unit` null räknas som en egen nyckel via `nulls not distinct`.
- "Lägg i lagret" ökar raden på katalogingrediensens standardplats.

#### M2 – Receptformatet saknar stegkoppling och regel för JSON-LD (AD-10, AD-11, FR-5, FR-21)

**Problem:** Stegläget (Epic 4) visar "stegets receptrader". Om `RecipeDraft` och `recipe_ingredient` inte bär en stegkoppling från Epic 1 kan Epic 4 inte uppfylla FR-21 utan att ändra importen. Datamodellen visar ingen sådan koppling, men addendum nämner "ev. stegkoppling".

FR-5 kräver att stegen skrivs om "i samma stil oavsett källa". AD-11 använder JSON-LD först och skickar bara text till AI annars. Det är oklart om JSON-LD-recept också går genom `parseRecipe`, och när JSON-LD räknas som "ofullständig".

**Åtgärd:**
- I AD-10: `RecipeDraft.ingredients[].stepIndexes: number[]`, som får vara tom, med motsvarande kolumn `step_indexes int[]` på `recipe_ingredient`, eller en kopplingstabell.
- I AD-11: JSON-LD-data skickas alltid till `parseRecipe` som strukturerad indata, för att normalisera rader, skriva om steg och koppla steg. JSON-LD används ensamt bara när AI-tjänsten inte nås.
- Skriv in vad "ofullständig" betyder: inga ingredienser eller inga steg.

#### M3 – AI-arbete i Route Handlers saknar regel för orkestrering, avbrott och tidsbudget (AD-9, NFR-7)

**Problem:**
- Importens kedja (domänkontroll, hämtning, JSON-LD, `parseRecipe`, `matchIngredient`) har ingen bestämd plats. Route Handlers ska vara tunna, men `actions` är definierade som Server Actions. Logiken hamnar därför i `src/app/api/ai/*`.
- "Klienten kan avbryta" fungerar bara om `request.signal` förs vidare till AI SDK och till hämtningen. Annars fortsätter modellen på Macen att räkna.
- Två omförsök utan tidsgräns per försök kan överskrida `maxDuration = 120`.
- Klientkomponenter "anropar bara actions" enligt lagertabellen, men AI-flödena anropar `fetch('/api/ai/…')`.

**Åtgärd:**
- Route Handlers anropar en serverfunktion i modulen, till exempel `recipes/actions/import.ts`, exporterad via `server.ts`. Funktionen tar `{ signal }`.
- Alla metoder i `AiService` och `safeFetch` tar `AbortSignal`.
- Tidsbudget: 45 s per försök och 110 s totalt. Annars returneras `ai_unavailable`.
- Lagertabellen tillåter UI att anropa `/api/ai/*` via en gemensam klientfunktion, `src/lib/ai-client.ts`, som tolkar formen från AD-13.

#### M4 – Mängder visas och tolkas olika (AD-12, NFR-6, AD-16)

**Problem:** Det finns ingen gemensam funktion för att visa mängder, med svenskt decimalkomma "1,5 dl", bråk eller avrundningsregler. Det finns inte heller någon för att tolka indata ("1,5", "½") eller enhetstext ("deciliter" → `dl`). Receptvyn, listan, lagret och exporten (golden-testet) kommer att formatera olika.

Regeln "okänd enhet → `st`" slår dessutom ihop "2 nävar spenat" med "2 st spenat" i listan.

**Åtgärd:**
- Lägg till i AD-12: `catalog/domain/units.ts` exporterar `normalizeUnit(text)`, `parseQuantity(text)` och `formatQuantity(amount, unit)`, och de är de enda tolknings- och visningsfunktionerna. Exporten och all UI använder dem.
- Låt okända enheter bli `is_vague = true` med originaltexten, i stället för `st`, eller lägg till `line_key`-typen `unknown-unit`.

#### M5 – Inga klientmönster för formulär, optimistiska ändringar, klientläsning och ångra (Consistency Conventions)

**Problem:** UX kräver:
- bockar och hjärtan som "sparas direkt"
- sökning medan man skriver, efter 200 ms paus, i "Lägg till rätt" och arket Lagervara
- formulär med "Släng ändringarna?"
- "Ångra" i 5 s efter borttagning av listpost, lagervara och matsedelsrätt.

AD-2 säger bara att läsning sker i Server Components. Stories kommer att välja olika formulärbibliotek, egna API-rutter för sökning och olika sätt att ångra, till exempel mjuk borttagning i en modul och ny insättning i en annan.

**Åtgärd:** Lägg till rader i konventionstabellen:
- Formulär använder `useActionState` med samma Zod-schema på klienten via `safeParse`. Inget formulärbibliotek.
- Växlingar (bock, hjärta, portioner) använder `useOptimistic`.
- Klientläsning med sökning görs via läs-actions `search*` i modulens `actions/`, med formen från AD-13.
- Ångra: borttagnings-actions returnerar den borttagna raden (`data.snapshot`), och `restore*(snapshot)` sätter in den igen med samma id. Ingen mjuk borttagning.

#### M6 – NFR-8 verkställs inte fullt ut (Conventions: Gren, Miljöer: CI, AD-5)

**Problem:** NFR-8 och briefen kräver att kodgranskning blockerar sammanslagning och att hemlighetsskanning och lint körs "vid varje commit". Arkitekturen har bara CI. Grenskydd på `main` och krav på granskning nämns inte. Det finns heller ingen kontroll av att `database.types.ts` stämmer med migrationerna, vilket gör AD-5 till en uppmaning snarare än en regel.

**Åtgärd:**
- Grenskydd på `main`: obligatoriska kontroller (lint, typkontroll, vitest, rls, e2e, gitleaks) och en godkänd granskning eller ett körningsbevis från `bmad-code-review` före sammanslagning.
- Kontroller före commit med `lefthook`: `gitleaks protect --staged` och `eslint` på ändrade filer.
- CI-steget `supabase gen types --local > /tmp/t.ts && diff` ska misslyckas om typerna har glidit.

#### M7 – E2E-tester saknar inloggningsstrategi (Conventions: Tester, AD-3)

**Problem:** Engångslänken kräver e-post. Lokalt hamnar den i Mailpit eller Inbucket på port 54324. Playwright-stories kommer att lösa inloggningen olika: läsa Mailpit, bygga en egen testväg eller hoppa över inloggningen. En testväg i appen vore ett säkerhetshål.

**Åtgärd:** `tests/e2e/global-setup.ts` skapar testanvändaren med service role och loggar in med `auth.admin.generateLink` plus `verifyOtp`, eller med ett lösenord som bara finns lokalt, och sparar `storageState`. Ingen testväg i appen. Testanvändarens adress läggs i `ALLOWED_EMAILS` för CI.

#### M8 – Beroenderegeln utelämnar gemensamma mappar och återanvändning av UI (AD-1, Invariants-diagrammet)

**Problem:** "Pilarna är de enda tillåtna beroendena", men diagrammet har inga pilar till `src/components/ui`, `src/lib/errors.ts` eller `database.types.ts`. Bokstavligt läst får varken UI använda gemensamma byggstenar eller actions använda felkoder. "Aldrig dess `ui`" tvingar dessutom fram dubbletter: `Receptrad` från `recipes/ui` behövs i `mealplan` ("Lägg till rätt") och i `suggestions`. ESLint-regeln kan inte skrivas konsekvent mot den här texten.

**Åtgärd:**
- Lägg till noderna `components/ui` (från `app` och `ui`) och `lib/errors` (från alla utom `domain`) i diagrammet.
- `domain` får importera `zod` och `lib/errors`-typer.
- Komponenter som används i flera moduler flyttas till `src/components/` eller exporteras via modulens `index.ts`, och regeln skrivs om därefter.
- Lägg den faktiska ESLint-konfigurationen (zonerna) i den första storyn och referera den från AD-1.

#### M9 – ER-diagrammet går inte att tolka (Datamodell)

**Problem:** `meal_plan_recipe : finns_på` och `product_choice : gäller` har icke-ASCII-tecken i etiketter utan citattecken. Mermaid 11.4.1 ger `Parse error on line 9 … got 'å'`.

**Åtgärd:** Sätt etiketterna inom citattecken: `: "finns på"` och `: "gäller"`. Verifierat: med den ändringen går alla tre diagrammen att tolka.

#### M10 – Borttagning av recept och matsedel saknar regel (Datamodell, FR-10, FR-14)

**Problem:** Det står inte vad som händer med `meal_plan_recipe` i tidigare matsedlar (FR-14) när ett recept tas bort (FR-10), eller med `shopping_*` när en matsedel tas bort. Det står inte heller vilken `on delete` som gäller för främmande nycklar till `ingredient`. `recipes` och `mealplan` kan välja `cascade` respektive `restrict` och krocka.

**Åtgärd:**
- Regel för främmande nycklar: barn till sin förälder i samma aggregat får `on delete cascade`, alltså recept till rader och steg, och matsedel till matsedelsrätter och `shopping_*`.
- `meal_plan_recipe.recipe_id` får `on delete cascade`. Tidigare matsedlar tappar alltså rätten, och borttagningsdialogen säger det.
- Referenser till `ingredient` får `on delete restrict`.

#### M11 – Engångslänkens flöde är inte valt (AD-3)

**Problem:** `auth/callback` med PKCE (`exchangeCodeForSession`) misslyckas när länken öppnas i en annan webbläsare än den som begärde den. Det är vanligt på mobil, där e-postappen öppnar sin egen webbvy. EXPERIENCE kräver dessutom en återgång till den sida man försökte nå, utan att det står hur `next` valideras.

**Åtgärd:**
- Använd Supabase-flödet med `token_hash`: e-postmallen pekar på `/auth/confirm?token_hash=…&type=email&next=…`, och servern anropar `verifyOtp`.
- `next` godtas bara som relativ sökväg som börjar med `/` men inte med `//`.

#### M12 – Miljövariablerna har inga namn (AD-14, AD-9, Miljöer)

**Problem:** Flera stories lägger till variabler (LM Studio, Cloudflare Access, AI-nycklar, Supabase-nycklar). Utan bestämda namn uppstår varianter som `LMSTUDIO_URL` och `LM_STUDIO_BASE_URL`, eller `NEXT_PUBLIC_SUPABASE_ANON_KEY` och `..._PUBLISHABLE_KEY`.

**Åtgärd:** Lista de godkända namnen i AD-14: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bara tester och skript), `ALLOWED_EMAILS`, `AI_PROVIDER`, `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_MODEL`. Nya variabler kräver en ändring av AD-14.

### Låg

#### L1 – Hämtningsporten får inte läsa funktionsdata (AD-11)

Porten `src/server/fetch` får bara bero på `env` enligt diagrammet, men måste känna till de aktiva domänerna i `recipe_site`. **Åtgärd:** Signaturen blir `safeFetch(url, { allowedDomains, signal })`. Anroparen hämtar listan via `settings/server.ts`. Kontrollera också att svaret har `content-type: text/html`.

#### L2 – Lagrade normaliseringsnycklar blir inaktuella (Deferred: normaliseringsregel)

Om regeln förfinas efter Epic 1 matchar gamla `ingredient_synonym.normalized` inte längre. **Åtgärd:** `normalizeIngredientText` i `catalog/domain` är den enda versionen. När den ändras följer en migration eller ett skript med som räknar om `normalized`. Skriv in det i den uppskjutna punkten.

#### L3 – Urklipp på iOS Safari (AD-16, FR-26)

Safari kräver att `clipboard.writeText` anropas direkt i trycket. Om exporttexten hämtas asynkront först misslyckas kopieringen alltid och reservarket visas. **Åtgärd:** Exporttexten räknas fram på servern tillsammans med listan och skickas med till klientkomponenten, så att knappen skriver synkront.

#### L4 – Motiveringar i texten

Till exempel "En ändrad matsedel ger alltså automatiskt …" (AD-8) och "Vercel-funktioner har … 300 s som tak …, vilket rymmer …" (Miljöer). **Åtgärd:** Stryk meningarna eller flytta dem till memloggen och behåll bara besluten.

#### L5 – Främmande nycklar i barntabeller kontrollerar inte ägaren (AD-4)

RLS `with check` kontrollerar bara `user_id`. En rad kan peka på en annan användares `recipe_id`. Risken är liten med en användare. **Åtgärd:** Policyer för barntabeller kontrollerar också föräldern med `exists (select 1 from recipe r where r.id = recipe_id and r.user_id = (select auth.uid()))`, eller sammansatta främmande nycklar `(id, user_id)`.

#### L6 – Livslängden för AI-förslag är inte beslutad (FR-23)

Det står inte om förslagen bara finns i klientens minne eller sparas tillfälligt. **Åtgärd:** De finns bara i klientens tillstånd och försvinner när man lämnar sidan. Sparande sker via förhandsgranskningen och `saveRecipe`.

#### L7 – Bilder från andra domäner och säkerhetshuvuden (AD-15)

En vanlig `<img>` mot okända värdar kan blockeras av hotlink-skydd och påverkar en eventuell CSP. **Åtgärd:** `referrerPolicy="no-referrer"`, en platshållare vid `onError`, och ett beslut om att det inte finns någon CSP i v1 eller att `img-src https:` gäller.

#### L8 – `requireUser()` anropas flera gånger per förfrågan (AD-3, NFR-7)

Funktionen anropas i action, data och sida. Med symmetriska JWT-nycklar gör `getClaims()` ett nätverksanrop varje gång. **Åtgärd:** Kapsla `requireUser` i React `cache()`, och använd asymmetriska JWT-nycklar i molnprojektet.

#### L9 – Låsning av verktygsversioner (Stack)

**Åtgärd:** `.nvmrc` eller `engines.node: 24.x`, `packageManager: pnpm@12.15.0`, och CI ska använda samma versioner. Ange att `import/no-restricted-paths` kommer från `eslint-plugin-import` i `eslint-config-next`, så att AD-1 har ett verktyg som bevisligen finns.

## Det som fungerar

- AD-6, AD-7, AD-8 och AD-10 pekar ut de verkliga riskerna i produkten (matchning, mängdlogik, listans ägare, receptformat) och ger var och en en enda ägare.
- AD-9 och AD-11 är konkreta och går att testa: Zod med omförsök, `mock` i CI, https, domänlista, manuella omdirigeringar och gränser för tid och storlek.
- AD-13 och AD-14 ger ett gemensamt fel- och konfigurationsformat.
- Stack-versionerna är låsta och verifierade, med källor i memloggen.
- Kartan över FR-1–28 är komplett.
