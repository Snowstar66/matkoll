---
title: 'Story 11.4: Inköpslistan i nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: 'a566fa1'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-inkopslistan-raknas-fram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-bocka-av-i-butiken.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-6-ratta-mangd-och-dolja-listposter.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-2-produktval-per-vara.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-3-skicka-till-ica.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-5-inkopslista-infor-resan-till-ett-annat-stalle.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/inkopslista.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Inköpslistan "behöver också lyftas". I butiken syns inte hur mycket som är kvar, avbockade poster står kvar bland de andra, och raden under ("från …") och "Finns hemma?" är svåra att läsa (FR-43).

**Approach:**
- Överst står framstegsraden "8 varor kvar" och "6 av 14 i korgen" med en mätare.
- Posterna står under samma kategorier som i Lagersaldo (11.1), i butikens ordning, med runda bockar, mängden efter namnet, en rad under och produktvalet som etikett.
- En avbockad post flyttas direkt till "I korgen" längst ned, som är hopfälld.
- "Skicka till ICA" och "Lägg i lagret" ligger i en rad längst ned.

## Boundaries & Constraints

**Always:**
- Listan räknas som förut av `computeList` (AD-8). Bara visningen ändras. Exporten (`exportBasket`, AD-16) är oförändrad och grupperar fortfarande per avdelning.
- Kategorin för en post är `displayCategory(line.section, line.label)`. Kategorierna står i `CATEGORIES`-ordning, och posterna inom en kategori i samma ordning som `computeList` ger.
- Framstegsraden räknar poster som inte är dolda: "N varor kvar" (1 ger "1 vara kvar") och "M av T i korgen". När allt är avbockat: "Allt ligger i korgen". Mätaren är `M / T` och dold för skärmläsare.
- Listposten: `CheckCircle` (26 px synlig, 44 px tryckyta), namnet i `row-title` med mängden efter i `ink-2` (`lineAmountText`, också "(hemma: 1 kg)" och "(beräknat 4 dl)"), raden under och produktetiketten till höger.
- Raden under är `lineMetaText(line, dishTitles, siteName)`:
  - en egen vara: "Egen vara";
  - en vag post vars vara saknas: "Saknas i lagret" med ett ställe, "Saknas i Stugan" med flera, och sedan " · " och rätterna;
  - annars rätterna med " · " emellan, utan "från".
  - "Finns hemma?" används inte längre i listan.
- Produktetiketten visas när det finns ett produktval för postens katalogingrediens i vald butik: `product_name`, avkortat med "…", högst 40 % av raden.
- En bock flyttar posten direkt till I korgen och sparar den med `setChecked` som förut (optimistiskt). Live-regionen säger "Citron i korgen." och fokus går till nästa posts bock, annars den föregående, annars korgradens "Visa".
- Korgraden "N varor i korgen" (1 ger "1 vara i korgen") med "Visa" står under sista kategorin och "Lägg till egen vara" när minst en post är avbockad. "Visa" fäller ut rubriken "I korgen" (`h2`) med de avbockade posterna, överstrukna, i listans ordning, och blir "Dölj". En bock där tar tillbaka posten, och live-regionen säger "Citron tillbaka på listan.".
- Utfällt eller hopfällt står kvar när Pontus byter flik och kommer tillbaka (Activity), men inte efter omladdning.
- Ett tryck på texten öppnar listpostdetaljen, och svep vänster döljer eller tar bort, som förut.
- De fasta knapparna: "Skicka till ICA" (sekundär) ensam när inget är avbockat, och "Skicka till ICA" och "Lägg i lagret" (primär) i en rad när något är avbockat. Får de inte plats bredvid varandra står "Lägg i lagret" överst. Knapparna håller sig ovanför flikfältet och inom iPhones säkerhetsmarginal, och listan får luft under sig så att inget göms bakom dem.
- Raden "Lager: Stugan · Byt" står som förut överst, bara med flera ställen.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och tangentbord. Bockens namn är som förut ("Citron, 1 st, inte avbockad").
- E2E-specen har den egna e2e-användaren `e2e-utseende-lista@matkoll.test`.

