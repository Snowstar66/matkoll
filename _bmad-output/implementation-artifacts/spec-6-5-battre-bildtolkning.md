---
title: 'Story 6.5: Bättre bildtolkning'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
baseline_commit: 'a00965d33351408f4ac6be61aa4a8f2457d7e45a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus riktiga foto av kylen tolkas sämre i Matkoll än när Pontus frågar Qwen direkt i LM Studio. Tre saker gör det:
- bilden förminskas till 1600 px, så att text på förpackningarna blir svår att läsa;
- anropet använder LM Studios standardinställningar för sampling, som med 1600 px gav upprepningsslingor ("Grädde" tolv gånger i rad, och samma sak med "Vispgrädde");
- prompten ber bara om varor som "syns tydligt", så att delvis skymda varor och dörrens hyllor faller bort, och märke, sort och storlek kommer sällan med.

Ett experiment med Pontus foto mot Qwen3.6 i LM Studio (33 körningar, beslutsloggen 2026-10-26) visade att 2048 px, uttrycklig sampling och en skärpt prompt ger 13–22 varor med märken på 20–62 s, utan slingor och utan ogiltiga svar.

**Approach:**
- **Bilden:** ett foto av en plats förminskas till högst 2048 px (fortfarande högst 1,5 MB som JPEG). En kokbokssida stannar på 1600 px.
- **Sampling:** LM Studio-adaptern skickar för `analyzeImage` uttryckligen temperatur 0,7, top_p 0,8, top_k 20 och presence penalty 1,5, och tänkläget är fortfarande avstängt.
- **Prompten** går igenom bilden hylla för hylla, uppifrån och ned och med dörrens hyllor, och läser märke, sort, fetthalt och storlek. Delvis synliga varor tas med som "osäker". Den hittar aldrig på varor och upprepar aldrig en post. Storleken står i `label` och inte i `unit`, och `hint.name` är grundformen utan märke.
- **AI-schemat** får `confidence: "säker" | "osäker"` per vara.
- **Porten** slår ihop poster med samma `label`, så att en upprepning aldrig blir flera förslag, och räknar dem.
- **Korten** visar märket (`label`) som rubrik och katalogvaran under. Ett osäkert förslag har märket "Osäker" och kommer inte med i "Bekräfta alla". Det kräver ett eget Bekräfta eller Rätta.

## Boundaries & Constraints

**Always:**
- Tänkläget är avstängt (`reasoningEffort: "none"`, `enable_thinking: false`). Med tänkläget påslaget går det strukturerade svaret sönder.
- `maxOutputTokens` är 3 000 och taket är 25 varor (`inputLimits.analyze`), som i 6.1.
- Bilden förminskas i klienten till högst 2048 px för en plats och högst 1,5 MB, och servern kontrollerar samma gräns för `/api/ai/analyze` (AD-15). Fotot sparas och loggas aldrig.
- Samplingen ligger i LM Studio-adaptern och gäller bara `analyzeImage`. `top_k` går via `providerOptions`, eftersom AI SDK:s openai-compatible-adapter släpper `topK` med en varning.
- En sammanslagen upprepning behåller den första posten och adderar inga mängder. Prompten säger att flera likadana förpackningar är en post med antalet som mängd, så en upprepad post är modellen som upprepar sig.
- Alla 6.1–6.4-regler gäller: analysen skriver aldrig (AD-2), länken till katalogen kommer bara från `matchIngredients` (AD-6), ingenting tas bort utan ett tryck (FR-25), och "Ångra" fungerar som i 6.3 och 6.4.
- Alla tester och CI använder `AI_PROVIDER=mock`. Utvärderingen mot ett riktigt foto körs bara mot LM Studio på den här datorn, med fotot utan metadata, och fotot läggs aldrig i repot.

