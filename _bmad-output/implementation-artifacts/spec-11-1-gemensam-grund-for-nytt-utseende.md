---
title: 'Story 11.1: Gemensam grund för nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matkoll-mobil.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagersaldo.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/inkopslista.html'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-app-skal-navigering-och-designtokens.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att appen ser proffsigare ut, med varorna i kategorier med ikon (FR-40). Lagersaldo, Inköpslista, Recept och Matsedel ska byggas om i 11.3–11.5, och de behöver samma kategorier, samma tokens och samma byggstenar, så att allt ser likadant ut.

**Approach:**
- `catalog/domain/categories.ts` räknar fram kategorin ur avdelningen och namnet (AD-12). Ingenting sparas.
- Nya tokens i `globals.css` enligt `DESIGN.md`: plattornas färger, måtten och `overlay`.
- Nya byggstenar i `src/components/`: Kategorirubrik, Listgrupp, Listrad, Soptunna och Mätare.
- Flikfältet och sidomenyn får en kundvagn för Inköpslista och ett kylskåp för Lagersaldo.

## Boundaries & Constraints

**Always:**
- `displayCategory(section, name)` är en ren funktion och den enda regeln för kategorin. `CATEGORIES` har ordningen Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt.
- Såser & smaksättare gäller bara varor i Skafferi. Namnet normaliseras med `normalizeIngredientText`. Det träffar när hela namnet är ett ord i `SAUCE_WORDS`, eller när namnets sista ord slutar på ett av dem.
- En okänd avdelning ger Övrigt, som `toSection`.
- Ikonen och plattans färg per kategori väljs bara i `category-header.tsx`. Ikonen är emoji med `aria-hidden="true"`, och plattan har ingen text för skärmläsare.
- Kategorirubriken är ett `h2` med namnet. Antalet står som text och läses som "3 varor" (`aria-label` på antalet eller dold text), och 1 ger "1 vara".
- Listraden är minst 56 px hög. Raden under har en rad med "…" när den inte får plats, men hela texten finns för skärmläsare.
- Soptunnan är en `button` med tryckytan 44 × 44 px, en linjeikon i `ink-3`, `aria-label` från anroparen ("Ta bort Gräddfil"), synlig fokusram och `hairline` vid tryck och hovring.
- Mätaren tar ett värde 0–1, har `aria-hidden="true"` och två höjder (`meter-height`, `meter-height-small`).
- Tokens finns bara i `globals.css`, i ljust och mörkt läge, och mappas med `@theme inline` (AD-17). `tests/design/tokens.ts` och `contrast.test.ts` uppdateras.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text.

