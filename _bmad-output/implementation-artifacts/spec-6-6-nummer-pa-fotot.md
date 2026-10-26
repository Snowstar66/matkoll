---
title: 'Story 6.6: Nummer på fotot'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '8b1d2e39b5a8aa7af6f869f806864f3be114d1c7'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus granskar lagerförslagen med det analyserade fotot ovanför korten (snabbfixen efter 6.5), men det syns inte vilken vara på fotot ett kort kommer från. Pontus vill ha ett nummer på varje vara på fotot och samma nummer på kortet, för att kunna kontrollera vad modellen har läst av. Tolkningen får inte bli sämre, och den extra tiden ska mätas.

Ett experiment med Pontus foto (2048 px, temperatur 0, appens prompt) mot Qwen3.6 i LM Studio visade:
- Att be om positioner i samma anrop som avläsningen gjorde den sämre. Med punkter blev 20 varor 25, modellen upprepade tidigare varor med allmänna namn, och tiden gick från ungefär 30 s till ungefär 55 s. Med rutor dubblerade den varor. **Avvisat.**
- Ett **separat andra anrop** efter avläsningen lämnar avläsningen identisk byte för byte. Det skickar samma bild och de numrerade etiketterna och ber om en punkt per vara. Det tog ungefär 10 s varmt på Pontus foto (20 varor, 390 token svar), 24 s vid första, kalla anropet och 3–5 s på de syntetiska bilderna. Varje svar var giltigt och komplett, och punkterna hamnade på rätt varor på `kyl.png` och `kyl-dorr.png`. Pontus bekräftade att de hamnar rätt på det riktiga fotot och valde punkter (inte rutor).

**Approach:**
- **AI-porten** får metoden `locateItems`: samma bild och de numrerade etiketterna in, en punkt `[x, y]` i tusendelar per vara ut. Den har ett eget strikt schema, en egen prompt, samma bildsampling som `analyzeImage` och en egen kort budget (ungefär 30 s, inget nytt försök). Varje punkt kontrolleras för sig, och en dålig punkt tas bort utan att hela svaret underkänns.
- **Routen `/api/ai/locate`** bredvid `/api/ai/analyze` tar emot samma förminskade bild och etiketterna, med samma kontroller (inloggning, ursprung, bildens storlek och typ, en körning per användare och tidsgräns). Fotot sparas aldrig (AD-15).
- **Klienten** visar korten direkt när analysen svarar. Sedan skickar den samma bild och etiketterna i bakgrunden, och när punkterna kommer får fotot i arket numrerade markörer och korten samma nummer. Misslyckas anropet visas inga nummer och inget fel.
- **Utvärderingen** mäter tiden för avläsningen, tiden för punkterna och summan per körning.

## Boundaries & Constraints

**Always:**
- Avläsningen (`analyzeImage`) ändras inte: samma prompt, samma schema, samma sampling. Punkterna kommer bara från det separata anropet efter den.
- `locateItems` använder samma bildsampling som `analyzeImage` (LM Studio med Qwen: temperatur 0, `top_p` 0,8, `top_k` 20, `presence_penalty` 1,5), med tänkläget avstängt.
- `locateItems` har en egen budget på 30 s per försök, inom AD-9, och gör inget nytt försök. Numren är extra, så det är bättre att ge upp snabbt.
- Varje punkt kontrolleras för sig: `n` är ett heltal 1..N (antalet etiketter), och punkten är exakt två tal i 0..1000. En dålig eller upprepad punkt tas bort och räknas, men underkänner aldrig svaret.
- Etiketterna är data, inte instruktioner. De är text på en rad (`cleanModelText`), högst 25 (analysens tak) och högst 200 tecken var.
- Fotot sparas och loggas aldrig (AD-15). Det skickas bara till AI-porten. Bara koder, skäl och antal loggas, aldrig etiketter eller punkter.
- En ny analys av samma person stoppar en pågående lokalisering, både i klienten och på servern. En lokalisering stoppar aldrig en analys.
- Korten väntar aldrig på numren, och Bekräfta, Rätta, Avvisa och "Bekräfta alla" fungerar hela tiden.
- Markörerna på fotot är dolda för skärmläsare (`aria-hidden`), eftersom korten bär numren. Kortets nummer har namnet "Nummer 3 på fotot".
- Inget vågrätt scroll vid 375 px och 200 % text. Växlingen till full storlek fungerar som förut, och markörerna följer med.
- Alla 6.1–6.5-regler gäller: analysen skriver aldrig (AD-2), länken till katalogen kommer bara från `matchIngredients` (AD-6), och objekt-URL:en lever som i snabbfixen.
- Tester och CI använder `AI_PROVIDER=mock`. Utvärderingen mot Pontus foto körs bara mot LM Studio på den här datorn, och fotot läggs aldrig i repot.

