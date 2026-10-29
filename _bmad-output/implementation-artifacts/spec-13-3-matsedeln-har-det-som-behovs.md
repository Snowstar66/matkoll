---
title: 'Story 13.3: Matsedeln har det som behövs'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c7ab06a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus bad om en koll av matplaneringen: har den det den behöver? Att ta bort en rätt gick med en textknapp utan kontrollfråga, och veckan går inte att planera per dag.

**Approach:** En genomgång av Matsedel mot PRD (FR-13, FR-14, FR-18) och Pontus flöden. Det som saknas och är litet byggs: en soptunna per rätt med den smarta kontrollfrågan "Ta bort <rätt> från matsedeln?". Det stora skrivs som förslag till Pontus.

## Boundaries & Constraints

**Always:** Soptunnan (`TrashButton`, 44 px) på rättkortet; svepet "Ta bort" frågar på samma sätt. Första borttagningen frågar; nästa inom en minut går direkt, och tiden räknas om från den senaste. "Ångra" finns kvar efter borttagningen. Inköpslistan följer med (`removePlanRecipe` revalidiserar listan, som förut). Epic 11-utseendet.

**Never:** Ingen databasändring. Ingen konkurrerande generisk hook om 13.1:s finns. Ingen ändring av receptvyn (13.2).

</frozen-after-approval>

## Genomgång

Matsedelns modell har ingen dag: rätterna är en ordnad lista (`position`) på en veckomatsedel ("Vecka 44").

| Behov | Status idag | Åtgärd |
| --- | --- | --- |
| Lägga till rätt från biblioteket | Finns: "Lägg till rätt" (favoriter först, sök), "Lägg på matsedeln" i receptet | Ingen |
| Lägga till från AI-förslag | Finns (Story 9.5, val till matsedeln) | Ingen |
| Ta bort rätt | Fanns som textknapp och svep, utan kontrollfråga, med "Ångra" | Byggt: soptunna + smart kontrollfråga, svepet frågar också |
| Ändra portioner | Finns och syns: stegare på kortet, sparas, status och lista följer | Ingen |
| Flytta rätt till annan dag | Finns inte; modellen har inga dagar | Förslag till Pontus (kräver migration och ny vy) |
| Se veckan på en gång | Delvis: kort med status per rätt, men ingen dagsindelning | Förslag (hänger ihop med dagar) |
| Ordna om rätter | Saknas (`position` finns men kan inte ändras) | Förslag |
| Hoppa till receptet | Finns: titeln är en länk | Ingen |
| Markera som lagad | Finns inte | Förslag |
| Gå till inköpslistan | Finns: "Visa inköpslistan" och fliken | Ingen |
| Tidigare veckor | Finns (Story 3.2) | Ingen |

## Förslag till Pontus

1. **Dagar på matsedeln:** nullable `weekday` (0-6) på `meal_plan_recipe`, en veckovy grupperad per dag med "Ej planerad" överst, och "Flytta till dag" på kortet. Kräver migration, ny vy och nya tester: för stort för den här storyn.
2. **Markera som lagad:** bock på rätten som drar av lagret (hänger ihop med Epic 4, "Laga mat").
3. **Ordna om rätterna** med upp/ner-knappar (billigt om dagar inte byggs).

## Vid bygget

- Storys 13.1:s delade kontrollfråga fanns inte på `origin/story/13-1` under de cirka 30 minuter bygget väntade. Därför finns en minimal lokal hook, `useRemoveConfirm` (`src/features/mealplan/ui/use-remove-confirm.tsx`), med samma beteende (60 s fönster, "Avbryt"/"Ta bort", `Sheet`). När 13.1 är mergad ska hooken bytas mot den delade och filen tas bort.
- Soptunnans namn är "Ta bort <rätt> från matsedeln" (som textknappen), så svepets "Ta bort <rätt>" och soptunnan skiljs åt.
- Inga migrationer, inga serveråtgärder ändrade: inga integrationstester behövdes, ingen backup eller `pantry-site-check`.
- Tester: ny enhetstestfil `meal-plan-remove-confirm.test.tsx`; `meal-plan-ui.test.tsx` går förbi frågan; e2e `mealplan.spec.ts` har ett nytt test (fråga, Avbryt, direkt borttagning, listan följer, tryckyta minst 44 px). Flytta till dag har inget test eftersom det inte byggdes.

## Review Triage Log

Ingen separat granskning: ingen migration, och ändringen är liten och gjord i befintliga komponenter. lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e (`mealplan`, `recipes-look`, `shopping`) är gröna.
