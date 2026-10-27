---
title: 'Kursändring: senaste fotot per plats (Epic 10)'
date: 2026-10-26
status: godkänd (headless enligt docs/autonomi.md)
trigger: docs/backlog-efter-1-0.md, avsnittet "Spara senaste fotot per plats", och Pontus val "Båda" (2026-10-26)
scope: Moderate
branch: epic/10-spara-foto
---

# Kursändring: senaste fotot per plats (Epic 10)

Läge: batch och headless. Pontus har beslutat att det senaste fotot av varje plats ska sparas, och att det görs efter Epic 8. Alla val i det här förslaget går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Efter Story 6.5 bad Pontus att det analyserade fotot skulle sparas: "då får vi enklare att se om den tolkat rätt". Pontus fick två alternativ och valde "Båda":

- **En snabbfix direkt (klar):** fotot visas ovanför lagerförslagen medan Pontus granskar dem, bara i webbläsarens minne. AD-15 gällde som förut. Story 6.6 lade sedan till numren på fotot.
- **En story efter Epic 8 (den här kursändringen):** det senaste fotot av varje plats (Kyl, Frys och Skafferi, per ställe) sparas privat och kan visas senare. Då går det att se i efterhand om bilden tolkades rätt.

`docs/backlog-efter-1-0.md` säger vad kursändringen ska avgöra: ändringen av AD-15, lagringen (privat bucket i Supabase Storage med RLS), hur länge fotot sparas, att EXIF tas bort och vad som händer när ett ställe eller en plats töms eller tas bort.

### Typ av ändring

Ett nytt krav från Pontus. Det strider mot en uttrycklig regel i arkitekturen, AD-15 ("sparas aldrig"), så regeln måste ändras först. Inget som är byggt är fel.

### Underlag

Kontrollerat i koden och mot den lokala Supabase-stacken i OrbStack (Storage API 1.84.19), och mot Supabase dokumentation 2026-10-26:

