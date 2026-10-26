# Matkoll – öppna frågor

Frågor och osäkerheter som samlas under bygget och presenteras för Pontus när arbetet är klart. Nyaste överst.

## Till Pontus

| # | Fråga | Förslag / standard tills vidare | Uppkom |
| --- | --- | --- | --- |
| 1 | Behöver inköpslistan fungera utan nät i butiken? | Nej i v1; nät krävs | PRD, 2026-10-25 |
| 2 | Vilka recept och kylskåpsfoton ska ingå i AI-testuppsättningen? Fem påhittade recept finns nu i `tests/fixtures/ai/` (kycklinggryta, ugnspannkaka, linssoppa, kladdkaka, fiskgratäng). | 10–20 recept från koket.se och tasteline.com tas fram av utvecklingen; Pontus bekräftar och bidrar med några egna kylskåpsfoton | PRD, 2026-10-25 |
| 3 | Molnleverantör för AI när appen ska användas av fler | Den billigaste som klarar testuppsättningen; avgörs senare | Brief |
| 4 | Ska Vercel bygga förhandsversioner av grenar? De får ingen databas och svarar 503, så de är bara en byggkontroll. | Behåll dem med `SITE_URL` och `AI_PROVIDER=mock` i Preview; stäng av dem om de bara stör (se `docs/drift.md`, steg 9) | Story 3.8 |
| 5 | ~~Får en sammanslagning till `main` driftsätta i produktion?~~ **Besvarad 2026-10-26 (Pontus): ja.** Epic-PR:erna slås ihop till `main` som tidigare. Så länge Production i Vercel saknar miljövariabler misslyckas produktionsbygget och inget publiceras. Den första riktiga publiceringen görs när Pontus följer `docs/drift.md`. | Lägg inte in miljövariabler i Production förrän Supabase i molnet finns | 2026-10-26, PR #41 |

## Tekniska osäkerheter (utredas under bygget)

| # | Osäkerhet | Hur den hanteras | Uppkom |
| --- | --- | --- | --- |
| T1 | ~~Klarar ica.se, arla.se och coop.se serverhämtning?~~ **Besvarad 2026-10-25** med `pnpm sites:probe` (appens `safeFetch` och `extractRecipePage`): **ica.se fungerar** (två recept, sidorna hämtas och har JSON-LD Recipe; Qwen tolkar dem), **arla.se fungerar** (två recept, samma resultat), **coop.se saknar receptdata** (sidan hämtas men receptet byggs i webbläsaren, så HTML:en har varken JSON-LD eller recepttext). ica.se och arla.se ligger nu i `ensure_user_defaults()` (migrationen `*_settings_more_recipe_sites.sql`); coop.se gör det inte. Kvar: Qwen behövde 40–56 s för ett fullt recept från ica.se, arla.se och koket.se, nära eller över AI-portens 45 s per försök (se T4). | Ingen åtgärd för sajterna; coop.se kan klistras in som text | Brief, Story 1.8 |
| T4 | ~~Riktiga receptsidor tar ofta längre än 45 s att tolka för Qwen.~~ **Beslutat 2026-10-25 (Claude, går att ändra):** gränsen per försök höjs till 100 s inom 115 s totalt (AD-9). Ett nytt försök görs bara om tiden räcker. | Om tolkningen ändå känns för långsam: kortare svar (t.ex. utan katalogförslag för rader som redan matchar) eller en snabbare modell | Story 1.8 |
| T5 | Hinner Qwen alltid svara på AI-förslag inom 100 s? **Mätt 2026-10-26** (`pnpm eval:ai tests/eval/suggest-dishes.eval.ts`, Qwen3.6 i LM Studio, 17 lagerrader, två anrop per körning, det andra med det förstas titlar att undvika): de flesta svar kommer på 30–60 s (1 300–2 000 token). Före granskningen: en körning samtidigt med testsviten misslyckades helt, i en annan tog "andra rätter" 115 s (`ai_unavailable`), och två klarade allt på 31–53 s. Med lagret som JSON gav en körning 60,7 s och förvanskade titlar för det första anropet och 115 s (`ai_unavailable`) för det andra, så raderna återinfördes. **Med rader igen, efter granskningen** (rensade namn, titlar att undvika kontrolleras i svaret), två körningar utan annan last: 58,3 s och 87,9 s, sedan 33,1 s och 39,8 s, alla godkända. 87,9 s är nära gränsen och var troligen ett nytt försök efter ett ogiltigt svar. En gång av åtta svarade modellen med bara ett förslag, vilket det nya försöket rättar. | Behåll 100 s per försök och 115 s totalt tills vidare. Om det tar för lång tid i vardagen: färre steg per rätt, två förslag i stället för tre eller en snabbare modell | Story 5.2 |
| T6 | Hur bra och hur snabbt känner Qwen igen varor på riktiga kylskåpsfoton? **Mätt 2026-10-26** (`pnpm eval:ai tests/eval/analyze-image.eval.ts`, Qwen3.6 i LM Studio) bara på syntetiska bilder (ritade förpackningar med etiketter, samma som mockens `kyl.png`, och en tom hylla): alla sex varor hittades utan felgissningar, med rätt antal förp och st efter att prompten skärptes (först blev "Vispgrädde 3 dl" 1 dl och "Smör 500 g" 1 g). Tiderna var 12–38 s för bilden på 720 × 900 px (38 s när modellen var kall), 20,5 s för samma bild på 1600 px och 4 s för den tomma hyllan. Efter granskningen mättes token: prompt, schema och en bild på 1600 px är 777 token, och en vara är ungefär 60 token svar. Därför är gränsen 25 varor med `maxOutputTokens: 3000` (40 varor hade legat vid gränsen). Qwen ger ibland `hint.name` "mellanmjölk" och ibland "mjölk" för samma paket, så en katalog med "mjölk" kan få förslaget "mellanmjölk" som ny ingrediens. | Pontus lägger några egna foton med `<namn>.expected.json` i `tests/eval/photos/` (ignoreras av git) och kör `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/analyze-image.eval.ts`. Över 90 s per foto: mindre bild, färre varor eller snabbare modell. Blir det många "Ny" för varor som redan finns i katalogen: Rätta (Story 6.2) väljer rätt ingrediens, och prompten kan be om kortare grundnamn | Story 6.1 |
| T2 | Hur stabilt fyller Claude in Chrome varukorgen på ICA Handla? | Pontus testar efter Epic 7 | Brief |
| T3 | ~~Klarar Qwen3.6-35B-A3B i LM Studio både bild och JSON-schema, och stängs tänkläget av?~~ **Besvarad 2026-10-25:** ja. Röktestet ger 5 av 6: text, bild, JSON-LD och strikt JSON-schema fungerar, och försök att smuggla in instruktioner ignoreras. Tänkläget stängs av med `reasoning_effort: "none"`. Kvar: Qwen uppskattar en total tid när receptet saknar sådan. | Ingen åtgärd; tiden visas bara som information | Arkitektur, Story 1.4 |

