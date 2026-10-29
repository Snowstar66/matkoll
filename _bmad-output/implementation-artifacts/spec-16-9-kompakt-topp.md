---
title: 'Story 16.9: Kompakt topp i erbjudandearket'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Toppen av erbjudandearket var otydlig, med för stora fyllda knappar och för blaffig. Listan började långt ned, varumärket stod kvar i "scan falukorv" och fokusringen dubblerades på valda pillrar.

**Approach:** En slimmad verktygsrad, kompakta pillrar, ett ramlöst AI-kort på högst tre rader och rena produktnamn.

## Ändringar

- `Button`: nya varianter `compact` (liten text, 44 px träffyta) och `compact-primary` (40 px synlig, 44 px träffyta). Textstorleken flyttad från basen till varianterna.
- `FilterPills`: `compact` (32 px, en rad, scroll i sidled). Fokusring bara med `:focus-visible` och på pillen, inte på träffytan (ingen dubbel ring); fokus flyttas bara av piltangenter.
- `offers-sheet.tsx`: "Hämta" och "Välj" som `compact`; raderna "Visa butik:" och "Sortera:" kompakta; bästa-butik-raden på en rad med "· Visa"/"Visa alla"; sammanfattningen "Visar N av M erbjudanden · Visa alla" när filtret är på.
- `suggest-from-offers-button.tsx`: kort utan ram (svag yta), "Från:" med kompakta pillrar, knappen "Föreslå rätter" (`aria-label` oförändrat "Föreslå rätter från veckans erbjudanden").
- `offer-display.ts`: tillverkarmärken (Scan, Arla, Kronfågel, Pågen) tas bort oavsett skiftläge och blir extra ("Scan" under raden). `best-store.ts` `matchNames`: första bokstaven versal.

## Verifiering

lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e `offers-link` + `offer-suggestions`; skärmbilder i 375 px (ljust, filtrerat, mörkt) utan sidoöverflöd. Ingen migration, inget nätverk.

## Review Triage Log

Ingen separat granskning. Egen genomgång: e2e-testet för "Visa alla" använder nu `best-store-toggle`, eftersom sammanfattningen också har en länk "Visa alla" (`aria-label` "Visa alla erbjudanden"). Inget annat att rätta.