- **Fotot i klienten:** `downscaleImage` (`src/lib/downscale-image.ts`) förminskar ett platsfoto till högst 2048 px och 1,5 MB. Ett foto kodas om via canvas till JPEG, vilket tar bort EXIF och GPS. En PNG som redan ryms skickas utan omkodning, med metadata-chunks borttagna (`stripPngMetadata`). `stripJpegMetadata` finns i `src/lib/images.ts` men används inte i appen.
- **Fotot under granskningen:** `usePantryAnalysis` håller den skickade bilden (`KeptPhoto`) som en objekt-URL (`ReviewPhoto`). `AnalyzedPhotoSheet` i `pantry/ui/analyzed-photo.tsx` visar den med markörer från `/api/ai/locate` (6.6). Avläsningen (`reading`, högst 25 etiketter) och punkterna (`positions`, `{ n, x, y }` i tusendelar) finns i klienten.
- **Storage lokalt:** `[storage] enabled = true` i `supabase/config.toml`. Inga buckets eller policyer finns. Rollen `postgres` kan skapa en bucket (`insert into storage.buckets`) och policyer på `storage.objects` i en migration (provat i en transaktion som rullades tillbaka).
- **Storage i CI:** `.github/workflows/ci.yml` startar Supabase med `-x … storage-api …`. Utan `storage-api` kan migrationen och testerna inte använda Storage, så CI måste ändras.
- **Radering:** Supabase stoppar `delete` i `storage.objects` och `storage.buckets` med SQL (`storage.protect_delete()`, felkod `42501`), och dokumentationen säger att en SQL-radering lämnar filen kvar. Filer måste tas bort med Storage-API:t. En kaskad i databasen tar alltså aldrig bort en fil.
- **Användare:** `storage.objects.owner` och `owner_id` har ingen främmande nyckel till `auth.users`. När en användare tas bort ligger filerna kvar. `pnpm users:sync --prune` tar bort användare med service role.
- **Överskrivning:** Supabase avråder från att skriva över en fil (`upsert`), eftersom en CDN-cache kan visa den gamla, och rekommenderar en ny sökväg per version.
- **Länkar:** en signerad URL går inte att återkalla före sitt slut. Det enda sättet att stoppa den är att ta bort filen.
- **Gratisnivån:** 1 GB fillagring, 5 GB trafik och högst 50 MB per fil. Ett projekt pausas efter en veckas inaktivitet (säkerhetskopian håller det aktivt, AD-23).
- **Säkerhetskopian:** `supabase db dump` tar inte med schemat `storage` (bucketen och policyerna), men datadumpen tar med rader i `storage.objects`. Filerna själva finns aldrig i en databasdump.
- **Server Actions:** tar emot högst 1 MB som standard (`serverActions.bodySizeLimit`, under `experimental` i next.config). Ett foto kan vara 1,5 MB.

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [x] | Snabbfixen efter 6.5 och Story 6.6: fotot syns under granskningen men försvinner sedan. |
| 1.2 | Problemformulering | [x] | Nytt krav: det senaste fotot av varje plats sparas privat och kan visas i efterhand. Kräver en ändring av AD-15. |
| 1.3 | Underlag | [x] | Avsnitt 1. |
| 2.1 | Pågående epic | [N/A] | Epic 8 är klar och ihopslagen. Epic 9 vilar. |
| 2.2 | Ändringar på epic-nivå | [x] | Ny Epic 10 med tre stories. |
| 2.3 | Kommande epics | [x] | Epic 9: fotot av ett reklamblad sparas fortfarande aldrig (AD-15). Epic 9:s AD-25 och tillägg i AD-15 behöver ingen ändring, men AD-15:s text skiljer sig mellan grenarna och slås ihop när Epic 9 tas upp igen. |
| 2.4 | Ogiltiga eller nya epics | [x] | Inga ogiltiga. En ny. |
| 2.5 | Ordning | [x] | Epic 10 före Epic 9, enligt Pontus beslut ("efter Epic 8, före 1.2"). |
| 3.1 | PRD | [!] | Nya krav FR-37–FR-39, NFR-11, motmåttet SM-C5 och UJ-8 i addendumet. FR-24, FR-25 och FR-29 får ändrade konsekvenser. Numren efter Epic 9:s (FR-34–FR-36, NFR-10, SM-C4, UJ-7). |
| 3.2 | Arkitektur | [!] | AD-15 ändras. Ny AD-26 (AD-25 hör till Epic 9). Tillägg i AD-2, AD-4, AD-18, AD-20 och AD-23. |
| 3.3 | UX | [!] | Raden "Senaste foto av kylen: idag 15:42" med "Visa", fotoarket med avläsningen och "Ta bort fotot", nya tillstånd och texter, Flöde 8 (Flöde 7 hör till Epic 9). UX-DR21–UX-DR22. |
| 3.4 | Andra artefakter | [!] | Migration, typer, RLS-tester för bucketen och tabellen, CI (`storage-api`), säkerhetskopian, `docs/drift.md`, `scripts/users-sync.mjs`, e2e-användare. Ingen ny miljövariabel. |
| 4.1 | Direkt justering | Gångbar | Ny epic inom den befintliga strukturen. Liten till medel insats, medel risk (privat data). |
| 4.2 | Återställning | Inte gångbar | Inget behöver göras om. |
| 4.3 | MVP-översyn | Inte gångbar | Lägger bara till. |
| 4.4 | Vald väg | [x] | Alternativ 1: direkt justering med en ny Epic 10. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1–5. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Headless: godkänt enligt grundregeln i `docs/autonomi.md`. Pontus beslutade själva tillägget, och allt går att ändra. Inget kräver Pontus konton eller hemligheter. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-10: backlog`, tre stories och `epic-10-retrospective: optional`. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–8:** inga ändringar i det som är byggt, utom det som Epic 10:s stories gör: sparandet efter den första bekräftelsen (6.2, 6.4), underrubriken i fotoarket (snabbfixen, 6.6) och borttagningen av ett ställe (8.2).
- **Epic 9 (vilar):** fotot av ett reklamblad sparas aldrig. När Epic 9 tas upp igen slås dess tillägg i AD-15 ihop med ändringen här.
- **Epic 10 (ny):** tre stories i ordning (avsnitt 4.4).

### 2.3 Påverkan på stories som redan är byggda

| Byggt i | Beteende nu | Med Epic 10 |
| --- | --- | --- |
| 6.1 | Fotot skickas till AI:n och sparas aldrig | Oförändrat vid analysen. Fotot sparas först efter den första bekräftelsen. |
| 6.2, 6.4 | Bekräfta, Rätta, "Bekräfta alla" och "Ta bort" skriver lagret | Den första lyckade skrivningen från ett foto sparar också fotot, i bakgrunden |
| Snabbfixen, 6.6 | Underrubriken "Jämför förslagen med fotot. Det sparas inte." | "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något." Arket återanvänds för det sparade fotot. |
| 6.3 | "Töm kylen" tar bort varorna | Oförändrat. Fotot står kvar. |
| 8.2 | Ett tomt ställe som inte är valt kan tas bort | Ställets foton tas bort samtidigt, rader och filer |
| 8.4 | Fotot binds till stället när det tas | Fotot sparas på det stället |

### 2.4 PRD

- **Ordlistan:** "Senaste foto" och "Avläsning".
- **Nya krav** (addendumet, "Tillägg till 1.1: Senaste fotot per plats"):
  - FR-37: spara senaste fotot per plats;
  - FR-38: visa senaste fotot i Hemma;
  - FR-39: fotot försvinner när det inte behövs (30 dagar, "Ta bort fotot", ställe och användare);
  - NFR-11: integritet för platsfoton.
- **Ändrade konsekvenser:** FR-24, FR-25 och FR-29.
- **Användarresa UJ-8:** "Vad läste den egentligen?".
- **Effektmål:** inget nytt. Nytt motmått, SM-C5 Fotoarkiv: aldrig mer än det senaste fotot per plats och aldrig längre än 30 dagar.
- **Utanför Epic 10:** historik, ny analys av ett sparat foto, att visa ett annat ställes foto utan att välja det, foton av kokbokssidor och reklamblad, och att dela eller ladda ner ett foto.
- `prd.md` §8.3 får en punkt som hänvisar till addendumet.

### 2.5 Arkitektur

- **AD-15 ändras:** ett undantag och bara ett. Det senaste fotot av en plats sparas när det har lett till en ändring i lagret, utan metadata, i en privat bucket, högst ett per plats och högst 30 dagar. Allt annat sparas fortfarande aldrig.
- **Ny AD-26, "Platsfoton":** ägarskap, bucket, sökvägar, policyer, tabellen, när och hur ett foto sparas, läsning, gallring och det som aldrig får hända. Hela texten står i spine:n.
- **Tillägg:**
  - AD-2: `POST /api/pantry/photo` är den enda Route Handler som skriver, med samma kontroller som en Server Action;
  - AD-4: policyer och RLS-test för en Storage-bucket;
  - AD-18: `revalidateFor('pantry_photo')` → `/hemma`;
  - AD-20: `pantry_photo` är `on delete cascade` mot `pantry_site`, och den som tar bort raden tar bort filen;
  - AD-23: CI startar `storage-api`, och säkerhetskopian tar aldrig med foton.
- **Modultabellen, datamodellen, källträdet, Capability Map och Deferred** är uppdaterade.

### 2.6 UX

- **Hemma:** raden "Senaste foto av kylen: idag 15:42" med textknappen "Visa", direkt under kameraknappen, när platsen på det ställe som visas har ett foto. Ingen miniatyr, så att Hemma inte hämtar fotot i onödan.
- **Fotoarket:** samma ark som under granskningen (6.6), med underrubriken "Taget idag 15:42. Numren visar vad AI:n läste av.", markörerna, listan "AI:n läste av:" och "Ta bort fotot" med kontrollfrågan "Ta bort fotot av kylen? Det går inte att ångra.".
- **Tillstånd och texter:** "Fotot finns inte längre.", "Fotot av kylen är borttaget.", "Det gick inte att ta bort fotot. Försök igen." och den nya underrubriken under granskningen.
- **Flöde 8:** "Läste den rätt?".
- DESIGN.md: inga nya tokens eller komponenter. Raden använder `{typography.meta}` och en textknapp, arket är Ark, och markörerna finns redan (6.6).

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migration (10.1):** bucketen `pantry-photo`, policyerna på `storage.objects`, tabellen `pantry_photo` med RLS och grants, och Postgres-funktionen `save_pantry_photo`. Typerna genereras om.
- **CI (10.1):** `storage-api` tas bort ur `SUPABASE_EXCLUDE` i `ci.yml`. Det gör `supabase start` lite långsammare, men det är det enda sättet att testa policyerna.
- **Route Handlers:** `POST /api/pantry/photo` (10.1) och `GET /api/pantry/photo/[id]` (10.2).
- **Server Actions:** `savePlacePhotoPoints` (10.1), `removePlacePhoto` (10.2) och `sweepPlacePhotos` (10.3).
- **Skript och drift (10.3):** `scripts/users-sync.mjs --prune` tar bort användarens filer först. `.github/workflows/backup.yml` utesluter `storage.objects` och `pantry_photo`, och `scripts/backup-counts.sql` räknar inte `pantry_photo`. `docs/drift.md` beskriver att bucketen och policyerna kommer tillbaka genom att fotomigrationen körs igen vid en återställning.
- **Ingen ny miljövariabel och ingen ändring av AI-porten.** `analyzeImage` och `locateItems` är oförändrade, och ett sparat foto når aldrig porten.
- **I molnet:** inget nytt för Pontus. Storage ingår i Supabase-projektet, och bucketen skapas av `supabase db push`.

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** en ny Epic 10 med tre små stories i ordning.

| Alternativ | Insats | Risk | Bedömning |
| --- | --- | --- | --- |
| 1. Ny Epic 10 med tre stories | Liten till medel | Medel (privata foton) | Vald |
| 1b. En enda story | Liten till medel | Medel | Inte vald. Lagring, visning och gallring är var för sig granskningsbara, och gallringen berör drift och skript. |
| 2. Återställning | – | – | Inte gångbar |
| 3. MVP-översyn | – | – | Inte gångbar |

### Beslut inom alternativ 1

| Fråga | Vald | Alternativ | Varför |
| --- | --- | --- | --- |
| När sparas fotot? | När den första skrivningen från fotots förslag har lyckats | Vid lyckad analys; när alla kort är hanterade | Syftet är att i efterhand kontrollera det som hamnade i lagret. Ett foto som bara avvisades har inte ändrat något, och Pontus såg redan felet under granskningen. Ett foto som avvisas ersätter inte heller det foto som lagret bygger på. Färre sparade foton av hemmet. "När alla kort är hanterade" sparar inget om Pontus går ifrån halvvägs. |
| Var ligger avläsningen och punkterna? | I tabellen `pantry_photo` | I objektets metadata (`user_metadata`) | Hemma läser tid, avläsning och punkter i en fråga utan Storage-anrop. Zod och AD-4:s RLS gäller som för resten av lagret. |
| Hur kommer bilden till servern? | Klienten skickar den igen till `POST /api/pantry/photo` | Servern sparar redan i `/api/ai/analyze`; en Server Action med högre gräns; uppladdning direkt till Storage med signerad uppladdnings-URL | Analysen sparar inget (AD-2) och vet inte om förslagen bekräftas. En Server Action tar högst 1 MB, och gränsen ändras bara under `experimental`. En direkt uppladdning går förbi serverns kontroll och rensning av metadata, och webbläsaren använder aldrig Supabase-klienten (AD-2). |
| Hur visas bilden? | Servern strömmar den efter inloggningskontroll, `Cache-Control: private, no-store` | Signerade URL:er med kort livstid | En signerad URL kan läcka (historik, skärmdump) och går inte att återkalla. Strömningen går genom samma RLS som allt annat. |
| Sökväg och ersättning | Ny sökväg per foto, `<user_id>/<site_id>/<plats>/<foto-id>.jpg` | En fast sökväg per plats med `upsert` | Supabase avråder från att skriva över. Den första mappen är användarens id, vilket policyerna kräver. |
| Metadata | Servern tar bort den med `stripJpegMetadata` eller `stripPngMetadata` före uppladdningen, och ett test låser det | Lita på klientens canvas | Servern kan inte lita på klienten, och en PNG skickas utan omkodning. Funktionerna finns redan. |
| Hur länge? | Högst 30 dagar, och bara det senaste per plats | Ingen gräns; 7 dagar; 90 dagar | Kontrollen görs dagarna efter fotot. 30 dagar räcker med marginal och begränsar vad som finns kvar om något läcker. Öppen fråga 12. |
| Hur gallras det? | När Hemma ser att något är för gammalt anropar den `sweepPlacePhotos`, och varje sparande gallrar | Ett schemalagt jobb (Vercel Cron eller GitHub Actions) med service role | Ett jobb behöver en ny nyckel i Vercel eller GitHub, och service role används aldrig i förfrågningar (AD-4). Ett gammalt foto visas aldrig, också om det ligger kvar tills Hemma öppnas. |
| "Töm kylen" | Fotot står kvar | Fotot tas bort | "Ångra" efter tömningen ger tillbaka varorna, och då hör fotot fortfarande till dem. Nästa foto ersätter det. Öppen fråga 13. |
| Ställe tas bort | Rader och filer tas bort | Ett ställe med foto kan inte tas bort | Ett tomt ställe ska gå att ta bort (FR-29). Fotot hör till stället. |
| Användare tas bort | `users:sync --prune` tar bort filerna först | Inget | Filerna har ingen främmande nyckel och skulle ligga kvar. |
| Säkerhetskopia | Inga foton och inga fotorader | Foton i säkerhetskopian | Säkerhetskopian ligger i GitHub i 90 dagar och laddas ner en gång i månaden. Foton går att ta om, och de gallras efter 30 dagar ändå. |
| Visning för ett annat ställe | Hemma visar fotona för det ställe som visas | Visning utan att byta ställe | Samma regel som för lagret (öppen fråga 6). AD-26 tillåter det senare. |

**Insats:** liten till medel. 10.1 är störst: migrationen, policyerna, CI och sparandet i klienten.
**Risk:** medel. Det är privata foton av Pontus hem. RLS-tester, rensning av metadata, ingen länk och ingen säkerhetskopia minskar risken. Ett fel i sparandet påverkar aldrig lagret.
**Tidsplan:** Epic 10 byggs direkt, story för story, i grenen `epic/10-spara-foto`.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Tillägg till 1.1: Senaste fotot per plats (Epic 10)"** med mål, UJ-8, ordlista, FR-37–FR-39, NFR-11, ändrade konsekvenser, SM-C5, vad som ligger utanför och datamodellen.
- `prd.md` §8.3: en ny punkt som hänvisar till addendumet.

**Exempel, FR-24:**

```
FÖRE (AD-15): … skickas till AI-tjänsten och sparas aldrig.
EFTER (addendum, ändrade konsekvenser): Fotot sparas inte vid analysen. Det sparas först när något från förslagen har sparats i lagret (FR-37).
```

Skäl: "då får vi enklare att se om den tolkat rätt" (Pontus, 2026-10-26).

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` omfattar Epic 10, `binds` får FR-37–FR-39 och NFR-11, och `sources` får den här kursändringen.
- Modultabellen: `pantry` äger också `pantry_photo` och bucketen `pantry-photo`.
- **AD-15 (ändrad):**

  ```
  FÖRE: … skickas till AI-tjänsten och sparas aldrig.
  EFTER: Ändrat (Epic 10, AD-26): ett undantag, och bara ett. Det senaste fotot av en plats sparas när det har lett till en ändring i lagret …
  ```

