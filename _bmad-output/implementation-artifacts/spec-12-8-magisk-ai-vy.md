---
title: 'Story 12.8: Magisk AI-vy'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/main'
---

## Intent

**Problem:** Arket AI-jobb visar bara en rad "Rättförslag / Pågår" med "Avbryt". Det ger ingen känsla av att något händer, och ingen aning om hur lång tid det tar. Pontus: "gör denna sida riktigt AI-future. Kanske någon roterande kub eller annan AI-kluster-bild som ger känsla för att det pågår magiska saker".

**Approach:** Så länge något jobb körs eller väntar visas överst i arket en lugn bild: en långsamt roterande kub av glödande kanter med en mindre kub som snurrar åt andra hållet, en pulserande kärna och två partiklar i bana, allt i appens gröna accent. Under den en statusrad som byts var 2,5 s med mjuk toning, och tiden hittills mot den vanliga tiden ("12 s av ca 35 s"). När inget körs lugnar sig bilden till en stilla glöd med en bock och "Klart!". Radernas knappar är oförändrade; en rad som körs får en svag ljussvep.

## Boundaries & Constraints

**Always:**
- Ren CSS (3D-transformer), inga bibliotek, inga bilder, ingen canvas och inga nya npm-paket. Bara `transform` och `opacity` rör sig.
- Statusraderna: förslag "Läser ditt lager…", "Matchar veckans erbjudanden…", "Komponerar rätter…", "Skriver recepten…"; foto "Tittar på fotot…", "Känner igen varorna…", "Räknar antal…"; import "Hämtar receptet…", "Läser ingredienserna…", "Strukturerar stegen…". Raden byts var 2,5 s (`statusCycleMs`).
- Vanliga tider i en konstant (`typicalSeconds`): förslag 35 s, foto 30 s, import 20 s. Efter den tiden: "36 s, tar lite längre än vanligt".
- Skärmläsare: en stabil `aria-live="polite"`-rad (`sr-only`) som bara ändras när jobbets tillstånd ändras ("AI arbetar med rättförslag." till "Klart!"). Bilden, den växlande raden och tiden är `aria-hidden`.
- "Minska rörelse": ingen rotation, inget ljussvep och ingen växling; en fast statusrad (den första för slaget). Tiden räknas ändå.
- Färger bara ur tokens (`--accent`), så ljust och mörkt läge följer med. 375 px utan sidscroll; knapparna har kvar sin höjd på 44 px.

**Never:**
- Ingen migration, inget nätverk och inga anrop till LM Studio.

## Code Map

- `src/features/ai-jobs/domain/ai-job-magic.ts` -- texter, takt, tider och formatering (ren).
- `src/features/ai-jobs/ui/magic-view.tsx` -- bilden, statusraden, tiden och skärmläsarraden.
- `src/features/ai-jobs/ui/magic.css` -- animationer och "Minska rörelse".
- `src/features/ai-jobs/ui/ai-jobs-sheet.tsx` -- visar vyn överst och ljussvepet på körande rader.

## Tasks & Acceptance

**Acceptance Criteria:**

**Givet** ett förslagsjobb som körs
**När** Pontus öppnar arket AI-jobb
**Så** visas överst en lugnt roterande kub med partiklar, en statusrad som byts var 2,5 s, och "12 s av ca 35 s"

**Givet** att statusraden byts
**När** en skärmläsare lyssnar
**Så** läser den inte upp varje rad; den har en stabil status som ändras först när jobbet startar eller blir klart

**Givet** att inget jobb körs men något är klart
**När** arket är öppet
**Så** står bilden still som en glöd med en bock och "Klart!", och klara jobb visas som förut med "Visa"

**Givet** "Minska rörelse"
**När** arket är öppet
**Så** står allt stilla och statusraden är en fast text

**Givet** ett jobb som tar längre än den vanliga tiden
**När** tiden har gått
**Så** står "tar lite längre än vanligt" i stället för uppskattningen

**Givet** 375 px och mörkt läge
**När** arket visas
**Så** blir ingenting för brett, "Avbryt", "Visa" och "Stäng" har kvar 44 px, och bilden läses i båda lägena

## Vid bygget

- Vald bild: kuben (inte nätverket). Den ger djup med bara CSS och behöver inga `stroke-dashoffset`-animationer, som inte går på GPU:n.
- Granskad med skärmbilder i 375 px, ljust och mörkt (`scratchpad/ux-128/light.png` och `dark.png`). Ljussvepet på raden sänktes från 16 % till 9 % efter första titten.

## Spec Change Log

## Review Triage Log

- Ljussvepet på körande rad var för tydligt i mörkt läge: sänkt (patch).
- `Date.now()` i render bröt `react-hooks/purity`: starttiden hålls nu i `useState`-initierare (patch).
- Vyn kraschade i jsdom utan `matchMedia`: skyddad (patch).
- Ingen avvisad eller uppskjuten punkt.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 scripts/with-test-lock.sh pnpm test:e2e tests/e2e/ai-jobs.spec.ts tests/e2e/ai-photo-jobs.spec.ts tests/e2e/ai-import-jobs.spec.ts` -- expected: alla lyckas