**Never:**
- Ingen ändring av `computeList`, listnycklarna, överlägget, exporten eller "Lägg i lagret".
- Ingen fördröjning innan en avbockad post flyttas, och ingen animation som flyttar andra poster under tummen när "Minska rörelse" är på.
- Inget rött och ingen emoji i texterna (korgraden har ingen 🧺).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lista | 14 poster, 6 avbockade | "8 varor kvar", "6 av 14 i korgen", mätaren 43 %, 8 poster under kategorier, "6 varor i korgen" och "Visa" | N/A |
| Kategorier | Gul lök, Falukorv, Lax, Matlagningsgrädde, Krossade tomater, Sojasås | Frukt & grönt, Mejeri & ägg, Kött, fisk & chark (Falukorv och Lax), Skafferi, Såser & smaksättare | N/A |
| Bocka av | Tryck på bocken vid Citron | Citron försvinner ur Frukt & grönt, "7 varor kvar", "7 av 14 i korgen", "Citron i korgen.", fokus på nästa bock | Sparas inte: posten tillbaka och meddelanderutan som förut |
| Ta tillbaka | "Visa", tryck på bocken vid Citron under I korgen | Citron tillbaka under Frukt & grönt, "Citron tillbaka på listan." | Som ovan |
| Allt avbockat | Alla 14 | "Allt ligger i korgen", inga kategorier, korgraden, båda knapparna | N/A |
| Inget avbockat | 0 av 14 | "14 varor kvar", "0 av 14 i korgen", ingen korgrad, bara "Skicka till ICA" | N/A |
| Två rätter | Matlagningsgrädde från Korv stroganoff och Kycklinggryta | "Korv stroganoff · Kycklinggryta" | N/A |
| Egen vara | Diskmedel | "Egen vara" | N/A |
| Vag post, ett ställe | "senap efter smak", senap saknas | Ingen mängd, "Saknas i lagret · Korv stroganoff" | N/A |
| Vag post, flera ställen | Listan räknas mot Stugan | "Saknas i Stugan · Korv stroganoff" | N/A |
| Olika enheter | Mjöl 2 dl, hemma 1 kg | "Mjöl 2 dl (hemma: 1 kg)" | N/A |
| Produktval | "Scan Falukorv 800 g" för falukorv | Ljusblå etikett "Scan Falukorv 800 g", avkortad vid 375 px | N/A |
| Utan butik | Ingen butik vald | Inga etiketter | N/A |
| Dold post | En dold post | Räknas inte i framstegsraden, "Dolda poster" som förut | N/A |
| Matsedeln ändras | En rätt läggs till medan listan är öppen | Listan räknas om, I korgen och bockarna står kvar | N/A |
| Lägg i lagret | 6 avbockade | "Lagt 6 varor i lagret." som förut, I korgen försvinner | Som förut |
| Byt flik | I korgen utfälld, Recept, Inköpslista | Fortfarande utfälld | N/A |
| 200 % text | 375 px | Knapparna ovanpå varandra, etiketten avkortad, ingen vågrät scroll | N/A |
| Tom lista | Allt finns hemma | "Allt finns hemma." som förut, ingen framstegsrad | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md`
- `mockups/inkopslista.html` -- målet
- `src/features/shopping/ui/shopping-list.tsx` (+ tester), `put-in-pantry.tsx`, `send-basket.tsx`, `line-removal.ts`, `line-detail-sheet.tsx`
- `src/features/shopping/domain/list-text.ts` (`groupBySection`, `originsText`, `lineAmountText`, `itemsLeft`, `checkLabel`), `compute-list.ts` (`ShoppingLine`), `product-choice.ts`, `check.ts`
- `src/features/pantry/ui/list-site-line.tsx` -- raden "Lager"
- `src/components/` -- `CategoryHeader`, `ListGroup`, `ListRow`, `Meter` (11.1), `CheckCircle`, `FixedAction`, `Button`
- `tests/e2e/` -- specar som letar efter "från …", "Finns hemma?" eller avbockade poster på sin plats (`grep -rln "från \|Finns hemma?" tests/e2e`)

## Tasks & Acceptance

**Execution:**
- [x] `src/features/shopping/domain/list-text.ts` (+ test) -- `groupByCategory(lines)` (ersätter `groupBySection` i vyn), `lineMetaText`, `progressText(left, checked, total)`, `basketText(n)`, `inBasketAnnouncement(label)`, `backOnListAnnouncement(label)` -- FR-43, UX-DR28
- [x] `src/features/shopping/ui/shopping-list.tsx` (+ test) -- framstegsraden, kategorierna, listposten, I korgen med "Visa" och "Dölj", fokus och live-region enligt Boundaries -- FR-43, UX-DR25
- [x] `src/features/shopping/ui/product-chip.tsx` (+ test) -- etiketten från produktvalet
- [x] `src/components/fixed-action.tsx` (+ test) -- två knappar i en rad, ovanpå varandra när de inte får plats (flex-wrap), "Lägg i lagret" överst i det läget
- [x] Befintliga e2e-specar -- uppdatera de som letar efter "från …", "Finns hemma?" eller att en avbockad post står kvar
- [x] `tests/e2e/shopping-look.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-lista@matkoll.test`: framstegsraden, en bock som flyttar posten till I korgen och tillbaka, raden under för en egen vara och en vag post med två ställen, produktetiketten och knapparna, vid 375 px
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given listan vid 375 px i ljust och mörkt läge, when den jämförs med `mockups/inkopslista.html`, then har den samma uppbyggnad (skärmbilder utanför repot, i granskningen).

## Implementation Notes

- **Beslut (godkänt 2026-10-27): posten flyttas direkt.** En fördröjning skulle flytta listan under tummen medan Pontus siktar på nästa vara. Det som flyttas syns i framstegsraden och i live-regionen. Öppen fråga 16.
- **Beslut (godkänt 2026-10-27): I korgen är hopfälld från början,** som i skissen, så att det som är kvar syns först.
- **Beslut (godkänt 2026-10-27): "Saknas i Stugan" ersätter "Finns hemma?".** Texten säger vad som gäller, och bocken betyder fortfarande "har köpt den eller har den redan".
- **Beslut (godkänt 2026-10-27): rätterna utan "från".** Skissen. Raden under står alltid i `ink-3`, så den läses inte som en del av namnet.
- **Risk: fokus när en post flyttas.** Flytta fokus innan posten tas bort ur sin kategori. Testa med tangentbord och VoiceOver.
- **Risk: optimistisk bock och omräkning.** Om listan räknas om medan en bock sparas ska posten inte hoppa fram och tillbaka. Behåll mönstret med `useOptimistic` från 3.4.

## Spec Change Log

### Vid bygget

- **Byggd på `a566fa1`** (`baseline_commit`) och ombaserad före commit på `fbe221d` (granskningsfixarna för 11.1, Story 11.6 och Story 11.2). Besluten ovan godkändes som de var skrivna: Pontus gav fritt mandat för natten.
- **Kategorierna är vanliga `div` utan landmärke,** som i `src/components/README.md` efter granskningen av 11.1: rubriken (`CategoryHeader`, `h2`) namnger listgruppen (`ul role="list"`). Detsamma gäller "I korgen", vars `h2` namnger listan med de avbockade posterna. Testerna letar därför efter listan ("Mejeri & ägg"), inte en region.
- **Avbockade rader har `srStatus="i korgen"`** (ListRow), så att överstrykningen också sägs.
- **Ett andra tryck med fingret inom 400 ms** på en annan bock räknas inte (`doubleTapGuardMs`), eftersom nästa post glider upp under tummen när den första flyttas. Samma gräns som soptunnan i 11.1. Mus och tangentbord räknas alltid, och posten flyttas fortfarande direkt (ingen fördröjning). Tidsstämpeln kommer från händelsen (`pointerdown`), inte från `performance.now()`, som React Compiler inte tillåter.
- **Fokus:** från listan till nästa posts bock, annars den föregående, annars korgradens "Visa", som i specen. Från I korgen (specen säger inget) till nästa avbockade posts bock, annars den föregående, annars posten själv tillbaka i sin kategori. Fokus flyttas före bocken när målet redan finns, annars efter nästa rendering.
- **Live-regionen för en bock** är en egen (`check-announcement`) bredvid omräkningens (`list-announcement`), så att Pontus egen bock aldrig räknas som en omräkning.
- **"Finns hemma?" är borta också ur bockens namn:** en vag post heter bara "Salt" (förut "Salt, finns hemma?"). Raden under säger "Saknas i lagret", och `lineAmountText` ger ingen mängd för en vag post, också i arket Dolda varor.
- **Sammanfattningen under rubriken** är "Vecka 44 · 2 rätter" utan "N varor kvar", eftersom framstegsraden säger det.
- **"Skicka till ICA" är sekundär också ensam**, som i specen. När allt är avbockat döljs den som förut, eftersom exporten lämnar ute avbockade varor och inte får ändras. Matrisen säger "båda knapparna", men EXPERIENCE.md (Allt i korgen) säger att bara "Lägg i lagret" står kvar. Öppen fråga 18.
- **I korgen fälls ihop när den blir tom** ("Lägg i lagret", eller den sista posten tagen tillbaka), så att nästa bock börjar hopfälld.
- **Produktetiketten** är högst 40 % av raden med `max-w-[40cqw]`, där listgruppen är container (`@container`). `40vw` blev för brett, eftersom raden är smalare än skärmen.
- **`FixedAction`** lägger knapparna i en rad med `flex-wrap-reverse` och `*:grow *:basis-0 *:min-w-fit`: lika breda när de får plats, och den sista överst när de inte gör det. Receptvyns knappar (ett barn) påverkas inte.
- **"Saknas i Hemma"** med flera ställen och Hemma valt följer specen. Öppen fråga 19.
- **Kontrollerna** (integration och e2e under `scripts/with-test-lock.sh`): `pnpm lint`, `pnpm typecheck`, `pnpm test` (215 filer, 4 372 tester) och `pnpm test:integration` (11 filer, 455 tester) lyckas efter ombaseringen på `fbe221d`. `AI_PROVIDER=mock pnpm build` lyckas, och hela `CI=1 pnpm test:e2e` ger 272 av 272. Storyn ändrar ingenting i databasen.
- **Skärmbilder** vid 375 px i ljust och mörkt läge (överst, och nederst med I korgen utfälld) ligger utanför repot, i agentens scratchpad.

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone i butiken eller hemma: bocka av fem varor i rad med tummen. Ingen vara ska bockas av av misstag när listan flyttar sig.
- VoiceOver: "8 varor kvar, 6 av 14 i korgen", bocken "Citron, 1 st, inte avbockad", "Citron i korgen." efter en bock, och "Visa" vid korgraden.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: knapparna och etiketten får plats utan vågrät scroll.
