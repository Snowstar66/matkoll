---
title: 'Story 11.2: Märke och tid på lagervaror'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-lagga-till-och-andra-lagervaror.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-stallen-i-lagret-med-hemma-som-forsta-stalle.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill inte se mängden i Lagersaldo, men gärna "mer info". Det mest användbara är märket ("Arla laktosfri") och när varan lades till. Märket finns på lagerförslagen från ett foto (6.5) men sparas aldrig, och "Ångra" ger i dag raden en ny `created_at`, så "Tillagd …" skulle bli fel efter en ångrad borttagning (FR-42).

**Approach:**
- En migration lägger till `pantry_item.label` och låter Postgres-funktionerna ta med `label` och behålla `created_at`.
- En bekräftelse eller rättning av ett förslag från ett foto sparar förslagets första etikett som märke.
- Arket Lagervara får fältet "Märke eller sort".
- `listPantry` ger `label`, `createdAt` och avdelningen, så att 11.3 kan visa raden under och kategorin.

## Boundaries & Constraints

**Always:**
- `label` är `null` eller 1–60 tecken utan inledande och avslutande blanksteg, låst med `check` och med samma regel i Zod (`pantryLabelSchema` i `pantry/domain`). Längre text avkortas till 60 tecken vid ett ord om det går, annars mitt i, med `…` borttaget före sparandet.
- `set_pantry_items` läser `label` per vara: saknad nyckel lämnar märket, `null` tar bort det och en text sätter det.
- När `set_pantry_items` ersätter en rad (`replace_id`, ny enhet eller plats) får den nya raden den ersattas `created_at`, och dess `label` när varan saknar `label`.
- En ändrad mängd på samma rad (`on conflict … do update`) ändrar varken `created_at` eller `label` om inte `label` skickas.
- `confirmPantrySuggestions` och `confirmPantryInventory` skickar `labels[0]` (avkortad) för ett förslag som har etiketter, både vid Bekräfta, "Bekräfta alla" och arkets "Bekräfta" efter Rätta. Rätta förifyller fältet med etiketten.
- `add_to_pantry` ("Lägg i lagret") ändrar aldrig `label`, och en ny rad får `null`.
- `restore_pantry_item`, `restore_pantry_items` och `restore_pantry_removal` sätter tillbaka `created_at` och `label`. `pantry_removal.removed_rows` sparar dem. En `created_at` i framtiden blir `now()`. En gammal post utan fälten ger `now()` och `null`.
- Migrationen är bakåtkompatibel med koden före storyn (AD-5): ingen ny obligatorisk parameter, och en anropare som inte skickar `label` får samma beteende som förut.
- Fältet "Märke eller sort" i arket är valfritt, har platshållaren "Till exempel Arla laktosfri", `maxLength` 60 och minst 16 px text.
- Märket är text från Pontus eller modellen och visas bara som text.
- E2E-specen har den egna e2e-användaren `e2e-utseende-marke@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen ändring av den unika nyckeln, RLS eller grants utöver det migrationen kräver.
- Inget märke från produktvalet eller "Lägg i lagret" (utanför Epic 11).
- Ingen ny tabell, ingen `updated_at` och ingen ändring av AI-porten eller promptarna.
- Lagersaldos lista ändras inte i den här storyn, utom att arket har det nya fältet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrationen | 94 rader i `pantry_item` | Samma rader, id, mängder och `created_at`. `label` är `null` överallt | N/A |
| Bekräfta från foto | Förslag Mellanmjölk med `labels: ["Arla Mellanmjölk laktosfri 1,5 l"]` | Ny rad med `label` "Arla Mellanmjölk laktosfri 1,5 l" | N/A |
| Lång etikett | 120 tecken | Avkortad till högst 60 tecken | N/A |
| Utan etiketter | Förslag utan `labels` | Raden får inget märke, eller behåller sitt | N/A |
| Rätta | Rätta förslaget, ändra märket till "Arla" i arket, Bekräfta | `label` "Arla" | N/A |
| Ändra mängd | Gräddfil tillagd för 6 dagar sedan, mängd 2 → 1 | `created_at` oförändrad, `label` oförändrat | N/A |
| Byt enhet | Mjöl 1 kg → 10 dl | Ny rad med samma `created_at` och samma märke | N/A |
| Byt plats | Smör från Kyl till Frys | Ny rad med samma `created_at` och samma märke | N/A |
| Töm fältet | Märket "Arla" tas bort i arket | `label` `null` | N/A |
| Bara blanksteg | "   " i fältet | Sparas som `null` | N/A |
| För långt i arket | 61 tecken (förbi `maxLength` via script) | Inget sparas | `validation` |
| Ångra en borttagning | Ta bort Gräddfil, "Ångra" | Samma id, mängd, märke och `created_at` | `pantry_restore_failed` som förut |
| Ångra "Töm kylen" | 14 varor med märken och olika tider | Alla tillbaka med sina märken och tider | N/A |
| Ångra inventering | "Ta bort" i "Syns inte längre", sedan "Ångra" | Raden tillbaka med märke och tid | N/A |
| Gammal borttagning | En `pantry_removal` från före migrationen | Raderna tillbaka med `now()` och `null` | N/A |
| Förfalskad tid | `restore_pantry_item` med `created_at` om en timme | `now()` | N/A |
| Lägg i lagret | Mjölk finns med märket "Arla", 1 l läggs i lagret | Mängden ökar, märket står kvar | N/A |
| Annan användare | Läser eller skriver en annans `label` | Nekas | RLS-test |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md` -- datamodellen och funktionerna
- `supabase/migrations/` -- de senaste versionerna av `set_pantry_items`, `apply_pantry_inventory`, `restore_pantry_item`, `restore_pantry_items`, `restore_pantry_removal`, `empty_pantry_place` och `pantry_removal` (8.1, 8.4)
- `scripts/pantry-site-check.sql` -- före- och efterkontroll av lagret
- `src/features/pantry/domain/pantry-item.ts` (`PantryItem`), `pantry-item-form.ts`, `pantry-suggestion.ts` (`labels`, `maxSuggestionLabelChars`), `place-inventory.ts`
- `src/features/pantry/data/queries.ts` (`listPantryIn`), `data/` för skrivningarna
- `src/features/pantry/actions/set-pantry-item.ts`, `confirm-pantry-suggestions.ts`, `confirm-pantry-inventory.ts`, `commit-confirmations.ts`, `remove-pantry-item.ts`, `restore-pantry-item.ts`, `restore-pantry-removal.ts`, `empty-pantry-place.ts`
- `src/features/pantry/ui/pantry-item-sheet.tsx` -- arket Lagervara
- `src/features/catalog` -- avdelningen per ingrediens till `listPantry`
- `tests/integration/` -- mönster för pantry och RLS
- `tests/e2e/support.ts`, `global-setup.ts`

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_pantry_label.sql` (via `supabase migration new`) -- kolumnen med `check`, nya versioner av funktionerna enligt Boundaries, med samma signaturer, `security invoker`, `pantry_lock()` och grants som förut. Provas först i en transaktion som rullas tillbaka. Säkerhetskopia av data och `scripts/pantry-site-check.sql` före och efter. Sedan `pnpm db:types` -- AD-5, AD-19, AD-20
- [ ] `tests/design/pantry-checks.test.ts` -- låser 60 mot domänens `maxPantryLabelLength`
- [ ] `src/features/pantry/domain/pantry-item.ts`, `pantry-item-form.ts` (+ tester) -- `label` och `createdAt` på `PantryItem`, `pantryLabelSchema`, `toPantryLabel(raw)` (trim, tom blir `null`, avkortning) -- FR-42
- [ ] `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `suggestionLabel(suggestion)`: `toPantryLabel(labels?.[0])`
- [ ] `src/features/pantry/data/queries.ts` (+ test) -- `listPantryIn` ger `label`, `createdAt` och `section` (via catalog, utan att läsa `ingredient` direkt, AD-1)
- [ ] `src/features/pantry/actions/*` (+ tester) -- `setPantryItem` tar `label`, bekräftelserna skickar `suggestionLabel`, borttagningen och "Ångra" bär `label` och `createdAt` -- FR-42
- [ ] `src/features/pantry/ui/pantry-item-sheet.tsx` (+ test) -- fältet "Märke eller sort", förifyllt vid Rätta och för en befintlig vara
- [ ] `tests/integration/pantry-label.test.ts` -- matrisens rader mot lokal Supabase, med RLS för en annan användare
- [ ] `tests/e2e/pantry-label.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-marke@matkoll.test`, `AI_PROVIDER=mock`, `kyl.png`: bekräfta ett förslag och se märket i arket, ändra och töm märket, ta bort och ångra med samma märke
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given migrationen lokalt, when `scripts/pantry-site-check.sql` körs före och efter, then är `diff` tom.

## Implementation Notes

- **Beslut (förslag): märket i en kolumn på `pantry_item`,** inte i en egen tabell. Det hör till raden, följer med vid ersättning och "Ångra", och RLS gäller redan.
- **Beslut (förslag): förslagets första etikett,** som är kortets rubrik i 6.5. Den kan innehålla storlek ("1,5 l"), vilket också är användbart.
- **Beslut (förslag): `created_at` får betyda "tillagd"** i stället för en ny `updated_at`. En ändrad mängd är inte en ny vara.
- **Risk: funktionerna har många versioner.** Utgå från den senaste definitionen av varje funktion (`grep -n "create or replace function public.<namn>"` i `supabase/migrations/`), och låt `pantry-checks.test.ts` låsa värdena.
- **Risk: mockens förslag saknar etiketter.** Kontrollera `src/server/ai/test-support.ts` och mockens svar för `kyl.png`. Saknas etiketter läggs de till i mocken, inte i appen.
- Loggar innehåller aldrig märket.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen, bekräfta Mellanmjölk och öppna varan. Fältet "Märke eller sort" ska ha etiketten från fotot.
- VoiceOver: fältet läses "Märke eller sort, textfält".