## Checklista för Pontus (när molnet sätts upp, efter Epic 1–3)

Varje punkt beskrivs steg för steg, med var värdet hämtas och hur det kontrolleras, i [`docs/drift.md`](drift.md).

- Skapa Vercel-projektet `matkoll` (region `arn1`, produktion bara från `main`) och Supabase-projektet `matkoll` (region `eu-north-1`).
- I Supabase: stäng av registrering, sätt Site URL och redirect-URL (`<adress>/auth/confirm**`), lägg in e-postmallen för engångslänken från `supabase/templates/magic-link.html`, och överväg egen SMTP (Supabase inbyggda e-post har låg gräns).
- Kör `supabase link` och `supabase db push` från din terminal, och sedan före varje koddriftsättning med nya migrationer.
- Kör `pnpm users:sync` mot molnet så att din e-post finns som användare (`SUPABASE_SERVICE_ROLE_KEY` bara tillfälligt i terminalen, aldrig i Vercel).
- Sätt upp Cloudflare Tunnel och Access med tjänstetoken för LM Studio (kräver domän): `LMSTUDIO_BASE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
- Lägg in miljövariablerna i Vercel enligt `.env.example`; Supabase-variablerna bara i Production, inte i Preview.
- Välj för förhandsversionerna i Vercel: behåll dem som byggkontroll (Preview får bara `SITE_URL` och `AI_PROVIDER=mock`; de bygger men svarar 503 utan databas, kontrollerat lokalt) eller stäng av dem under **Settings → Git**.
- Lägg in GitHub-hemligheterna för säkerhetskopian: `SUPABASE_DB_URL` (Session pooler-strängen) och `BACKUP_PASSPHRASE` (minst 32 tecken; spara den i din lösenordshanterare), och repovariabeln `BACKUP_ENABLED=true`. Kör sedan flödet Backup en gång för hand. Kontrollera att mejl om misslyckade flöden går till dig, och ladda ner den senaste säkerhetskopian en gång i månaden.
- Godkänn första publiceringen i produktion.
- Kontrollera standardbutiken i Inställningar → Butik. Öppna URL:en `https://handlaprivatkund.ica.se/stores/1003733` i din webbläsare och se att den leder till Maxi ICA Stormarknad Östersund i ICA Handla. Rätta den annars, och fyll i butikens adress.

## Att prova på riktig telefon (när Pontus har tid)

Saker som testerna inte kan visa och som behöver en riktig iPhone:

- Svep vänster på en lagervara i Hemma: knappen "Ta bort" ska visas utan att Safari går bakåt. Prova att svepa nära skärmkanten och mitt på raden.
- VoiceOver på en lagervara: knappen "Ta bort Mjölk" ska gå att nå och aktivera, och raden ska inte öppna arket i stället.
- Fotoimport av ett recept med kameran (Story 1.9) och engångslänken i Mail-appen (Story 1.2).
- Kameraknappen i Hemma (Story 6.1): "Fotografera kylen" ska öppna bakre kameran direkt, och "Välj bild" under den ska öppna bildbiblioteket. Ta ett foto av den öppna kylen mot LM Studio och se att "Tittar på bilden …" och "Avbryt" visas och att lagerförslagen kommer. Prova också med LM Studio avstängt: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" ska visas inom ungefär 5 s, och resten av Hemma ska fungera.
- Lagerförslagen i Hemma (Story 6.2), Flöde 3 mot LM Studio: fotografera kylen, bekräfta några, rätta ett (till exempel "grädde" till "matlagningsgrädde 2 dl") och avvisa ett. Kortet Kyl ska visa rätt antal, och obegränsade varor ska stå kvar under "Finns hemma". Med VoiceOver ska "Bekräfta mjölk", "Rätta mjölk" och "Avvisa mjölk" gå att nå, och bekräftelserna ("mjölk är sparad i kylen.", "ketchup är avvisad.") ska läsas upp. Med 200 % text ska korten och deras tre knappar radbrytas utan vågrät scroll.
- Stegläget (Story 4.2), efter driftsättningen via https: tryck "Laga nu" och låt telefonen ligga orörd längre än skärmsläckningstiden. Skärmen ska hållas tänd. Byt till en annan app och tillbaka: skärmen ska hållas tänd igen, och raden "Skärmen kan släckas i den här webbläsaren." ska inte visas. Prova också att svepa åt höger nära vänsterkanten: Safari kan gå bakåt i stället för att byta steg, vilket är godtaget i v1 eftersom knapparna finns.
