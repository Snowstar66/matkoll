---
title: 'Story 13.1: Soptunna med smart kontrollfråga'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: 'origin/epic/13-ta-bort-och-planera'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "Jag vill kunna ta bort från inköpslista. En liten soptunna skulle vara bra att ha. När jag tryckt på soptunnan vill jag ha en kontrollfråga. Om jag inom kort trycker på en ny soptunna vill jag inte ha kontrollfrågor för det visar ett användarbeteende att jag vet vad jag gör. När man inte tryckt på en soptunna på ett tag så vill jag igen ha kontrollfrågan." Borttagningen fanns redan men var bara nåbar med svep åt vänster (och Tab), så den hittades inte.

**Approach:**
- En delad hook `useConfirmDelete` (`src/components/confirm-delete.tsx`) med en dialog (`Sheet`, `initialFocus="close"`: fokusfälla, Esc, "Avbryt"). Första borttagningen frågar "Ta bort <namn> från inköpslistan?"; efter en bekräftad borttagning gäller `deleteGraceMs` (60 s) då varje soptunna tar bort direkt, och varje borttagning startar om tiden. "Avbryt" startar ingen tid. Tiden ligger i minnet (modulnivå), delad av alla listor, och nollas vid omladdning.
- Inköpslistan: varje rad får en `TrashButton` (44 px, "Ta bort <vara>") till höger om produktbrickan. Egen vara tas bort, receptrad döljs för veckan (befintlig `removal.remove`), med befintlig "Ångra".
- Lagersaldot (tillagt av Pontus under bygget): samma hook och samma minut, "Ta bort <vara> från lagret?" med "Du kan ångra direkt efteråt."; "Ångra" och dubbeltrycksskyddet i `TrashButton` oförändrade.

## Boundaries & Constraints

**Always:** Svepet och dess dolda knapp finns kvar, men heter nu "Svep bort <vara>" så att soptunnan äger namnet "Ta bort <vara>". Inga osynliga tecken annat än som `\u`-escapes.

**Never:** Migration, nätverksanrop, `supabase db reset`.

## Acceptance Criteria (utöver epics.md, Story 13.1)

- Lagersaldot: en soptunna på en rad ger samma kontrollfråga och samma minut som på inköpslistan (en borttagning i ena räknas i andra), och "Ångra" finns kvar efter borttagningen.

</frozen-after-approval>

## Code Map

- `src/components/confirm-delete.tsx` (+ test): `useConfirmDelete()` -> `{ requestDelete({ question, onConfirm, detail?, confirmLabel? }), dialog }`; `deleteGraceMs`, `isDeleteGraceActive`, `startDeleteGrace`, `resetDeleteGrace`. Återanvänds av 13.2 och 13.3.
- `src/features/shopping/ui/shopping-list.tsx`: `ShoppingLineRow` får `onTrash`; dialogen renderas i listan.
- `src/features/pantry/ui/pantry-list.tsx`: `askToRemove` före `removeWithBin`.

## Vid bygget

- Soptunnan är grå med hairline vid hover/fokus (befintliga `TrashButton`, DESIGN.md "aldrig röd"); ingen danger-token finns. Avvikelse från "danger-färg vid hover".
- Tonen på svepknappen ändrades (`Svep bort`), och 14 befintliga tester följde med. Ingen annan testbyte.
- Pantry-tester startar tidsfönstret i `beforeEach`; e2e `pantry.spec` och `pantry-look.spec` svarar "Ta bort" i dialogen via `pressBin`.
- Playwright-klockan (`page.clock`) används i nytt e2e-test i `shopping.spec.ts`: fråga, ingen fråga inom fönstret, fråga igen efter 61 s.

## Review Triage Log

Ingen separat granskning (liten story). Självgranskning mot kriterierna: soptunna 44 px med namn (e2e mäter), fråga första gången, ingen fråga inom minuten och omräkning, receptrad döljs / egen vara tas bort (befintlig logik), lagersaldot delar fönstret. Ingen migration.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e `shopping`, `shopping-look`, `pantry`, `pantry-look`, `pantry-inventory`.
