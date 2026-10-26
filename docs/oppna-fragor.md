# Matkoll – öppna frågor

Frågor och osäkerheter som samlas under bygget och presenteras för Pontus när arbetet är klart. Nyaste överst.

## Till Pontus

| # | Fråga | Förslag / standard tills vidare | Uppkom |
| --- | --- | --- | --- |
| 1 | Behöver inköpslistan fungera utan nät i butiken? | Nej i v1; nät krävs | PRD, 2026-10-25 |
| 2 | Vilka recept och kylskåpsfoton ska ingå i AI-testuppsättningen? Fem påhittade recept finns nu i `tests/fixtures/ai/` (kycklinggryta, ugnspannkaka, linssoppa, kladdkaka, fiskgratäng). | 10–20 recept från koket.se och tasteline.com tas fram av utvecklingen; Pontus bekräftar och bidrar med några egna kylskåpsfoton | PRD, 2026-10-25 |
| 3 | Molnleverantör för AI när appen ska användas av fler | Den billigaste som klarar testuppsättningen; avgörs senare | Brief |

## Tekniska osäkerheter (utredas under bygget)

| # | Osäkerhet | Hur den hanteras | Uppkom |
| --- | --- | --- | --- |
| T1 | ~~Klarar ica.se, arla.se och coop.se serverhämtning?~~ **Besvarad 2026-10-25** med `pnpm sites:probe` (appens `safeFetch` och `extractRecipePage`): **ica.se fungerar** (två recept, sidorna hämtas och har JSON-LD Recipe; Qwen tolkar dem), **arla.se fungerar** (två recept, samma resultat), **coop.se saknar receptdata** (sidan hämtas men receptet byggs i webbläsaren, så HTML:en har varken JSON-LD eller recepttext). ica.se och arla.se ligger nu i `ensure_user_defaults()` (migrationen `*_settings_more_recipe_sites.sql`); coop.se gör det inte. Kvar: Qwen behövde 40–56 s för ett fullt recept från ica.se, arla.se och koket.se, nära eller över AI-portens 45 s per försök (se T4). | Ingen åtgärd för sajterna; coop.se kan klistras in som text | Brief, Story 1.8 |
| T4 | ~~Riktiga receptsidor tar ofta längre än 45 s att tolka för Qwen.~~ **Beslutat 2026-10-25 (Claude, går att ändra):** gränsen per försök höjs till 100 s inom 115 s totalt (AD-9). Ett nytt försök görs bara om tiden räcker. | Om tolkningen ändå känns för långsam: kortare svar (t.ex. utan katalogförslag för rader som redan matchar) eller en snabbare modell | Story 1.8 |
| T2 | Hur stabilt fyller Claude in Chrome varukorgen på ICA Handla? | Pontus testar efter Epic 7 | Brief |
| T3 | ~~Klarar Qwen3.6-35B-A3B i LM Studio både bild och JSON-schema, och stängs tänkläget av?~~ **Besvarad 2026-10-25:** ja. Röktestet ger 5 av 6: text, bild, JSON-LD och strikt JSON-schema fungerar, och försök att smuggla in instruktioner ignoreras. Tänkläget stängs av med `reasoning_effort: "none"`. Kvar: Qwen uppskattar en total tid när receptet saknar sådan. | Ingen åtgärd; tiden visas bara som information | Arkitektur, Story 1.4 |

## Checklista för Pontus (när molnet sätts upp, efter Epic 1–3)

- Skapa Vercel-projektet `matkoll` (region `arn1`) och Supabase-projektet `matkoll` (region `eu-north-1`), och lägg in miljövariablerna enligt `.env.example`.
- I Supabase: stäng av registrering, sätt Site URL och redirect-URL, lägg in e-postmallen för engångslänken, och överväg egen SMTP (Supabase inbyggda e-post har låg gräns).
- Kör `pnpm users:sync` mot molnet så att din e-post finns som användare.
- Lägg in hemligheten för säkerhetskopians lösenfras i GitHub.
- Sätt upp Cloudflare Tunnel och Access (kräver domän) och lägg in tokenvariablerna.
- Godkänn första publiceringen i produktion.

## Att prova på riktig telefon (när Pontus har tid)

Saker som testerna inte kan visa och som behöver en riktig iPhone:

- Svep vänster på en lagervara i Hemma: knappen "Ta bort" ska visas utan att Safari går bakåt. Prova att svepa nära skärmkanten och mitt på raden.
- VoiceOver på en lagervara: knappen "Ta bort Mjölk" ska gå att nå och aktivera, och raden ska inte öppna arket i stället.
- Fotoimport av ett recept med kameran (Story 1.9) och engångslänken i Mail-appen (Story 1.2).
