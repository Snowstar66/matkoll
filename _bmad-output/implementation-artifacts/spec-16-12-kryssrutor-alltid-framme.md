---
title: 'Story 16.12: Kryssrutor alltid framme'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Pontus om arket: "ta bort visa dessa. Ta bort klar och låt möjligheten att välja alltid ligga framme. Det borde nog vara checkboxar också. Nu liknar det radioboxar."

**Approach:** "Visa dessa" och "Välj"/"Klar" tas bort; kryssrutorna ligger alltid framme när man kan lägga till i inköpslistan, och är nu kvadratiska.

## Ändringar

- `offers-sheet.tsx`: växeln `best-store-toggle`, filtret till träffar och "Visar N av M" borta; tipskortet har knappen "✨ Föreslå rätter" högerställd under meningen; "Välj"/"Klar" och `selecting` borta; listraden har bara antalet. "Passar dig" kvar.
- `offers-list.tsx`: rutan visas alltid med `selection` (propen `selecting` borta).
- Ny `src/components/checkbox.tsx`: 22 px ruta, 6 px hörn, 2 px ram `ink-3`, ikryssad accent med vit bock, 44 px träffyta, `role=checkbox`. `CheckCircle` i inköpslistan är orörd.
- Tester: enhetstester och e2e (`offers-link`, `offer-suggestions`) utan "Välj" och "Visa dessa".

## Review Triage Log

- Liten UI-ändring, ingen migration; ingen separat granskning. Kontrollerat med lint, typecheck, enhetstester, build, de två e2e-specarna och en skärmbild vid 375 px.
