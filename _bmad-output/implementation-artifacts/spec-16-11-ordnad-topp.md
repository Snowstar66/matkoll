---
title: 'Story 16.11: Ordnad topp i erbjudandearket'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Pontus om toppen efter 16.10: "bättre men rörigt. Kanske behöver man någon border eller divider. Och framförallt att allt är lagt i snygga rader, rätta storlekar mm så det inte är stökigt och brusigt." Allt flöt fritt med ojämna avstånd, etiketterna var olika breda så pillren inte linjerade, pillren var stora och tunga, tipset och länken låg på skilda rader, och "Klar" hade en stor fokusring vid öppning.

**Approach:** Toppen byggs i grupper på 4/8-rutnätet, alla vänsterkanter på arkets innerkant, med två hårstreck som avdelare.

## Layout (uppifrån och ned)

1. **Rubrikgrupp:** titel och "Klar" på samma rad; metaraden "2 butiker · v. 44 · 157 erbjudanden · 🔥 18 Toppklipp"; raden "Hämtade idag 13:30 · Hämta igen". "Hämta igen" är en inline-länk (44 px träffyta); med två eller fler butiker öppnar den butikspanelen som förut. Raden Hämta/Välj är borta. Utan erbjudanden är undertiteln kvar som förut.
2. **Avdelare:** hårstreck i `border`, 16 px över och under.
3. **Inspirationskort:** mint på låg styrka, rundat som andra kort, 16 px luft. Rad 1: 💡 och tipset i brödtextstorlek. Rad 2: "Visa bara de erbjudandena" till vänster och kompakta "✨ Föreslå rätter" (40 px) till höger, centrerade mot varandra. Utan tips visas bara knappraden. Butiksvalet för AI (16.10) är oförändrat.
4. **Avdelare.**
5. **Kontroller:** ett rutnät med två kolumner (etikettkolumnen är lika bred som längsta etiketten, "Visa butik"), så båda kontrollerna börjar på samma x. Etiketter i metastorlek, dämpade, utan kolon. Kontrollerna är segmenterade val (`FilterPills segmented`): en rundad ram på 32 px med hårstreck, lika höga segment, valt segment i accentfärg; varje segment har 44 px träffyta (ett `before`-element som når 9 px över och under). Radrna är lika höga med 8 px emellan, och bara de som gäller visas.
6. **Listrad:** "157 erbjudanden" (eller "Visar 3 av 157") till vänster, "Välj" som textknapp till höger, ett hårstreck under, sedan listan som förut.

## Fokus

`Sheet` får `initialFocus="title"`: rubriken (`tabIndex={-1}`, utan outline) tar fokus när arket öppnas, så "Klar" får ingen ring vid öppning. Ringen visas bara med `:focus-visible` (global regel, oförändrad).

## Ändringar

- `offers-sheet.tsx`: ny topp enligt ovan; `FilterRow` borttagen; Toppklipp räknas över alla erbjudanden; "Hämtade" visar den senaste hämtningen över butikerna; `data-testid` nya: `offers-meta`, `offers-fetched`, `inspiration` (`offers-summary` är nu listradens antal).
- `offers-sheet` text: `offersMetaText` och `fetchedLineText` i `offer.ts`.
- `filter-pills.tsx`: `segmented` (radiogrupp, piltangenter som förut).
- `fetch-offers-button.tsx`: varianten `link` ("Hämta igen" som inline-länk) i stället för `secondary`; `inlineLinkClasses` delas.
- `suggest-from-offers-button.tsx`: `className` för placering i kortet.
- `sheet.tsx`: `initialFocus="title"`.
- Tester: enhetstester för arket, texterna och det segmenterade valet; e2e `offers-link` har "Hämta igen" i stället för "Hämta" (flera butiker) och etiketterna utan kolon.

## Verifiering

lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e `offers-link` + `offer-suggestions`. Skärmbilder av arkets topp med två butiker och besparingar efter animationen: 375 px ljust, 375 px mörkt och 1280 px ljust; `scrollWidth` lika med bredden i alla tre. Kontrollerade: vänsterkanter, etikettkolumn (båda segmenten börjar på samma x), lika höga segment, 16 px mellan grupperna, inget element större än sin roll. Ingen migration, inget nätverk. Skärmbilderna är inte incheckade.

## Review Triage Log

Ingen separat granskning. Egen genomgång av skärmbilderna: kortets länk "Visa bara de erbjudandena" bryts till två rader vid 375 px eftersom raden delas med knappen; behållen (vänsterställd, centrerad mot knappen, ingen avklippning) i stället för att stapla om raden. Listradens rader är som förut indragna av `ListGroup` (listan "som den är").