**Never:**
- Ingen ändring av sampling, prompt eller bildstorlek för `parseRecipe` och `suggestDishes`, eftersom det saknas mätningar för dem.
- Ingen ändring av Anthropic- eller OpenAI-adaptrarna, eftersom värdena är Qwens rekommendation.
- Inget "osäker"-förslag sparas utan ett eget tryck.
- Inget nytt i databasen och ingen ny Server Action.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stort foto av en plats | Ett foto på 4284 × 5712 px | Skickas som JPEG på 1536 × 2048 px, högst 1,5 MB | N/A |
| Kokbokssida | Ett foto på 4000 × 3000 px i Importera recept | Skickas på 1600 × 1200 px, som förut | N/A |
| För stort till analysen | En bild på 2100 px till `/api/ai/analyze` | 413 `image_too_large` | `image_too_large` |
| Sampling | `analyzeImage` mot LM Studio | Begäran har `temperature` 0,7, `top_p` 0,8, `top_k` 20, `presence_penalty` 1,5 och `reasoning_effort` "none" | N/A |
| Andra anrop | `parseRecipe` och `suggestDishes` mot LM Studio | Ingen `temperature`, `top_p`, `top_k` eller `presence_penalty` i begäran | N/A |
| Upprepning | AI:n svarar "Grädde" fyra gånger och "Ägg" en gång | Två förslag. Porten ger `repeated: 3`, och jämförelsen är ofullständig | N/A |
| Osäker vara | AI:n ger "Gul flaska, troligen senap" med `confidence` "osäker" | Kortet har rubriken "Gul flaska, troligen senap", "senap" under och märket "Osäker". "Bekräfta alla" tar inte med det | N/A |
| Bekräfta alla med osäkra kvar | Två säkra och ett osäkert förslag | De två sparas, och bekräftelsen säger "1 osäker vara är kvar att bekräfta eller rätta.". Det osäkra kortet står kvar, och sektionen står kvar | N/A |
| Bara osäkra | Alla förslag är osäkra, och inget saknas | "Bekräfta alla" är inaktiv | N/A |
| Eget tryck | Bekräfta på ett osäkert kort | Sparas som i 6.2 och 6.4 | Som i 6.2 |
| Märke som namn | `label` "Ägg" och katalogvaran "ägg" | Rubriken är "ägg" utan rad under, eftersom raden vore samma ord | N/A |
| Flera märken på en vara | "Arla mellanmjölk" och "ICA mellanmjölk" matchar båda "mellanmjölk" | Ett förslag (som i 6.1) med rubriken "Arla mellanmjölk, ICA mellanmjölk" | N/A |
| Osäker och lagret | Kylen har "senap", och bilden ger en osäker senap | Senap hamnar inte i "Syns inte längre". Förslaget är "Ändrat" eller oförändrat som i 6.4 | N/A |
| Utvärderingen | `pnpm eval:ai` med Pontus foto, tre körningar | Varje körning ger giltigt svar inom 100 s utan slinga. Rapporten visar tid, antal, ogiltiga och upprepningar per körning | Ett fel eller en slinga får testet att fallera |

</frozen-after-approval>

## Code Map

