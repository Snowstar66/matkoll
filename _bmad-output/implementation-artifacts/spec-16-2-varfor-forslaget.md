---
title: 'Story 16.2: Förslaget säger varför det är bra'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5076590'
---

## Intent

**Problem:** Pontus: "Som t ex 3 ingredienser kommer från veckans vara, 1 har du i kylen och du behöver bara köpa till potatis." AI-förslagskortet visade tre skilda rader ("Med: …", "På erbjudande: …", "0 av 5 hemma") som inte svarar på vad förslaget ger honom.

**Approach:** En ren, enhetstestad funktion bygger en rad, och kortet visar den i stället för "På erbjudande" och "x av y hemma".

## Ändringar

- `src/features/suggestions/domain/offer-input.ts`: `whyText` ("3 på erbjudande · 1 hemma · köp till: potatis"; högst tre namn, resten "+2"; noll utelämnas; "allt hemma eller på erbjudande" när inget ska köpas), `toBuyNames` (rader som varken finns hemma eller täcks av ett erbjudande) och `isTrivialStaple`.
- Servern (`suggest-from-pantry.ts`, `suggestions.ts`) skickar `toBuy` per förslag (tom för lagerförslag).
- `ai-suggestions.tsx`: raden `ai-suggestion-why`, därunder "Erbjudanden: Falukorv, Ketchup" med namn rensade av `offerDisplay` (utan ICA/KRAV/land; exporteras nu från offers). "Med:" visar högst fyra namn (förut fem).
- Enhetstester för funktionerna, e2e `offer-suggestions` anpassad.

## Beslut

- Triviala basvaror lämnas ur "köp till" med en liten uttrycklig lista (salt, peppar, svartpeppar, vatten, olja, matolja, rapsolja, socker), jämförd normaliserad. Katalogen har ingen basvarumarkering att luta sig mot.
- Receptkorten i biblioteket visar inga erbjudanden i dag (inget erbjudandefilter finns), så de lämnas orörda. `whyText` är fristående och kan återanvändas när de får det (Story 16.3).
- Spara- och förhandsgranskningsflödet och receptsidan är orörda. Ingen migration, inget nätverk.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Ett tidigt e2e-fel visade att när allt är hemma eller på erbjudande står bara "allt hemma eller på erbjudande" (inga siffror), enligt designen; testet rättades, inte koden.
- Raden är vanlig text i ett `<p>` och läses naturligt; inga effekter tillkom, så Strict Mode påverkas inte.
- lint, typecheck, 5156 enhetstester, `AI_PROVIDER=mock pnpm build` och e2e `offer-suggestions`, `ai-suggestions`, `recipes-look` gröna.