**Never:**
- Ingen migration och ingen ändring av `SECTIONS`, AI-scheman, promptar, exporten eller listans nycklar.
- Inget hex utanför `globals.css`, inget rött, inga skuggor och inga gradienter.
- Emoji aldrig i texter, i `errors.ts` eller i flikfältet.
- Inga ändringar av hur Lagersaldo, Inköpslista, Recept och Matsedel ser ut, utom flikfältets ikoner. Vyerna byggs om i 11.3–11.5.
- Inget komponentbibliotek och inget ikonpaket.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grönsak | `("Frukt och grönt", "Gurka")` | Frukt & grönt | N/A |
| Ost | `("Mejeri", "Ost")` | Mejeri & ägg | N/A |
| Chark | `("Chark", "Falukorv")` | Kött, fisk & chark | N/A |
| Fisk | `("Kött och fisk", "Lax")` | Kött, fisk & chark | N/A |
| Sås | `("Skafferi", "Sojasås")`, `("Skafferi", "Steaksås")` | Såser & smaksättare | N/A |
| Senap | `("Skafferi", "Dijonsenap")`, `("Skafferi", "Senap")` | Såser & smaksättare | N/A |
| Krydda | `("Skafferi", "Svartpeppar")`, `("Skafferi", "Flingsalt")`, `("Skafferi", "Spiskummin")` | Såser & smaksättare | N/A |
| Inte en sås | `("Skafferi", "Krossade tomater")`, `("Skafferi", "Saltgurka")`, `("Skafferi", "Pasta")` | Skafferi | N/A |
| Sås i kylen | `("Mejeri", "Bearnaisesås")` | Mejeri & ägg (bara Skafferi delas) | N/A |
| Okänd avdelning | `("Konserver", "Majs")`, `(null, "x")` | Skafferi via `toSection`, Övrigt för `null` | N/A |
| Stor bokstav och mellanslag | `("Skafferi", "  SOJASÅS ")` | Såser & smaksättare | N/A |
| Rubrik | `CategoryHeader` med Mejeri & ägg och 3 | 🥛 i ljusblå platta, "MEJERI & ÄGG", "3". VoiceOver: "Mejeri & ägg, rubrik nivå 2", "3 varor" | N/A |
| En vara | Antal 1 | "1 vara" för skärmläsare | N/A |
| Soptunna | `TrashButton` med `label="Ta bort Gräddfil"` | Knapp 44 × 44 px, namnet "Ta bort Gräddfil" | N/A |
| Mätare | `Meter value={0.43}` | 43 % fylld, dold för skärmläsare. Värden under 0 eller över 1 kläms | N/A |
| Mörkt läge | `prefers-color-scheme: dark` | Plattorna har sina mörka värden, texten `ink-2` på `bg` | N/A |
| 200 % text | Listrad med långt namn och lång rad under | Namnet radbryts, raden under får "…", ingen vågrät scroll | N/A |
| Flikfältet | Mobil, Inköpslista aktiv | Kundvagn i accent, `aria-current="page"` | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md` -- kategorierna, ikonerna, tokens och tester
- `mockups/lagersaldo.html`, `mockups/inkopslista.html` -- rubriken, listgruppen, raden och soptunnan
- `src/features/catalog/domain/sections.ts` (`SECTIONS`, `toSection`), `normalize.ts` (`normalizeIngredientText`), `index.ts`
- `src/app/globals.css` -- tokens (AD-17)
- `tests/design/tokens.ts`, `contrast.test.ts`, `no-hex.test.ts`
- `src/components/icons.tsx` -- linjeikonerna (`ListIcon`, `HomeIcon`, `FridgeIcon`)
- `src/components/app-shell/destinations.ts`, `tab-bar.tsx`, `side-menu.tsx`
- `src/components/check-circle.tsx`, `badges.tsx`, `search-field.tsx` -- mönster för små byggstenar
- `src/components/README.md` -- listan över byggstenar

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/catalog/domain/categories.ts` (+ test) -- `CATEGORIES`, `Category`, `categorySchema`, `SAUCE_WORDS`, `displayCategory(section, name)` och `compareCategories(a, b)` (ordningen). Exporteras från `catalog/index.ts`. Testet är en tabell med minst 40 namn, bland dem varje ord i `SAUCE_WORDS` och fallgroparna i matrisen -- FR-40, AD-12
- [ ] `src/app/globals.css`, `tests/design/tokens.ts`, `tests/design/contrast.test.ts` -- `--tile-clay`, `--tile-lilac` (ljus och mörk), `--overlay`, `--tile-size`, `--row-min`, `--card-image`, `--dish-thumb`, `--meter-height`, `--meter-height-small`, mappade i `@theme inline`. Kontrasttestet tar med `ink-2` på `bg` för rubriken och `sky-ink` på `sky` för produktetiketten (11.4) -- AD-17, UX-DR23
- [ ] `src/components/category-header.tsx` (+ test) -- `CategoryHeader({ category, count, id? })`: plattan, ikonen, `h2` och antalet enligt matrisen. Kartan kategori → ikon och platta ligger här -- UX-DR23
- [ ] `src/components/list-group.tsx`, `list-row.tsx` (+ test) -- `ListGroup` (vitt kort, `rounded-lg`, avdelare i `hairline`) och `ListRow({ title, meta?, leading?, trailing?, onPress? | href? })` med raden under på en rad och hela texten för skärmläsare -- UX-DR24, UX-DR25
- [ ] `src/components/trash-button.tsx` (+ test) -- `TrashButton({ label, onPress, disabled? })` och en ny `TrashIcon` i `icons.tsx` -- UX-DR24
- [ ] `src/components/meter.tsx` (+ test) -- `Meter({ value, size: 'default' | 'small' })` -- UX-DR25, UX-DR26
- [ ] `src/components/icons.tsx`, `app-shell/destinations.ts` (+ test) -- `CartIcon` för Inköpslista och `FridgeIcon` (finns) för Lagersaldo. Etiketterna är de som 10.4 satte
- [ ] `src/components/README.md` -- de nya byggstenarna
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given byggstenarna i en tillfällig testsida eller i komponenttesterna, when de renderas vid 375 px i ljust och mörkt läge, then liknar de skisserna (skärmbilder utanför repot, jämförda i granskningen).

## Implementation Notes

- **Beslut (förslag): kategorin räknas fram och sparas inte.** En ny avdelning skulle kräva en migration, nya `check`, tre promptar, aliasen, omklassning av befintliga varor och en ny AI-utvärdering. Regeln gäller direkt för alla varor, och ett fel syns bara som fel rubrik. Öppen fråga 14.
- **Beslut (förslag): `SAUCE_WORDS` matchar hela namnet eller slutet på det sista ordet,** inte var som helst i namnet, så att "saltgurka" och "pepparkakor" inte blir smaksättare. Listan är en konstant med tabelltest och kan växa.
- **Beslut (förslag): emoji i plattorna, linjeikoner i flikfältet.** Skisserna har emoji, och Pontus godkände dem. Flikfältet har redan linjeikoner som passar sidomenyn på dator. Kartan i `category-header.tsx` kan bytas mot SVG utan annan ändring (öppen fråga 15).
- **Beslut (förslag): tokens för de exakta värdena i skisserna där de stämmer med `DESIGN.md`.** Skissernas 13 px under raden blir `meta` (14 px), och plattans hörn blir `rounded-sm` (10 px).
- **Risk: emoji ser olika ut** på Windows och Android. Det påverkar inte Pontus iPhone och Mac. Plattan har fast storlek, så layouten håller.
- Läs `node_modules/next/dist/docs/` före kod som rör Next.js. `node_modules` finns i huvudmappen, inte i en worktree.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- VoiceOver i Safari på komponenterna: rubriken läses som rubrik nivå 2 med antalet, ikonen och mätaren hoppas över, soptunnan läses "Ta bort Gräddfil, knapp".
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: ingen vågrät scroll, och plattorna syns mot bakgrunden i båda lägena.
