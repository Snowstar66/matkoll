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
| T1 | Klarar ica.se, arla.se och coop.se serverhämtning? | Testas tidigt i Epic 1; läggs till som godkända receptsajter bara om importen fungerar | Brief |
| T2 | Hur stabilt fyller Claude in Chrome varukorgen på ICA Handla? | Pontus testar efter Epic 7 | Brief |
| T3 | Klarar Qwen3.6-35B-A3B i LM Studio både bild och JSON-schema, och stängs tänkläget av? | `pnpm eval:ai` mot LM Studio när servern är igång (`lms server start`); måste vara gjort innan Epic 1 räknas som klar | Arkitektur, Story 1.4 |

## Checklista för Pontus (när molnet sätts upp, efter Epic 1–3)

- Skapa Vercel-projektet `matkoll` (region `arn1`) och Supabase-projektet `matkoll` (region `eu-north-1`), och lägg in miljövariablerna enligt `.env.example`.
- I Supabase: stäng av registrering, sätt Site URL och redirect-URL, lägg in e-postmallen för engångslänken, och överväg egen SMTP (Supabase inbyggda e-post har låg gräns).
- Kör `pnpm users:sync` mot molnet så att din e-post finns som användare.
- Lägg in hemligheten för säkerhetskopians lösenfras i GitHub.
- Sätt upp Cloudflare Tunnel och Access (kräver domän) och lägg in tokenvariablerna.
- Godkänn första publiceringen i produktion.