- **AD-26 (ny), Platsfoton.** En rad om att AD-25 är reserverad för Epic 9 står före den.
- Tillägg märkta "(Epic 10, AD-26)" i AD-2, AD-4, AD-18, AD-20 och AD-23.
- Källträdet, datamodellen (ER-diagrammet och tabellen), Capability Map och Deferred.
- `.memlog.md`: beslutet loggat med `memlog.py append`.

### 4.3 UX (`EXPERIENCE.md`)

- IA: raden Senaste foto och arket Fotot av kylen.
- Voice and Tone: foton i texter.
- Component Patterns: Senaste foto och Fotoark.
- State Patterns: sex nya tillstånd.
- Key Flows: Flöde 8, "Läste den rätt?".

### 4.4 Epics (`epics.md`)

Ny `## Epic 10: Senaste fotot per plats` med:

1. **Story 10.1: Spara senaste fotot per plats.** Bucketen, policyerna, tabellen, CI, rensningen av metadata och sparandet efter den första bekräftelsen.
2. **Story 10.2: Visa senaste fotot i Hemma.** Raden, fotoarket med markörer och avläsning, strömningen och "Ta bort fotot".
3. **Story 10.3: Gallring och städning av foton.** 30 dagar, filer utan rad, borttaget ställe, borttagen användare och säkerhetskopian.

