---
title: 'Story 9.15: Butiksfärger och roligare erbjudandelista'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '0554e07'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-13-erbjudanden-fran-flera-butiker.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus frågade om det blir dyrt med "lite ica-look över listan" och ville tidigare ha listan "lite roligare/snyggare". Svaret han godtog: styling kostar ingen tid; butiksbrickor i kedjans färg och en roligare lista, men ingen ICA-logga, inget varumärkesefterhärmande och inga hotlänkade ICA-produktbilder.

**Approach:**
- Butiksbricka: fylld i kedjans färg. ICA varm röd med vit text, övriga neutral (mörk grå-grön). Tonen kommer från `storeBadgeTone`; en ny kedja (Willys grön) är en rad där, en token i `globals.css` och en ton i `offers-list.tsx`.
- Prislapp: priset större (18 px) och fetstilt, ordinarie pris litet och genomstruket under, "−20 %" i varm bärnsten (`deal`), "Toppklipp" i starkare bränd orange (`hot`) med 🔥 som aria-dold text.
- Överst i listan: "Veckans fynd: N Toppklipp" när det finns något.
- Ljust och mörkt läge, kontrasttestet utökat, 375 px utan sidscroll, tryckytor oförändrade (44 px), tillgängliga namn oförändrade.

## Boundaries & Constraints

**Always:** Tokens i `globals.css` och `DESIGN.md`; text mot bakgrund minst 4,5:1; färgen bär aldrig ensam butiken (namnet står i brickan). Inga osynliga tecken i källkoden annat än som `\u`-escapes.

**Never:** ICA-logga, produktbilder, nätverksanrop, migration. Inte AI-knappen eller förslagskoden i `offers-sheet.tsx` (Story 9.14).

## Code Map

- `src/features/offers/ui/offers-list.tsx`: brickor, prislapp, `FindsLine`.
- `src/app/globals.css`, `DESIGN.md`: tokens `store-ica`, `store-other` (nu fyllda), `deal`, `hot` (+ `-ink`, ljust och mörkt), mönstret `offer-row`.
- `tests/design/contrast.test.ts`: nya par och undantag för de varma färgerna i "ingen röd"-testet.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test` (5109 gröna), `AI_PROVIDER=mock pnpm build`, e2e `offers-link` och `shopping-look` (17 gröna); skärmdump i 375 px ljust och mörkt utan sidscroll.

## Review Triage Log

Ingen separat granskning (liten stil-story, ingen migration). Egen genomgång: listrubrikens "Toppklipp" krockade med enhetstestets sökning, så testet ankrar nu på `^Toppklipp`; 🔥 ligger utanför märket så e2e-sökningen på `^Toppklipp` håller. Ingen produktbild och ingen ICA-logga.
