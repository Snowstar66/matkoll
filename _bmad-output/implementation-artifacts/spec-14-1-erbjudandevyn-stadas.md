---
title: 'Story 14.1: Erbjudandevyn städas'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '271c36d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "fixa ux i erbjudanden också. Det är lite kladdigt nu". Arket Veckans erbjudanden växte story för story (9.1–9.15) och staplade sammanfattning, "Hämta från"-panel, bästa butik, AI-knapp med butikspiller, sorteringspiller, butikspiller, "Veckans fynd", listan med checkboxar och en fotknapp.

**Approach:** Samma funktioner, ny ordning: rubrik och meta, en verktygsrad (Hämta, Filter, Välj), ett AI-kort, listan. Panelerna fälls ut först när de behövs.

## Boundaries & Constraints

**Always:** Alla funktioner från 9.1–9.15 finns kvar (hämta en butik med ett tryck, valda/alla från flera, bästa butik, AI-förslag per butik, sortering, butiksfilter, välj till inköpslistan, rabatt, märken, Toppklipp). Tryckytor minst 44 px, mörkt läge, 375 px utan sidoscroll, Epic 11-komponenter (Sheet, FilterPills, ListRow, CheckCircle). En primär åtgärd i taget.

**Never:** Ingen migration, inget nätverk, ingen ändring i `src/features/shopping/` (14.2 byggs parallellt).

</frozen-after-approval>

## Nytt utseende, uppifrån och ned (375 px)

1. **Rubrik:** "Veckans erbjudanden", under den butik eller "2 butiker" och vecka (som förut).
2. **Meta:** "14 erbjudanden · hämtade idag 10:47" och, när det finns, "🔥 2 Toppklipp" på samma rad (ersätter raden "Veckans fynd").
3. **Verktygsrad:** `Hämta` (en butik: "Hämta igen", ett tryck; flera: fäller ut butikspanelen med kryssrutor, "Hämta valda (n)" och "Hämta alla"), `Filter` (fäller ut Sortera och Butik; "Filter · n" visar antal aktiva val) och `Välj` längst till höger (bara med inköpslista). Bara en panel öppen i taget; en hämtning stänger panelen så förloppet syns.
4. **AI-kort:** en ram med "Bäst denna vecka: Maxi – 12 passar" (bara med två butiker som har erbjudanden), butikspillerna för förslagen och knappen "Föreslå rätter från veckans erbjudanden". Knappens text är oförändrad så att namnet är stabilt.
5. **Listan:** kategorirubriker och erbjudanderader som förut. Rader utan kryssruta tills Pontus trycker `Välj`.
6. **Fot:** "Lägg n i inköpslistan" (primär) bara när något är valt. "Öppna sidan" sist.

Utan erbjudanden: texten, en stor primär "Hämta veckans erbjudanden" (eller butikspanelen öppen direkt vid flera butiker) och AI-kortet avstängt med sin förklaring.

## Beslut

- **Välj-läge i stället för alltid synliga kryssrutor:** raderna blir lugnare och prisetiketten får plats; valet är en medveten handling och kryssrutorna (44 px) syns när den behövs. "Klar" lämnar läget och släpper valen. Efter "Lägg i inköpslistan" stängs läget; "På listan" syns alltid.
- **Utfällbara paneler i stället för popover eller nytt ark:** ark staplas aldrig (EXPERIENCE.md) och en popover har ingen färdig komponent; panelen i flödet är tillgänglig (`aria-expanded`, `aria-controls`).
- **"Veckans fynd" i metaraden** och räknas på det filtrerade urvalet.
- Ramar (`border-border`, `rounded-lg`) i stället för nya färger, så mörkt läge följer tokens. Avstånd på 4/8-rutnätet (gap 8/16, kortets padding 16).

## Vid bygget

- `OffersList` tappade `FindsLine`; `OfferSelection` fick `selecting`. `FetchOffersButton` har varianterna primary/secondary. `SuggestFromOffersButton` tar `bestLine` och ritar kortet.
- Tester: enhetstester flyttade till Välj/Hämta/Filter, nytt test för Toppklipp i meta. E2E `offers-link` (öppna Filter, Välj, Hämta före sortering/val) och `offer-suggestions` ("Bäst denna vecka:") uppdaterade avsiktligt. `shopping-look` oförändrad och grön.
- Före/efter-skärmbilder (375 px, ljust och mörkt) granskades en gång och är raderade; ingen sidoscroll.

## Review Triage Log

Ingen separat granskning: ingen migration, ren UI-ändring i befintliga komponenter. lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e (`offers-link`, `offer-suggestions`, `shopping-look`) är gröna.
