---
title: 'Story 3.9: Avbockade syns och kan ångras'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Pontus: "När jag checkar av från listan så försvinner de helt. Det är ok. Men jag skulle vilja kunna se dem överstrukna och kunna ångra tillbaka om jag råkat checka av fel. Undrar om det inte ska vara genomgående samma typ av checkbox som erbjudanden."

**Approach:** "I korgen" är öppen från början och ligger längst ned med de avbockade varorna överstrukna. Efter en avbockning visas en toast "Gul lök i korgen" med "Ångra". Inköpslistan använder samma fyrkantiga `Checkbox` som erbjudandearket.

## Ändringar

- `shopping-list.tsx`: "I korgen" är öppen som standard. Rubrikraden är "I korgen (8)" med "Dölj"/"Visa"; valet sparas per enhet i `localStorage` (`matkoll:basket-open`, i try/catch, läses efter hydrering så att server och första rendering stämmer). Den gamla regeln "fälls när korgen töms" är borta, så valet består. Den dubbla rubriken under raden är borta; raden är rubriken och listans namn.
- Efter en avbockning visas `showToast("Gul lök i korgen", { onUndo })`; "Ångra" bockar av varan igen (samma sparväg som ett tryck). Bara den senaste toasten visas, vilket är ok vid snabba avbockningar. Ett tryck på rutan i korgen (bocka tillbaka) ger ingen toast.
- `Checkbox` fick `describedBy` (för raden under namnet). Listpostens runda `CheckCircle` är ersatt av `Checkbox` i inköpslistan och i butiksvalet "Hämta" i erbjudandearket. 44 px träffyta, roll `checkbox` och tillgängliga namn är oförändrade.
- `list-text.ts`: `basketText` ger "I korgen (N)"; `basketTitle` är borttagen.
- Oförändrat: förloppskortet "N varor kvar · X av Y i korgen", papperskorgen med smart bekräftelse (13.1), svep, "Lägg i lagret" (3.7), kopiera till varukorg och dela. Avbockade varor lämnas fortfarande utanför varukorgsexporten. "Lägg i lagret" använder som förut de avbockade raderna.
- Ingen migration: avbockningen sparas redan (Story 3.4).

## Beslut om andra bockar

- Lagersaldots listor, receptets ingrediensrader, matsedelns dagväljare och "flytta till dag" använder `CheckIcon` som status eller val av ett alternativ, inte som avbockning av en lista med flera: oförändrade.
- Tillagningsläget har inga bockrutor i dag, inget att ändra.
- `CheckCircle` finns kvar som komponent (används i testerna) men ingen skärm använder den längre.

## Verifiering

Enhetstester: tester som utgår från en hopfälld korg sätter `matkoll:basket-open` till `0`. E2E: nytt test i `shopping-look.spec.ts` (bocka av, Ångra i toasten, avbockad rad synlig och överstruken, tryck på rutan bockar av) samt anpassade `shopping`, `put-in-pantry` och `basket-export`; `offers-link` oförändrad och grön. Toasten kan ligga över raden i korgen, så testet för svep väntar tills den försvunnit. Skärmbild vid 375 px (ljust) med 2 kvar och 3 i korgen granskad en gång och inte incheckad.

## Review Triage Log

Ingen separat granskning (liten story). Egen genomgång av skärmbilden: rutorna är lika som i erbjudandena, avbockade rader överstrukna och dämpade, rubrikraden "I korgen (3)" syns. Inga fynd att rätta. Mörkt läge och 200 % text täcks av de befintliga testerna (ingen sidledsscroll).