**Never:**
- Inga positioner i samma anrop som avläsningen.
- Inga rutor, bara punkter.
- Inget felmeddelande till Pontus när numren uteblir.
- Inget nytt i databasen, ingen migration och ingen ny Server Action.
- Ingen ändring av `parseRecipe`, `suggestDishes` eller av Anthropic- och OpenAI-adaptrarna.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kort först, sedan nummer | Ett foto av kylen med sex varor | Korten visas när analysen svarar. Sedan går `/api/ai/locate` med samma bild och sex etiketter, och när svaret kommer har korten numren 1–6 och fotot i arket sex markörer | N/A |
| Medan punkterna letas upp | Lokaliseringen pågår | Under miniatyren står "Letar upp varorna på fotot …" i en artig statusregion. Allt går att bekräfta | N/A |
| Numren klara | Punkterna har kommit | Statusen säger "Numren på korten visar var varorna är på fotot." | N/A |
| Kortets nummer | Ett förslag från vara 2 och vara 5 (samma katalogvara) | Kortet har numret 2, och fotot har markören 2 på båda varorna | N/A |
| Vara utan punkt | Modellen gav ingen giltig punkt för vara 4 | Kortet för vara 4 har inget nummer, och fotot ingen markör 4 | N/A |
| Dålig punkt | `n` 0, `n` 7 av 6, `[1200, 40]`, `[10]`, eller samma `n` två gånger | Den punkten tas bort och räknas som ogiltig. De andra står kvar | N/A |
| Svaret som helhet trasigt | Inget `positions` i svaret | `ai_invalid` direkt, inget nytt försök. Inga nummer | Loggas |
| För långsamt | Modellen svarar inte inom 30 s | `ai_unavailable`. Inga nummer och inget fel visas | Loggas |
| Ny analys | Pontus tar ett nytt foto medan punkterna letas upp | Lokaliseringen avbryts i klienten. Servern svarar den `ai_superseded` om den fortfarande körs. Inga nummer för det gamla svaret | N/A |
| Lokalisering under analys | En annan flik analyserar ett foto när en lokalisering kommer | Lokaliseringen svarar `ai_superseded` och stoppar inte analysen | N/A |
| Syns inte längre | En jämförd plats har "Syns inte längre"-kort | De korten har inget nummer | N/A |
| Oförändrade varor | En vara stämmer med lagret och har inget kort | Ingen markör för den | N/A |
| Etiketter utanför gränserna | 26 etiketter, en tom, en på 201 tecken, en med radbrytning, eller inte en JSON-lista | 400 `validation`, AI:n tillfrågas inte | `validation` |
| Bilden | Över 2048 px, över 1,5 MB, inte en bild | 413 eller 415 som `/api/ai/analyze` | Som 6.5 |
| Inte inloggad | Ingen session | 401 | `unauthorized` |
| Full storlek | Pontus trycker på fotot i arket | Fotot visas i full storlek, och markörerna står kvar på samma varor | N/A |
| Utvärderingen | `pnpm eval:ai` med `EVAL_RUNS=3` | Rapporten visar tiden för avläsningen, tiden för punkterna, summan och om alla varor fick en punkt, per körning | Ett fel fäller körningen |

</frozen-after-approval>

## Code Map