- `docs/beslutslogg.md` (2026-10-26, Story 6.1) -- 25 varor, `maxOutputTokens` och tokenmätningen som kommentaren i `service.ts` bygger på
- `src/lib/images.ts`, `src/lib/downscale-image.ts` (+ test) -- `maxImageSide`, `fitWithin` och `downscaleImage`
- `src/app/api/ai/route-support.ts` (+ test), `src/app/api/ai/analyze/route.ts` (+ test) -- `readImageForm`, som kontrollerar sidan mot `maxImageSide`
- `src/features/pantry/ui/use-pantry-analysis.ts` -- anropar `downscaleImage`
- `src/features/recipes/ui/import-sheet.tsx` -- anropar `downscaleImage` för kokbokssidor (oförändrad gräns)
- `src/server/ai/run.ts` (+ test) -- `ModelTarget`, `StructuredRequest` och `runStructured` (`generateText`)
- `src/server/ai/adapters/lmstudio.ts` -- `providerOptions` med `reasoningEffort` och `chat_template_kwargs`
- `node_modules/@ai-sdk/openai-compatible/src/chat/openai-compatible-chat-language-model.ts` -- `getArgs`, som skickar `temperature`, `top_p` och `presence_penalty`, släpper `topK` och skickar okända `providerOptions[lmstudio]` vidare i body
- `src/server/ai/service.ts` (+ test), `schemas.ts` (+ test), `prompts/analyze-image.md` -- `analyzeImage`, `aiPantryItemShape`, `aiPantryItem` och `parseAnalyzeItems`
- `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/manifest.json`, `kyl.analyze.json`, `scripts/render-pantry-image.mjs`
- `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `AiPantryItemLike`, `toPantrySuggestions` och `pantrySuggestionSchema`
- `src/features/pantry/actions/analyze-place.ts` (+ test) -- `incomplete`
- `src/features/pantry/ui/pantry-suggestion-list.tsx` (+ test), `pantry-suggestions.tsx` (+ test), `pantry-inventory.test.tsx` -- korten, `confirmable` och "Bekräfta alla"
- `src/components/badges.tsx` -- `Badge` (tone `sky`: "kontrollera det här")
- `tests/eval/analyze-image.eval.ts` -- utvärderingen
- `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts`, `pantry-inventory.spec.ts`, `support.ts`, `global-setup.ts`
- `docs/oppna-fragor.md` (T6)

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/images.ts`, `downscale-image.ts` (+ test) -- ny `maxPlacePhotoSide = 2048`. `downscaleImage(file, { maxSide })` har `maxImageSide` (1600) som standard. Testerna täcker 2048 för en plats och 1600 utan värde -- AD-15
- [x] `src/app/api/ai/route-support.ts` (+ test), `analyze/route.ts` (+ test) -- `readImageForm(request, fields, { maxSide })`. Analysen tar 2048 (+ tolerans) och importen 1600 som förut -- AD-15
- [x] `src/features/pantry/ui/use-pantry-analysis.ts` -- `downscaleImage(file, { maxSide: maxPlacePhotoSide })`
- [x] `src/server/ai/run.ts` (+ test) -- ny typ `Sampling = { temperature?, topP?, presencePenalty?, providerOptions? }`. `StructuredRequest.sampling` skickas till `generateText`, och dess `providerOptions` slås ihop per leverantör med målets. `ModelTarget.imageSampling?: Sampling` -- AD-9
- [x] `src/server/ai/adapters/lmstudio.ts` -- `imageSampling`: `temperature: 0.7`, `topP: 0.8`, `presencePenalty: 1.5` och `providerOptions.lmstudio.top_k: 20`. Tänkläget är avstängt som förut -- AD-9
- [x] `src/server/ai/schemas.ts` (+ test) -- `confidence: z.enum(["säker", "osäker"])` i `aiPantryItemShape` och `aiPantryItem`. `parseAnalyzeItems` slår ihop poster med samma normaliserade `label` (NFC, gemener, ett mellanslag), behåller den första och räknar `repeated` -- AD-10
- [x] `src/server/ai/service.ts` (+ test) -- `analyzeImage` skickar `sampling: target.imageSampling`, och `AnalyzeImageResult` får `repeated`. Kommentaren om token rättas. Testerna låser:
  - samplingen i LM Studios body för `analyzeImage`;
  - att `parseRecipe` och `suggestDishes` saknar den;
  - sammanslagningen och `confidence`.

  -- AD-9
- [x] `src/server/ai/prompts/analyze-image.md` -- prompten från experimentet (`prompt-e2.md`), anpassad till Matkolls texter -- AD-9
- [x] `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/` -- mocken svarar genom `parseAnalyzeItems`, så att den slår ihop som porten. `kyl.analyze.json` får `confidence: "säker"` på alla sex varor. Ett nytt syntetiskt foto `kyl-dorr.png` (ritat av `render-pantry-image.mjs`) har svaret `kyl-dorr.analyze.json`:
  - "Lantmejeriet vispgrädde 36 % 3 dl", fyra gånger, säker;
  - "Solgården apelsinjuice 1 l", säker;
  - "Gul flaska, troligen senap", osäker.
