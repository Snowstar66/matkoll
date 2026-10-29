---
title: 'Story 16.5: Varor utan mängd följer med till varukorgen'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '196dd68'
---

## Intent

**Problem:** Pontus hade sex varor kvar (Gul lök, Persilja, Grädde, Smör, Falukorv, Tomatpuré) men bara fyra hamnade i ICA-varukorgen. `exportableLines` i `export-basket.ts` filtrerade bort `isVague`, raderna utan mängd ("Saknas i Hemma"), så Persilja och Smör kom aldrig med i texten.

**Approach:** Alla rader som inte är avbockade följer med. En post utan mängd får fältet `Mängd: ingen angiven – välj en vanlig förpackning`, instruktionen säger att varje rad ska in och att det som inte hittas ska rapporteras, och bekräftelsen visar antalet.

## Ändringar

- `export-basket.ts`: `exportableLines` filtrerar bara bort avbockade rader. `amountOf` ger alltid en text, `noAmountText` när mängd saknas, så varje post har ett `Mängd:`-fält (också egna varor utan mängd och receptrader utan katalogkoppling med faktor 1). Ny `basketItemCount` ger samma tal som "Antal varor".
- Instruktionen (kod och `docs/varukorgsexport.md`, ordagrant lika): punkt 3 "varje rad, ingen undantagen, hoppa aldrig över en rad i tysthet", punkt 4 förklarar "Mängd: ingen angiven" (en vanlig förpackning, den minsta vanliga), punkt 8 kräver att varje rad som inte lades i rapporteras med skäl och att antalet läggs-i plus rapporterade stämmer med "Antal varor".
- `copiedText` tar `count` och börjar då med "6 varor kopierade. " ("1 vara kopierad."); `send-basket.tsx` skickar antalet. Samma text visas i toasten och i urklippsarket.
- Golden-filen `varukorgsexport-v1.txt` och exemplet i dokumentet uppdaterade (Salt tillkom, Diskmedel och Salt har Mängd), vaga poster-regeln i dokumentet omskriven.
- Tester: enhetstester för export, bekräftelsetext, "Kopiera till" och "Dela listan" (Persilja och Smör utan mängd följer med); e2e `basket-export` anpassad (Salt med, antal och toast).

## Beslut

- **Versionen förblir v1.** Ändringen är additiv: samma fältstruktur, samma fältnamn, bara ett nytt värde för `Mängd` och en skärpt instruktion. Ingen tolkar versionsraden maskinellt, och agenten läser texten som den är. Kod­kommentaren och avsnittet "Versioner" i dokumentet säger nu att additiva tillägg som detta behåller v1 med uppdaterad golden-fil.
- Alla poster utan mängd får samma värde, inte bara de vaga, så att agenten alltid ser ett `Mängd:`-fält och aldrig behöver gissa vad en saknad rad betyder.
- Antalet i toasten är exportens "Antal varor" (poster, där en katalogingrediens i flera enheter är en post), så texten och bekräftelsen alltid stämmer.
- "Dela listan" (14.2) tog redan med vaga rader; ett uttryckligt test låser det nu. Ingen migration, inget nätverk.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Knappen `canSend` använder `exportableLines`, så en lista med bara vaga rader kan nu kopieras (före: knappen dold). Avsiktligt, testet "every line checked off" visar det som gäller.
- Fallet "bockarna gick inte att läsa" skickade förut alla utom vaga; nu alla, testet rättat.
- e2e `shopping.spec.ts` hade ett växlande flaky fel i två olika tester (orelaterat, rör inte exporten); grönt vid omkörning (15 av 15).
- lint, typecheck, 5175 enhetstester, `AI_PROVIDER=mock pnpm build` och e2e `basket-export` och `shopping` gröna.