Översikten, Requirements Inventory (FR37–FR39, NFR11, UX-DR21–UX-DR22), FR Coverage Map och Epic List är uppdaterade.

### 4.5 Sprintstatus

```yaml
  epic-10: backlog
  10-1-spara-senaste-fotot-per-plats: backlog
  10-2-visa-senaste-fotot-i-hemma: backlog
  10-3-gallring-och-städning-av-foton: backlog
  epic-10-retrospective: optional
```

### 4.6 Epic-kontext och spec-utkast

- `_bmad-output/implementation-artifacts/epic-10-context.md`, i samma form som `epic-8-context.md`.
- Spec-utkast med status `draft`: `spec-10-1-spara-senaste-fotot-per-plats.md`, `spec-10-2-visa-senaste-fotot-i-hemma.md` och `spec-10-3-gallring-och-stadning-av-foton.md`.

## 5. Överlämning

- **Omfattning:** Moderate. En ny epic, en ändrad AD och en ny, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 10.1 → 10.3, utan att fråga mellan storyna. Spec-utkasten färdigställs när storyn påbörjas.
- **Gren:** `epic/10-spara-foto`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten följer med i epic-grenen.
- **E2E-användare (en per spec):** `e2e-foto-spara@matkoll.test` (10.1), `e2e-foto-visa@matkoll.test` (10.2) och `e2e-foto-gallra@matkoll.test` (10.3).
- **Klart betyder:**
  - En bekräftelse från ett foto av stugans kyl sparar fotot, och ett nytt foto ersätter det, både rad och fil (integrationstest och e2e).
  - Ett avvisat foto sparas inte.
  - Den sparade filen saknar EXIF och GPS (test).
  - En annan användare och en anonym klient kan varken läsa, lista, ladda upp eller ta bort (RLS-test).
  - Hemma visar raden och fotot med markörer och avläsning, och "Ta bort fotot" tar bort rad och fil.
  - Ett foto som är äldre än 30 dagar visas inte och tas bort. Ett borttaget ställe och en borttagen användare lämnar inga filer.
  - Säkerhetskopian innehåller inga foton, och återställningen är provad lokalt.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs. Tre frågor till efter användning står i `docs/oppna-fragor.md` (11–13).