- `src/server/ai/service.ts` (+ test), `schemas.ts` (+ test), `prompts.ts`, `prompts/` -- porten, `inputLimits`, `limitsWithin`, `withInputValidation`, `analyzeImage` som mönster
- `src/server/ai/run.ts` -- `runStructured`, `Limits` och `defaultLimits`
- `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/manifest.json`, `kyl.analyze.json`, `kyl-dorr.analyze.json` -- mockens fixturer
- `src/app/api/ai/analyze/route.ts` (+ test), `route-support.ts` -- `readImageForm`, `respond` och `isCrossSite`
- `src/features/pantry/actions/analyze-place.ts` (+ test) -- körningslåset per användare och `ai_superseded`
- `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `toPantrySuggestions`, `pantrySuggestionSchema` och `analyzeResultSchema`
- `src/features/pantry/ui/use-pantry-analysis.ts` -- `send`, `ReviewPhoto` och objekt-URL:ens livscykel
- `src/features/pantry/ui/analyzed-photo.tsx`, `pantry-suggestion-list.tsx` (+ test) -- miniatyren, arket och korten
- `src/lib/ai-client.ts` -- `postAiForm`
- `tests/eval/analyze-image.eval.ts` -- utvärderingen
- `tests/e2e/pantry-camera.spec.ts` -- e2e med `kyl.png`
- `docs/beslutslogg.md`, `docs/oppna-fragor.md` (T6)

## Tasks & Acceptance

**Execution:**
- [x] `src/server/ai/schemas.ts` (+ test) -- `locateItemsAnswer = { positions: [{ n, position }] }` med bara typer, så att strikta JSON-scheman tar det. `parseItemPositions(entries, count)` kontrollerar varje punkt för sig (`n` heltal 1..count, `position` exakt två tal 0..1000), behåller den första punkten per `n` och räknar resten som `invalid` -- AD-10
- [x] `src/server/ai/prompts/locate-items.md`, `prompts.ts` -- prompten från experimentet, laddad med `?raw` -- AD-9
- [x] `src/server/ai/service.ts` (+ test) -- `locateItems({ image, labels }, signal, options)`:
  - användarmeddelandet är bilden och "Varorna:" med en numrerad rad per etikett;
  - `sampling: target.imageSampling`, `maxOutputTokens` 1 000;
  - en egen budget (`locateLimitsFrom`): högst 30 s per försök, ett försök, inom fristen;
  - `inputLimits.locate` och `isValidLocateItemsInput` (bilden som förut, 1–25 etiketter, var och en på en rad och högst 200 tecken).

  -- AD-9
- [x] `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/kyl.locate.json`, `kyl-dorr.locate.json`, `manifest.json` -- mocken svarar punkterna för fotot, nycklat på bildens bytes, och `kyl` för andra foton, genom `parseItemPositions`. De reserverade bilderna ger sina koder
- [x] `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `pantrySuggestionSchema` får `itemNumbers?: number[]` (varornas nummer i avläsningen, det första är kortets nummer). `analyzeResultSchema` får `reading?: string[]` (etiketterna i avläsningens ordning, på en rad). `toPantrySuggestions` samlar numren per förslag
- [x] `src/features/pantry/domain/photo-numbers.ts` (+ test) -- `locateLabelsSchema`, `locateResultSchema`, `cardNumber`, `photoMarkers` och texterna "Nummer 3 på fotot", "Letar upp varorna på fotot …" och "Numren på korten visar var varorna är på fotot."
- [x] `src/features/pantry/actions/ai-runs.ts` -- körningslåset per användare från `analyze-place.ts`, med sorten (`analyze` eller `locate`): en analys stoppar allt före den, en lokalisering stoppar bara en äldre lokalisering och svarar `ai_superseded` medan en analys pågår
- [x] `src/features/pantry/actions/analyze-place.ts` (+ test) -- använder låset och skickar med `reading`
- [x] `src/features/pantry/actions/locate-place-items.ts` (+ test), `server.ts` -- `locatePlaceItems({ image, labels }, { signal, deadline })`: användaren, låset, `locateItems` och punkterna som `{ n, x, y }`. Skriver aldrig
- [x] `src/app/api/ai/locate/route.ts` (+ test) -- `POST` med `image` och `labels` (en JSON-lista) som multipart/form-data, samma kontroller som analysen och `maxDuration` 60
- [x] `src/features/pantry/ui/use-pantry-analysis.ts` -- efter ett svar med kort och ett foto: `locate` i bakgrunden med samma blob. `ReviewPhoto.numbers` är `pending`, `none` eller `ready` med punkterna. En ny analys och att lämna Hemma avbryter lokaliseringen. Objekt-URL:en hanteras som förut
- [x] `src/features/pantry/ui/analyzed-photo.tsx`, `pantry-suggestion-list.tsx` (+ test) -- markörerna på det stora fotot (procent på en ruta med fotots proportioner, `aria-hidden`), numret på korten och statusen under miniaturen
- [x] `tests/e2e/pantry-camera.spec.ts` -- korten får numren och arket markörerna med `kyl.png`
- [x] `tests/eval/analyze-image.eval.ts` -- tiden för `locateItems` efter `analyzeImage` per körning, summan och om alla varor fick en punkt
- [ ] Kör utvärderingen mot LM Studio på 127.0.0.1 med `EVAL_RUNS=3`, och skriv in siffrorna här, i beslutsloggen och i T6. Mätning mot LM Studio väntar: Pontus använder modellen, så den görs i en egen commit efteråt

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test`, och `pnpm test:integration`, `AI_PROVIDER=mock pnpm build` och `CI=1 pnpm test:e2e` genom `scripts/with-test-lock.sh`, when de körs, then lyckas alla.
- Given `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/analyze-image.eval.ts` med `EVAL_RUNS=3`, when den körs, then ger varje körning en giltig avläsning och en lokalisering, och rapporten visar tiderna.

## Implementation Notes

- **Beslut (förslag): kortets nummer är numret på dess första vara i avläsningen.** Avläsningen är varorna efter att porten har slagit ihop upprepningar (6.5) och kortat till 25, i modellens ordning. Ett kort som samlar flera varor (samma katalogvara) har den första varans nummer, och fotot har markörer med det numret på alla dess varor. Ett förslag som delas på två enheter får bara numren på varorna med sin enhet, så två kort har aldrig samma nummer (ändrat efter granskningen, se Spec Change Log).
- **Beslut (förslag): markörer bara för kort som visas.** "Nytt" och "Ändrat" (eller den vanliga listan) har nummer. Oförändrade varor, varor som inte gick att koppla till katalogen och "Syns inte längre" har inga markörer, så att varje markör har ett kort. När ett kort är hanterat försvinner dess markör.
- **Beslut (förslag): alla varor lokaliseras,** även de utan kort, så att anropet är det som mättes. Numren följer avläsningen, så ett kort kan ha nummer 5 utan att det finns ett kort med nummer 4.
- **Beslut (förslag): miniatyren får ingen markör.** På 72 px går numren inte att läsa. Statusen under miniatyren säger att numren letas upp och sedan att de finns på fotot.
- **Beslut (förslag): en lokalisering stoppar aldrig en analys.** Låset per användare har sorten. En ny analys stoppar allt före den. En lokalisering under en analys svarar `ai_superseded` direkt, eftersom avläsningen är viktigare och modellen bara ska ha en sak i taget.
- **Beslut (förslag): markören är en rund siffra i accentfärg med vit kant,** som numret på kortet, så att de känns igen som ett par. Accent används här för en kontroll Pontus gör, inte som dekor, och den vita kanten syns mot alla foton.
- **Risk: tiden.** Mätningen gav ungefär 10 s varmt och 24 s kallt på Pontus foto. Budgeten är 30 s per försök. Blir den för kort uteblir bara numren.

## Spec Change Log

- Vid bygget:
  - **Portens metod tar ett objekt,** `locateItems({ image, labels }, signal, options)`, som de andra metoderna, i stället för tre argument. `options.deadline` kortar budgeten som för `analyzeImage`.
  - **Låset per användare har en sort** (`ai-runs.ts`, delat av `analyzePlace` och `locatePlaceItems`). En analys stoppar allt före den. Ett uppslag stoppar bara ett äldre uppslag, och under en analys svarar det `ai_superseded` direkt i stället för att stoppa den.
  - **Routen har `maxDuration` 60.** Uppslaget har ett försök på 30 s efter en hälsokontroll på högst 5 s, och porten får fristen 3 s före `maxDuration` som i analysen.
  - **Statusen står under miniatyren, inte i den.** "Letar upp varorna på fotot …" och sedan "Numren på korten visar var varorna är på fotot." i en artig statusregion (`role="status"`), som är dold när den är tom. Miniatyren har inga markörer, eftersom de inte går att läsa på 72 px.
  - **Fotots storlek ligger på en ruta runt bilden** (`pantry-photo-frame`), som markörerna placeras på i procent. Bilden fyller rutan. Testet för växlingen till full storlek läser storleken från rutan i stället för bilden. Utan känd storlek visas bilden som förut, utan markörer.
  - **Ett kort utan punkt för någon av sina varor har inget nummer.** Om bara en senare vara har en punkt har kortet ändå den första varans nummer, och markören står på den senare varan.
  - **Utvärderingen:** ett misslyckat uppslag fäller körningen, men en vara utan punkt gör det inte. Rapporten visar "alla 20" eller "18 av 20". Varje fall får 170 s i stället för 130 s, så att avläsningen och uppslaget ryms.
  - **Mätningen:** mätning mot LM Studio väntar. Storyn committas utan den, så att 8.4 kan bygga vidare, och siffrorna kommer i en egen commit.
  - **`kyl-dorr.locate.json`** kommer från ett anrop mot Qwen3.6 i LM Studio med fixturens tre varor (efter sammanslagningen). Punkterna är kontrollerade mot bilden. Tiden från det anropet räknas inte som mätning.

- Efter granskningen (iteration 1):
  - **Avläsningen** kontrolleras på servern med samma schema som klienten (`readingSchema`) innan den skickas. En avläsning som inte klarar det loggas som `analyze_reading_invalid` och lämnas utanför svaret, så att korten bara saknar nummer. Grenen för en jämförelse som inte går att läsa skickar också avläsningen.
  - **Nummer per enhet:** delas en katalogvara på kort per enhet, får varje kort bara numren på varorna med sin enhet. Varor utan mängd följer med det första kortet, som deras mängd gör.
  - **En källa för numren:** `numberedCards` ger exakt de kort som visas ("Nytt" och "Ändrat"). Märkena, markörerna, statusen och beslutet om uppslaget (`hasNumberableCards`) använder den. Ett svar med bara oförändrade varor och "Syns inte längre" gör inget uppslag.
  - **Kortets nummer** är det första av dess varunummer som har en punkt (`cardNumber`), så numret står alltid på en markör på kortets egen vara. Detta ersätter "Ett kort utan punkt …" under Vid bygget.
  - **Platshållaren** "vara" (`readingPlaceholder`) behåller sitt nummer i avläsningen, men dess punkt används aldrig.
  - **Fotots storlek:** rutan och markörerna följer bildens avkodade storlek (`naturalWidth` och `naturalHeight`), och bilden har `object-contain`. Storleken i filens huvud lägger ut rutan tills bilden är avkodad, och då finns inga markörer. Utan storlek i filens huvud görs inget uppslag. Ett foto som inte går att visa (stort eller som miniatyr) tar bort numren från korten och statusen.
  - **Markörerna** hålls inne i rutan (`clamp(14px, X %, calc(100 % - 14px))`). De är 24 px och lite genomskinliga (85 %) när fotot passar skärmen, och hela i full storlek. Märken och markörer har minsta storlek, `leading-none` och utfyllnad i stället för fast höjd, så att "25" ryms vid 200 % text.
  - **Ingen layoutförskjutning:** medan numren letas upp har varje kort som kan få ett nummer en osynlig platshållare av samma storlek.
  - **Skärmläsare:** "Nummer 3 på fotot" står som dold text i kortets rubrik, efter titeln. Siffran man ser är dold för skärmläsare. Statusregionen finns, tom, så länge sektionen visas, och texten skrivs först efter att regionen har kommit på plats.
  - **Uppslagets livslängd:** ett nytt uppslag stoppar det som pågår. Uppslaget stoppas när fotot byts, när Hemma lämnas, när ett foto inte går att visa och när alla kort är hanterade. "Ångra" skickar det igen. Avbryts, misslyckas eller ersätts ett nytt fotos analys medan de gamla korten står kvar, skickas de gamla korten uppslag igen. Nummer som redan har kommit slås aldrig upp igen.
  - **Låset:** `startRun(id, "analyze")` ger alltid en controller (överlagring), och reservvägen `?? new AbortController()` är borta. `ai-runs.ts` säger att låset gäller per process och bara de två anropen.
  - **Leverantörer:** `locateItems` frågar bara ett mål med `supportsGrounding`, alltså LM Studio med en Qwen-modell (`/qwen/i`) och mocken. Alla andra svarar `ai_unavailable` direkt, så att fotot aldrig skickas en andra gång till en leverantör som inte är tränad för punkter i tusendelar.
  - **Svarsbudget:** `maxOutputTokens` för uppslaget är 1 600. När modellen stannar vid gränsen loggas `locate_truncated`.
  - **E2E:** kortens rubriker kontrolleras med `cardTitles` (`tests/e2e/support.ts`), eftersom rubriken nu kan sluta med "Nummer 3 på fotot".

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- Avläsningen:
  - Servern bygger `reading` av exakt de varor som behölls (högst 25) och kontrollerar den med klientens schema. Ett fel loggas som `analyze_reading_invalid` och fäller aldrig svaret.
  - Grenen utan läsbar jämförelse skickar också `reading`.
- Numren:
  - Kort per enhet delar aldrig ett nummer.
  - Märken, markörer och uppslaget utgår från samma kort (`numberedCards`). Oförändrade varor har inget nummer, och ett svar med bara sådana gör inget uppslag.
  - `cardNumber` tar det första varunumret som har en punkt.
  - Platshållaren "vara" får inget nummer på fotot.
- Fotot:
  - Den avkodade storleken styr rutan och markörerna, och bilden har `object-contain`.
  - Utan känd storlek görs inget uppslag.
  - Ett foto som inte går att visa tar bort numren.
  - Markörerna hålls inne i rutan, är mindre och lite genomskinliga när fotot passar skärmen.
  - Märken och markörer växer med texten.
- Ingen layoutförskjutning: en osynlig platshållare medan numren letas upp.
- Skärmläsare: numret i rubriken, och en statusregion som finns tom innan texten kommer.
- Uppslagets livslängd: ett pågående uppslag stoppas av ett nytt och när kort, foto eller Hemma försvinner. De gamla korten får sina nummer igen om ett nytt fotos analys inte ger något svar.
- Låset: `startRun` för en analys ger aldrig `null`. Låset är dokumenterat som per process och för två anrop. Nya tester för uppslag och analys mot varandra.
- Leverantörer: bara mål med `supportsGrounding` tillfrågas.
- Svarsbudget: 1 600 token och loggen `locate_truncated`.
- Felstavat testnamn rättat ("never writes").
- Nya tester:
  - 30 varor ger en avläsning med 25 som klarar klientens schema;
  - grenen utan läsbar jämförelse;
  - nummer per enhet;
  - inga markörer utan känd storlek, med fotot kvar;
  - inga nummer efter ett bildfel;
  - inget nummer eller markör för oförändrade varor;
  - nytt uppslag efter avbruten, misslyckad eller ersatt analys;
  - leverantörer utan stöd för punkter;
  - avkortat svar.

**Avvisat:**
- Annan sampling för uppslaget. Experimentet mätte med `presence_penalty` 1,5, och punkterna hamnade rätt, så det som mättes behålls.
- En HMAC-token som knyter uppslaget till en tidigare analys. Appen har en användare, och etiketterna påverkar bara användarens egna punkter.
- Ett globalt lås för alla AI-anrop. Låset är dokumenterat i stället.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas
- `scripts/with-test-lock.sh sh -c 'pnpm test:integration'` -- expected: lyckas
- `scripts/with-test-lock.sh sh -c 'AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e'` -- expected: lyckas
- `EVAL_RUNS=3 AI_PROVIDER=lmstudio AI_MODEL=qwen/qwen3.6-35b-a3b LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1 pnpm eval:ai tests/eval/analyze-image.eval.ts` -- expected: giltiga körningar med tiderna i rapporten

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen, vänta på numren, öppna fotot och jämför markörerna med korten, också i full storlek. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- VoiceOver: kortets nummer läses som "Nummer 3 på fotot", och markörerna läses inte.