- [x] `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `AiPantryItemLike` får `confidence?`. `pantrySuggestionSchema` får `labels?: string[]` (högst 3, 1–200 tecken) och `uncertain?: boolean`. `toPantrySuggestions` samlar de olika etiketterna per förslag i ordning, och förslaget är osäkert när någon av dess varor är osäker. Nya texter:
  - `uncertainBadgeText` är "Osäker";
  - `uncertainSuggestionText` är "AI:n är osäker på varan, så Bekräfta alla tar inte med den.";
  - `uncertainLeftText(n)` ger "1 osäker vara är kvar att bekräfta eller rätta." eller "2 osäkra varor är kvar att bekräfta eller rätta.";
  - `suggestionTitle(s)` ger etiketterna, eller namnet när de saknas eller bara är namnet.
- [x] `src/features/pantry/actions/analyze-place.ts` (+ test) -- `incomplete` är också sant när porten slog ihop upprepningar (`repeated > 0`) -- 6.4
- [x] `src/features/pantry/ui/pantry-suggestion-list.tsx` (+ test), `pantry-suggestions.tsx` (+ test) -- korten och "Bekräfta alla":
  - Kortets rubrik är `suggestionTitle`, och katalogvaran står under när den skiljer sig. Badgen "Osäker" (`sky`) och `uncertainSuggestionText` visas på osäkra kort.
  - "Bekräfta alla" hoppar över osäkra förslag, både i listan och i `confirm` med `all`.
  - Bekräftelsen lägger till `uncertainLeftText` när osäkra kort finns kvar.
  - Knapparnas namn ("Bekräfta mjölk") är som förut.
- [x] `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts`, `pantry-inventory.spec.ts` -- rubrikerna följer etiketterna i `kyl.png`
- [x] `tests/e2e/pantry-image-reading.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-bildtolkning@matkoll.test` med `kyl-dorr.png` och en tom Kyl. Testet kontrollerar:
  - tre kort, rubrikerna och "Osäker" på senapen;
  - att "Bekräfta alla" sparar två och att senapen står kvar med texten om osäkra;
  - att Bekräfta på senapen sparar den.
- [x] `tests/eval/analyze-image.eval.ts` -- tre körningar per foto (`EVAL_RUNS`, standard 3). Fotot förminskas till 2048 px med kvalitet 85 och utan metadata. Rapporten visar tid, antal varor, ogiltiga, upprepningar och slinga per körning. Testet fallerar vid fel, slinga (två eller fler sammanslagna upprepningar i ett svar) eller över 100 s
- [x] Kör utvärderingen en gång mot LM Studio på 127.0.0.1 med `IMG_5673.jpeg` (`IMG_5673.expected.json` i den ignorerade mappen). Resultatet skrivs in i `docs/oppna-fragor.md` (T6) och i beslutsloggen
- [x] `docs/beslutslogg.md`, `ARCHITECTURE-SPINE.md` (AD-15) -- besluten nedan, och 2048 px för platser

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/analyze-image.eval.ts` med Pontus foto, when det körs tre gånger, then ger varje körning giltigt svar utan slinga inom 100 s.

## Implementation Notes

