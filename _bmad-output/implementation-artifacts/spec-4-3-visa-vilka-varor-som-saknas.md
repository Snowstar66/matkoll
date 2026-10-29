---
title: 'Story 4.3: Visa vilka varor som saknas'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '288dd20'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus om receptvyn: "jag skulle vilja veta vilken vara det är som saknas". Chippen sa bara "Saknar 1 vara" och "13 av 14 hemma".

**Approach:** Chippen nämner varorna: "Saknar: tryffelolja", vid fler än två "Saknar: tryffelolja, persilja +1" (katalognamn, gemener). Ett tryck rullar mjukt till ingredienserna och fokuserar första saknade raden. Saknade rader får ett lugnt "Saknas". Receptkortets märke behåller "Saknar N varor" men listar varorna i tillgängligt namn och title.

## Boundaries & Constraints

**Always:** "X av Y hemma" kvar, portionsskalning styr vad som saknas (samma faktor som raderna), mörkt läge, 375 px utan sidled, tryckytor minst 44 px.

**Never:** Ingen migrering, inget nätverk.

</frozen-after-approval>

## Design

- **Domän:** `recipeStatus` ger även `missingIngredientIds` (i radernas ordning); `missingNamesText(names)` ger "Saknar: a, b +N" (högst två namn, gemener). `withStatus` tar valfria namn och ger `missingNames` per bibliotekskort; `missingIngredientIds(rows, snapshot)` ger id:n att slå upp.
- **Server:** `data/missing-names.ts` läser namnen med `catalog.getIngredientNames` bara för saknade id:n (bibliotek, sök).
- **Vy:** `MissingChip` (knapp, `min-h-tap`) i `recipe-body.tsx`; `scrollIntoView` (auto vid reducerad rörelse) och `focus({preventScroll})` på radens `anchorId`. Stegläget repeterar raderna och ger dem inget id.
- **Rad:** "Saknas" (`text-meta text-ink-2`, `aria-hidden`; ringen säger redan "saknas" till skärmläsare) under namnet; fanns inget sådant märke i text förut, bara ringen och belopp i `sky-ink`.
- **Kort:** `RecipeStatusBadge` har synlig kort text, `sr-only` med namnen efter och `title`.
- **Tester:** enhet för texten, vyn (chip, fokus, "Saknas", portioner), kortet, listan och söken; e2e (`pantry-status`, `recipe`, `site-status`, `recipe-servings`) uppdaterade.

## Review Triage Log

Ingen separat granskning (liten story). Egen genomgång: en rad utan katalognamn nämns inte i chippen men räknas (faller tillbaka på "Saknar N varor" om inget namn finns); rad-id sätts bara i receptvyn så stegläget inte får dubbla id; vaga rader får "Saknas" men räknas inte i N, som ringen. lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e (`recipe`, `recipes-look`, `pantry-status`, `site-status`, `recipe-servings`, `cook-mode`) gröna.
