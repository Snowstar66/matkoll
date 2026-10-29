---
title: 'Story 16.7: Varför veckans bästa butik'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** "Bäst denna vecka: Maxi, 1 erbjudande passar det du brukar laga" gör Pontus nyfiken på vilket erbjudande det är. Raden hade dessutom kvar en fylld röd butiksbricka.

**Approach:** Raden nämner erbjudandena, ett tryck filtrerar listan till dem, och varje passande rad får en diskret "Passar dig". Samma matchning överallt.

## Ändringar

- `best-store.ts`: en enda regel `fitSource` (hemma, i recept eller båda) driver poängen, `matches` (`{ id, name, source }`, namnet via `offerDisplay`) och `fittingOffers` (alla butiker). `bestStoreLine`: "falukorv och grädde passar dina recept"; tre namn "a, b och c"; fler "a, b, c +2". Utan namn gäller den gamla räknade texten.
- `list-offers.tsx`: `fitIds` räknas nu när något erbjudande finns (förut bara med två butiker); `best` som förut.
- `offers-sheet.tsx`: raden "Bäst denna vecka: ● Maxi – ..." med `StoreLabel` (pricken), en textknapp "Visa" / "Visa alla" (`aria-pressed`, 44 px) som filtrerar till träffarna (butiksetiketten döljs då). Den fyllda `StoreBadge` är borttagen, även i Hämta-panelen.
- `offers-list.tsx`: `fits` ger "Passar dig" (`text-ink-3`, ingen bakgrund) i metaraden efter butiken, och ", passar dig" i kryssrutans namn.

## Beslut

- Fras: alla hemma "passar det du har hemma"; alla i recept "passar dina recept"; blandat "passar det du brukar laga" (en enda kort fras, inte två).
- Ingen migration, inget nätverk, ingen AI.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Gamla e2e-kontrollen "3 erbjudanden passar..." ersatt av namnraden plus Visa/Visa alla.
- Det raderade `StoreBadge` hade två användare; båda använder nu `StoreLabel`.
- Dubbla namn (samma vara i flera rader) nämns en gång.