- **Beslut (förslag): 2048 px bara för platser.** Experimentet mätte bara kylfoton. Kokbokssidor stannar på 1600 px tills det finns mätningar, så att importens tid och kontext inte ändras. Servern kontrollerar gränsen per route. En JPEG på 2048 px med kvalitet 85 är ungefär 726 KB, så taket på 1,5 MB behålls.
- **Beslut (förslag): sampling bara för `analyzeImage` och bara i LM Studio.** Värdena är Qwens rekommendation för läget utan tänkande, och det var med dem som slingorna försvann. `parseRecipe` och `suggestDishes` har inga uppmätta slingor och behåller standardinställningarna. Om en slinga syns där läggs frågan i `docs/oppna-fragor.md`. Anthropic och OpenAI ändras inte, eftersom deras resonerande modeller kan neka `temperature`.
- **Beslut (förslag): `top_k` via `providerOptions`.** AI SDK:s openai-compatible-adapter släpper `topK` med en varning men skickar okända fält under leverantörens nyckel vidare i body. Det är samma väg som `chat_template_kwargs`.
- **Beslut (förslag): en upprepad etikett är en upprepning, inte fler förpackningar.** Den första posten behålls och mängderna adderas inte. Annars skulle "Grädde" tolv gånger bli "grädde 12 förp". Olika etiketter för samma katalogvara adderas som förut i `toPantrySuggestions`, eftersom de är olika förpackningar.
- **Beslut (förslag): en upprepning gör jämförelsen ofullständig.** En slinga betyder att modellen kan ha slutat titta på resten av bilden. Då kan varor hamna i "Syns inte längre" fast de finns. Med `incomplete` tar "Bekräfta alla" inte med borttagningarna, och gruppen visar "Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.".
- **Beslut (förslag): ett osäkert förslag skyddar en rad från "Syns inte längre".** En osäker träff på senap betyder att något på bilden liknar senap. Att föreslå att senapen tas bort samtidigt vore motsägelsefullt, och felet åt det hållet är det ofarliga: en rad står kvar. Förslaget hamnar i "Ändrat" eller räknas som oförändrat som i 6.4. Ett osäkert förslag i "Ändrat" har märket och kommer inte med i "Bekräfta alla". Alternativet, att låta osäkra träffar ge "Syns inte längre", gav två kort för samma vara.
- **Beslut (förslag): ett förslag är osäkert när någon av dess varor är osäker.** Förslag summeras per katalogvara och enhet (6.1), så en säker och en osäker förpackning blir "2 förp". Ett säkert märke skulle då låta en gissad förpackning komma med i "Bekräfta alla".
- **Beslut (förslag): kortets rubrik är märket.** Rubriken är etiketterna (högst tre, i AI:ns ordning, med komma emellan), och katalogvaran står under. När etiketten bara är katalogvarans namn visas namnet en gång. Knapparnas namn ("Bekräfta mjölk") och bekräftelserna ("mjölk är sparad i kylen.") använder fortfarande katalogvaran, eftersom det är den som sparas. Etiketterna är text från modellen och visas bara som text.
- **Beslut (förslag): `confidence` är obligatoriskt i schemat** (en `enum`). Strikta JSON-scheman tvingar fram fältet, och en vara utan det räknas som ogiltig som i 6.1.
- **Beslut (förslag): "Bekräfta alla" lämnar osäkra kort kvar** på samma sätt som kort som inte går att bekräfta (6.2). Fokus går till kameraknappen som förut, och bekräftelsen säger hur många osäkra som är kvar.
- **Kommentaren om token i `service.ts` rättas.** LM Studio (MLX) rapporterar ungefär 1 000 prompt-token både med 1600 och 2048 px, så bilden ingår inte i den siffran. Bildens andel av kontexten på 8 192 är alltså inte mätt. Den uppskattas till ungefär 3 100 token för 2048 × 1536 px om Qwen räknar en token per 32 × 32 px, och då ryms 1 000 + 3 100 + 3 000.
- **Risk: fler och sämre etiketter.** Prompten tar med delvis synliga varor, så listan kan bli längre (13–22 varor mot 12–16 med den gamla prompten). Felläsningar som "Schysst Kak" och "Delikat Grillgurt" visas som rubrik. Osäkra varor har märket och kommer inte med i "Bekräfta alla". Säkra felläsningar avvisar Pontus som förut.
- **Risk: `hint.name` är ibland märket** ("HP Original", "Extramjukt") trots prompten. Det blir då en ny katalogvara med märket som namn, och Pontus rättar med Rätta. Mätningen noteras i T6.
- **Risk: tiden.** Experimentet gav 20–62 s på 2048 px. Gränsen är 100 s per försök, och utvärderingen fallerar över 100 s.
- Loggning sker bara med koder och antal, aldrig med etiketter, namn eller bilddata.

## Spec Change Log

- Vid bygget:
  - **Slinga** betyder att samma etikettnyckel kommer tre gånger eller fler (`repeated` ≥ `minLoopRepeats` = 2). Porten och utvärderingen använder samma gräns.
  - **E2E-specen lägger in fotots katalogvaror** ("vispgrädde", "apelsinjuice" och "senap") i stället för att ta bort dem. Service role får inte ta bort från `ingredient`. Korten har därför inget "Ny".
  - **Utvärderingen mot Pontus foto** (`IMG_5673.expected.json` i den ignorerade mappen) förväntar sig de fem varor som experimentets körningar var överens om: vispgrädde, matlagningsgrädde, senap, mellanmjölk och Pepsi. Listan är Claudes läsning, inte facit från Pontus.

