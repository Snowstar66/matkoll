---
title: 'Story 16.10: Tips, filter och AI var för sig'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** AI-kortet i erbjudandearket blandade tre olika saker i en ruta: ett tips ("Bäst denna vecka"), ett listfilter ("Visa"/"Visa alla") och AI-valet av butik (pillren "Från:" och "Föreslå rätter"). Pontus: "Fortfarande väldigt otydligt. Finns inget intuitivt i detta alls."

**Approach:** En sak på ett ställe. Tipset är en mening med en länk, butiksfiltret finns bara i raden "Visa butik:", och AI har en knapp som vid två butiker frågar vilken butik först.

## Ordning i toppen

Sammanfattning, Hämta/Välj, Visa butik/Sortera, tipsmening, "✨ Föreslå rätter", listan.

Motivering: först vad som visas (sammanfattning) och hur man hämtar mer; sedan kontrollerna som styr listan; sist det som föreslår något. Tipset står direkt före knappen och listan eftersom dess länk "Visa bara de erbjudandena" ändrar just listan under, och AI-knappen är det sista steget innan man läser. En förstagångsanvändare läser uppifrån och ned: vad finns här, hur filtrerar jag, vad rekommenderas, vad kan AI göra med det.

## Ändringar

- `suggest-from-offers-button.tsx`: kortet (ram, bästa-butik-rad och pillren "Från:") är borta. `SuggestFromOffersButton` är en enda kompakt primärknapp "✨ Föreslå rätter" (✨ `aria-hidden`, `aria-label` oförändrat "Föreslå rätter från veckans erbjudanden"). Med två butiker anropar den `onChoose`, annars startar den jobbet direkt. Nya `StoreChoice`: stora radioval (min 56 px, inbyggda radioknappar, fokusring bara med tangentbord), bästa butiken förvald och märkt "– passar dig bäst", och knappen "Föreslå rätter" som startar jobbet med `storeId`. Jobblogiken delas i `useSuggestJob` (samma nyckel vid omförsök).
- `offers-sheet.tsx`: tipsraden `best-store` är en mening med 💡 (`aria-hidden`) och en textlänk "Visa bara de erbjudandena" / "Visa alla erbjudanden" (`best-store-toggle`). Länken "Visa alla" i sammanfattningen är borttagen; sammanfattningen säger bara "Visar N av M erbjudanden". Tipset visas vid 2+ butiker eller när det nämner matchande erbjudanden. Butiksvalet för AI öppnas som en vy i samma ark ("Föreslå rätter från vilken butik?", "Tillbaka" och Esc går tillbaka), eftersom ark aldrig staplas (`Sheet`).
- `best-store.ts`: `bestStoreTip` ("Maxi passar dig bäst den här veckan: Falukorv finns i dina recept", utan butik: "Falukorv finns i dina recept"; skäl "finns i dina recept", "har du hemma", "passar det du brukar laga").
- `list-offers.tsx`: `best` räknas nu även med en butik, så att tipset kan nämna matcher.
- Tester: enhetstester för arket och `bestStoreTip`; e2e `offer-suggestions` har steget med butiksvalet.

## Verifiering

lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e `offers-link` + `offer-suggestions` (19 gröna). Skärmbilder i 375 px (ljust): toppen av arket och butiksvalet, `scrollWidth` 375. Ingen migration, inget nätverk.

## Review Triage Log

Ingen separat granskning. Egen genomgång av skärmbilderna: första bilden togs mitt i öppningsanimationen och visade en avklippt topp; en ny bild efter animationen visade hela ordningen, utan fynd att rätta. Skärmbilderna är raderade och inte incheckade.
