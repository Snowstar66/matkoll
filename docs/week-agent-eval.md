# Veckoagenten: planeringseval (Haiku 5.5 låg mot Sonnet 5.5 medel)

Genererad av `pnpm eval:week` (tests/eval/week-plan.eval.ts). Fixturer: tests/eval/week-plan/cases.ts (32 recept, sex hushållsfall). Anropen går genom appens egen port (`planWeek`: riktig prompt, schema, parsning) och valideras av appens egen `validatePicks`. Rådata i tests/eval/week-plan-results/ (ignoreras av git). Priser ur appens pristabell (`claudeModels`), 10 kr per USD. Total kostnad för sparade körningar: 0.370 USD.

Mått: **schemagiltigt** = svaret gick att läsa enligt schemat (porten försöker två gånger själv); **utan hårt brott** = andel svar där varje val klarar allergi, dubblett, bestämd dag, vegetarisk dag, antal middagar och att receptet finns i urvalet; **mjuka brott** = snitt per svar (samma sorts rätt två dagar i rad, långsam rätt en vardag, nyligen lagad); **skäl rätt** = andel av modellens faktapåståenden (extrapris, går ut, minuter) som stämmer mot de fakta vi gav den. Allergi kontrolleras alltid i koden, så ett allergibrott i svaret är ett brott som koden fångar, inte något som når användaren.

| Konfiguration | Körningar | Schemagiltigt | Utan hårt brott | Hårda brott totalt | Mjuka brott/svar | Skäl rätt | Mediantid | Kostnad/vecka |
|---|---|---|---|---|---|---|---|---|
| haiku-low | 36 | 100 % | 100 % | 0 | 0.28 | 100 % (0 fel av 167 påståenden, 175 skäl) | 5.5 s | 0.008 kr |
| sonnet-medium | 36 | 100 % | 100 % | 0 | 0.44 | 98 % (3 fel av 196 påståenden, 198 skäl) | 2.4 s | 0.093 kr |

### Per fall (andel körningar utan hårt brott)

| Fall | Vad | haiku-low | sonnet-medium |
|---|---|---|---|
| familj-laktos | Fyra personer, laktosallergi, smaker, 5 middagar, ingenting bestämt | 6/6 utan hårt brott | 6/6 utan hårt brott |
| pannkaka-torsdag | Pannkakor bestämda torsdag, resten planeras runt | 6/6 utan hårt brott | 6/6 utan hårt brott |
| tre-bestamda | Tre bestämda dagar (mån, ons, fre), sex middagar | 6/6 utan hårt brott | 6/6 utan hårt brott |
| vegetarisk-dag | Två vegetariska dagar, snabba vardagar | 6/6 utan hårt brott | 6/6 utan hårt brott |
| lag-budget | Låg budget, extrapriser och utgångsvaror väger tungt, förra veckans rätter undviks | 6/6 utan hårt brott | 6/6 utan hårt brott |
| sju-dagar-glutenfri | Sju middagar minus en hoppa-över-dag och en restdag, gluten- och laktosallergi, en bestämd dag | 6/6 utan hårt brott | 6/6 utan hårt brott |

### Hårda brott

- inga

### Skäl som inte stämde

- sonnet-medium familj-laktos #2: Kikärtsgryta med spenat: "25 min" (tid 35)
- sonnet-medium tre-bestamda #2: Kikärtsgryta med spenat: "25 min" (tid 35)
- sonnet-medium tre-bestamda #5: Kikärtsgryta med spenat: "25 min" (tid 35)

### Misslyckade anrop

- inga

### Hela kedjan (planWithAi, läget plan: Haiku, Sonnet bara vid hårt brott, annars reglerna)

| Fall | Modell som planerade | Sonnet frågades efter Haiku | Tid | Kostnad |
|---|---|---|---|---|
| familj-laktos | haiku-5.5 | nej | 5.9 s | 0.009 kr |
| lag-budget | haiku-5.5 | nej | 6.1 s | 0.010 kr |
| pannkaka-torsdag | haiku-5.5 | nej | 5.6 s | 0.009 kr |
| sju-dagar-glutenfri | haiku-5.5 | nej | 5.1 s | 0.008 kr |
| tre-bestamda | haiku-5.5 | nej | 4.8 s | 0.007 kr |
| vegetarisk-dag | haiku-5.5 | nej | 8.1 s | 0.010 kr |

## Rekommendation

Körd 2026-11-10 med riktiga anrop: 36 körningar per konfiguration (sex fall x sex körningar) plus sex körningar av hela kedjan, totalt 0,37 USD (ca 3,70 kr).

**Haiku 5.5 på låg nivå räcker som standard.** Det är den enda modellen i kedjan som behövs för "Föreslå veckan" och "Gör om":

- 100 % giltiga svar och 0 hårda brott på 36 körningar (Sonnet också 0). Kedjan (Haiku, Sonnet bara vid hårt brott, annars reglerna) gick Haiku-hela-vägen i alla sex fall; Sonnet-återförsöket och regelplanen utlöstes aldrig i den här mätningen.
- Skäl: 0 fel av 167 faktapåståenden hos Haiku (extrapris, "går ut", minuter), 3 fel av 196 hos Sonnet (samma recept, "25 min" i stället för 35). Skälen som visas för användaren byggs ändå i koden ur fakta, så modellens egna skäl är bara en kontroll.
- Mjuka brott: Haiku 0,28 per vecka, Sonnet 0,44 (nästan bara "samma sorts rätt två dagar i rad").
- Kostnad: ca 0,008 kr per vecka med Haiku mot 0,09 kr med Sonnet (elva gånger mer). Med ett tak på några kronor per hushåll och dag är båda försumbara, men Haiku lämnar mest marginal.
- Latens: Haiku 4-8 s (median 5,5 s), Sonnet 1,5-7 s (median 2,4 s). Haiku på låg nivå tänker ändå ca 900 tokens innan den svarar, Sonnet på medel skrev nästan bara svaret (171 tokens). Sonnet är alltså snabbare i den här uppgiften, men Haiku är snabb nog för en knapp med en väntetext. En oprövad förbättring: Haiku med tänkandet avstängt (det tillåter bara Haiku 5.5, se adapters/anthropic.ts), som borde ge 1-2 s; mät den innan den införs.

Tillägg 2026-11-11: faktan "går ut <dag>" som modellen får för sådant som ligger hemma lyder nu "håller till ca <dag>" (dagen är en uppskattning: inlagd dag plus hur länge varan håller, appen har inga bäst-före-datum) och "bör ätas idag". Själva mätningen ovan är inte körd om; evalens faktakontroll godtar båda formuleringarna.

Behåll alltså: Haiku låg först, Sonnet medel för "Gör noggrannare" och som ett återförsök vid hårt brott, reglerna (planDeterministic) sist, och planAroundFixed alltid sist i kedjan.

**Vad mätningen inte visar.** Fixturerna är syntetiska (32 recept, sex fall, urvalet från appens egen buildShortlist, så allergirätter når aldrig modellen) och modellerna hade ett lätt jobb: ingen körning ens nästan gick fel. Den säger att Haiku klarar uppgiften när urvalet är bra, inte hur den beter sig med ett bibliotek på 300 recept, konstiga titlar eller ett urval som saknar vegetariska rätter. "Går ut"-skälen testades med utgångsdagar i fixturerna, men appen skickar för närvarande aldrig någon dag (det som ligger för länge är redan "gammalt", se context.ts), så den delen av prompten är oprövad i riktig drift. Kör om `pnpm eval:week` med hushållets egna recept efter en vecka i drift.