- Efter granskningen (iteration 1):
  - **Sammanslagningen:** en enda dubblett slås ihop i tysthet. Mängderna adderas i samma enhet, och den gör inte jämförelsen ofullständig. Bara en slinga gör jämförelsen ofullständig, och då adderas inga mängder.
    - Etikettnyckeln (`src/lib/label-key.ts`, delad med förslagen) tar bort punkt och mängd med enhet sist. Ett tal utan enhet står kvar.
    - Den behållna posten blir osäker om någon kopia är det och får den första mängden som finns.
  - **`confidence`** tolkas förlåtande. JSON-schemat har fortfarande `enum`, men ett udda eller saknat värde blir "osäker" och gör aldrig svaret ogiltigt. Detta ersätter "obligatoriskt" i Implementation Notes.
  - **Ett osäkert förslag är aldrig oförändrat.** När mängden stämmer är det "Ändrat" utan ersatta rader, och det hamnar fortfarande inte i "Syns inte längre".
  - **"Bekräfta alla"** räknar bara osäkra kort som går att bekräfta och som inte är nekade. Fokus går till det första osäkra kortet som är kvar.
  - **Samplingen** skickas bara när modellens id matchar `/qwen/i`.
  - **Prompten** säger igen att modellen tar de tydligaste först om det finns fler än 25.
  - **Kortet** visar "Sparas som: vispgrädde" under etiketten.
  - **Utvärderingen** förminskar bara foton som är större än 2048 px.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- Upprepningar:
  - Gränsen följer utvärderingen. Det är en slinga först när samma etikett kommer tre gånger eller fler. En enstaka dubblett slås ihop i tysthet, behåller mängden och gör inte jämförelsen ofullständig.
  - Etiketterna normaliseras före jämförelsen: gemener, tomrum, avslutande skiljetecken och mängd i slutet tas bort ("Grädde 3 dl" blir samma som "Grädde."). Det finns bara en hjälpfunktion för det (`src/lib/label-key.ts`). Avsteg vid bygget: en mängd i slutet tas bara bort när den har enhet. Annars hade "Vara 0" och "Vara 29" blivit en vara.
  - Är någon kopia osäker blir den sammanslagna varan osäker. Saknas mängd tas den första kända.
- `confidence` tolkas snällt. Okända eller saknade värden blir "osäker", så ett udda värde underkänner inte hela svaret.
- Ett osäkert förslag räknas aldrig som "stämmer med lagret". Det visas alltid som kort med "Osäker".
- "Bekräfta alla":
  - Osäkra kort räknas bara om de går att bekräfta och inte är avvisade.
  - Fokus går till första kvarvarande osäkra kort.
- LM Studio:
  - Qwens sampling används bara när modell-id:t innehåller "qwen".
  - `mergeProviderOptions` slår ihop per leverantörsnyckel, så att `reasoning_effort` inte försvinner.
- Prompten säger åter att modellen tar de tydligaste varorna först när fler än 25 syns.
- Kortet visar "Sparas som: …" när märket skiljer sig från katalogvaran.
- Utvärderingen förstorar inte bilder som är mindre än 2048 px.
- Nytt test: `suggestDishes` via LM Studio skickar ingen sampling.

**Avvisat eller uppskjutet:**
- `presencePenalty` 1.5 behålls. Det är Qwens officiella rekommendation för VL, och utvärderingen visade inga problem.
- Att hålla tillbaka säkra feltolkningar eller nya katalogvaror från "Bekräfta alla" avvisas. Då blir massbekräftelsen meningslös. Det säkra skyddet är att Pontus ser märket som rubrik.
- Kontextbudgeten vid 2048 px mäts inte nu. Den skjuts upp till `deferred-work.md` och tas upp om LM Studio börjar korta av svar.
- Att A/B-underlaget för samplingen är tunt noteras bara. Experimentet visade att slingorna försvann.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio AI_MODEL=qwen/qwen3.6-35b-a3b LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1 pnpm eval:ai tests/eval/analyze-image.eval.ts` -- expected: tre giltiga körningar per foto utan slinga, var och en inom 100 s

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen. Korten ska ha märken som rubrik, osäkra kort ska ha "Osäker", och "Bekräfta alla" ska lämna dem kvar. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- VoiceOver: kortets rubrik läses som märket, följt av katalogvaran och "Osäker".
- Vid 375 px och 200 % text: långa etiketter radbryts utan vågrät scroll.
