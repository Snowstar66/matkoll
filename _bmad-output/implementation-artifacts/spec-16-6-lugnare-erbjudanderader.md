---
title: 'Story 16.6: Lugnare erbjudanderader'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Pontus gillar Toppklipp och elden men tycker raderna är för blaffiga: ett heldraget rött butiksblock, en mintpiller, ett orange Toppklipp-block och en bärnstensbricka staplade i en högerkolumn som är högre än vänstersidan. "Är lite osäker på om alla brickor måste vara starkt röda."

**Approach:** Samma personlighet, ingen färgblock. Butiken blir en liten text med en prick i kedjans färg, priset ren fet text, och Toppklipp en mjukt tonad etikett i metaraden.

## Ändringar

- `offers-list.tsx`: `StoreLabel` ("● Maxi", `ink-3`, pricken `store-ica`/`store-other`) först bland detaljerna: "● Maxi · ICA · Spanien". Högerkolumnen har högst två rader: priset fett i `ink`, under det ordinarie priset genomstruket och rabatten "−50 %" som text i `deal-ink`. "🔥 Toppklipp" (från 30 %) är en liten etikett (`bg-hot/12`, text `hot`, 🔥 aria-dold) först i metaraden; "På listan" flyttad dit så ingen tredje rad staplas. Raden är lika hög som en vanlig listrad (`min-h-row`), sidorna centrerade. Testid och tillgängligt namn ("Aubergine, 12 kr per st, spara 20 %") oförändrade.
- `offers-sheet.tsx`: butiksetiketten skickas bara när filtret är "Alla" och minst två butiker har erbjudanden (förut när två butiker hade länk).
- `contrast.test.ts`: nya par `deal-ink`/`surface`, `hot`/`surface`, `hot` mot sin 12 %-tona, och prickarna mot `surface` (3:1).
- `DESIGN.md`: butiksetiketten och `offer-row` beskrivna om.
- e2e `offers-link`: Toppklipp räknas via `offer-top-tag`; med en butik vald visas ingen butiksetikett.

## Beslut

- Inga nya tokens: `hot` med 12 % täckning ger tonen, `deal-ink` är rabattfärgen som text. "Bäst denna vecka"-raden i arket har kvar sin fyllda butiksbricka (en enda, inte per rad).
- Ingen migration, inget nätverk. Före- och efterbilder (375 px, ljust och mörkt, efter att arket glidit in) togs och raderades; inga bilder committade.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Butiksvillkoret hängde på antalet butiker med länk, inte på vad listan visar; ändrat till vald filtrering och butiker med erbjudanden så en filtrerad lista inte upprepar butiken på varje rad.
- Gamla e2e-kontrollen att varje rad bär butiken vid butiksfilter är ersatt av dess motsats.
- Mörkt läge och 375 px (ingen sidscroll) kontrollerade i bild och i skriptet.
