# Matkoll – LM Studio

Så här går AI-flödena mot LM Studio på din Mac, och vilka inställningar som rekommenderas. Mätningen gjordes i Story 12.1 natten till 2026-10-27 med Qwen3.6 35B A3B (MLX, 4 bit) på den här Macen (32 GB minne). LM Studio lämnades som det var: du väljer själv om du vill ändra något (öppen fråga 24).

**Rekommendation i korthet:** behåll det du har, alltså kontext 8 192, PARALLEL 4 och ingen TTL, och slå inte på spekulativ avkodning. Det som gör anropen långsamma är inte LM Studios inställningar utan att modellen blir kall efter några minuter utan anrop, och att svaren är långa. Det tas om hand i appen (12.2 väcker modellen, 12.3 kortar svaren och 12.4 kör ett jobb i taget).

## Översikt

| # | Avsnitt |
| --- | --- |
| 1 | Inställningarna före och efter mätningen |
| 2 | Vad som mättes och hur |
| 3 | Resultatet |
| 4 | Vad siffrorna betyder |
| 5 | Rekommendationen |
| 6 | Så ställer du in LM Studio |
| 7 | Så mäter du igen |

## 1. Inställningarna före och efter mätningen

`lms ps` före mätningen (2026-10-26 kl. 22.34) och efter återställningen (2026-10-27 kl. 03.36) visade samma sak:

```
IDENTIFIER              MODEL                   STATUS    SIZE        CONTEXT    PARALLEL    LOAD CONFIG    DEVICE    TTL
qwen/qwen3.6-35b-a3b    qwen/qwen3.6-35b-a3b    IDLE      20.43 GB    8192       4           LM Studio      Local
```

`lms ls` visade två modeller: `qwen/qwen3.6-35b-a3b` (35B, `qwen3_5_moe`, 20,43 GB, laddad) och inbäddningsmodellen `text-embedding-nomic-embed-text-v1.5`. `lms ps --json` gav dessutom `ttlMs: null`, `engineConfigFileEnabled: false` och `vision: true`. Servern lyssnade på `127.0.0.1:1234` hela tiden.

Under mätningen laddades modellen om två gånger, med `lms unload qwen/qwen3.6-35b-a3b` och sedan `lms load qwen/qwen3.6-35b-a3b -c 8192 --parallel 1 -y` respektive samma kommando med `--speculative-draft-mtp`. Till sist laddades den tillbaka med `lms load qwen/qwen3.6-35b-a3b -c 8192 --parallel 4 -y`. Varje laddning tog ungefär 13 s.

## 2. Vad som mättes och hur

Med `pnpm eval:ai` och den gemensamma tidmätningen i `tests/eval/timing.ts`. Varje anrop ger en rad med flöde, läge, tid, token in och ut (från LM Studios `usage`), token per sekund och om svaret var giltigt. Före varje anrop noteras också hur länge modellen hade vilat (`lms ps --json`) och hur mycket minne macOS hade komprimerat (`vm_stat`).

**Flödena:**

| Flöde | Indata |
| --- | --- |
| Bildanalys | Pontus kylfoto (2048 px) och den syntetiska bilden `syntetisk-kyl` |
| Nummer på fotot | Punkterna för varorna efter bildanalysen (6.6) |
| AI-förslag | Lagret i `suggest-dishes.pantry.json` (17 rader) |
| Föreslå andra rätter | Samma lager, med de första förslagens titlar att undvika |
| Import av text | `kycklinggryta` |
| Import av länk | Den sparade sidan `koket-chow-mein` från `tests/fixtures/sites/`, som text och JSON-LD |
| Import av foto | `ugnspannkaka.png` |

**Lägena:**

- **Varm:** tre körningar i rad, direkt efter varandra.
- **Kall:** det första anropet efter minst 15 minuter utan anrop, med Macen vaken (`caffeinate`). Tre gånger för bildanalysen och AI-förslagen, en gång per import. Dessutom en gång efter 5 minuter och en gång efter 30 minuter.
- **Två samtidigt:** bildanalysen av Pontus foto och AI-förslagen startade samtidigt i två processer, tre körningar var, som när två anrop krockar.
- **PARALLEL 4** (det du har), **PARALLEL 1** och **PARALLEL 1 med spekulativ avkodning** (`--speculative-draft-mtp`), alla med kontext 8 192 och utan TTL.

Bildanalys och nummer har temperatur 0 (6.5). Förslag och import har LM Studios standardsampling, så deras svar varierar mellan körningarna.

## 3. Resultatet

Median i sekunder för de giltiga körningarna, med antalet giltiga av alla inom parentes när något inte var giltigt.

| Flöde | Varm, PARALLEL 4 | Varm, PARALLEL 1 | Varm, PARALLEL 1 + MTP | Kall, PARALLEL 4 | Kall, PARALLEL 1 | Två samtidigt, PARALLEL 4 | Två samtidigt, PARALLEL 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bildanalys, Pontus foto | 19,9 | 19,6 | 19,6 | 82,1 (43,3–86,3) | 37,6 (1 körning) | 39,4 | 37,0 |
| Nummer, Pontus foto | 6,4 | 6,2 | 6,2 | 14,6 (6,6–15,2) | 14,4 (1 körning) | 12,1 | – (0 av 3) |
| Bildanalys, `syntetisk-kyl` | 13,0 | 13,0 | 13,0 | – | – | – | – |
| Nummer, `syntetisk-kyl` | 5,1 | 5,1 | 5,1 | – | – | – | – |
| AI-förslag | 45,9 | 51,0 (2 av 3) | 44,0 (2 av 3) | 80,3 (2 av 3) | – | 46,8 (2 av 3) | 43,9 |
| Föreslå andra rätter | 63,6 (2 av 3) | 102,1 (2 av 3) | 45,1 | – | – | 46,0 | 57,2 (2 av 3) |
| Import av text | 30,0 (2 av 3) | 28,0 (2 av 3) | 28,3 | 55,0 (1 körning) | – | – | – |
| Import av länk (sparad sida) | 47,7 (2 av 3) | 43,1 | 44,2 | 74,1 (1 körning) | – | – | – |
| Import av foto | 21,2 | 21,5 | 21,2 | 75,6 (1 körning) | – | – | – |

**Token och fart (varm, median):**

| Flöde | Token in | Token ut | Token per sekund |
| --- | --- | --- | --- |
| Bildanalys, Pontus foto | 1 039 | 872 | 44 |
| Nummer, Pontus foto | 314 | 257 | 40 |
| AI-förslag | 1 155 | 1 800–2 000 | 44 |
| Import av text | 1 621 | 1 230 | 42–44 |
| Import av länk | 2 771 | 1 830–1 910 | 40–43 |
| Import av foto | 1 258 | 715 | 34 |

LM Studio räknar inte bildens token i `usage`: båda fotona ger 1 039 token in.

**Vilad tid före ett anrop med bildanalysen av Pontus foto (PARALLEL 4):** 5 minuter gav 43,7 s, 15 minuter 43,3 s och 82,1 s, 30 minuter 38,2 s och 49 minuter 86,3 s. Varmt tar samma anrop 19,9 s.

**Ogiltiga svar:** alla ogiltiga importer hade fel antal rader enligt testfallet, inget med tiden att göra. Av de 33 anropen till AI-förslagen och "andra rätter" var sju inte giltiga: tre där svaret blev 3 700–4 000 token långt (taket är 4 000) och det nya försöket inte hann klart inom 115 s, två där ett nytt försök efter ett ogiltigt svar inte hann (115 s, och ett kallt som gav `ai_invalid` efter 101,9 s), och två när två anrop gick samtidigt (100 s och 115 s, `ai_unavailable`). Svarens längd varierar mycket med standardsamplingen: 1 470–2 130 token för de flesta, men ibland dubbelt så många.

## 4. Vad siffrorna betyder

**Farten bestäms av svarets längd.** Modellen skriver ungefär 44 token per sekund, med PARALLEL 1 och 4 och med och utan spekulativ avkodning. Ett AI-förslag på 2 000 token tar därför 45 s, och ett på 4 000 token går över budgeten. Kortare svar (12.3) är det som gör AI-förslagen snabbare.

**PARALLEL 1 gör inte ett ensamt anrop snabbare.** Varma tider är desamma inom en sekund. Skillnaden syns bara när två anrop krockar:

- Med **PARALLEL 4** delar de på farten: bildanalysen tog 39 s i stället för 20, numren 12 s i stället för 6, och alla bildanalyser och nummer blev klara. Ett AI-förslag av sex gick över 100 s.
- Med **PARALLEL 1** väntar det andra anropet i LM Studios kö tills det första är klart: den första bildanalysen tog 72 s, och alla tre uppslag av numren gav upp efter sina 30 s, eftersom de väntade bakom ett AI-förslag. Ett "andra rätter" av sex gick över 115 s.

Från 12.4 skickar appen bara ett jobb i taget, så krockarna ska inte hända. Om de ändå gör det, till exempel för att du chattar i LM Studio medan appen arbetar, klarar PARALLEL 4 dem bättre.

**Spekulativ avkodning gör ingen skillnad.** `lms load … --speculative-draft-mtp` laddade utan fel, men fart, token och tider var desamma som utan (44 token per sekund, samma längd på svaren). Antingen används MTP inte för den här modellen i MLX, eller så ger det inget här. Svaren blev inte sämre.

**Kall modell (T10):** macOS komprimerar modellens minne när den inte används, redan efter 5 minuter. Före varje kallt anrop låg 12–17 GB i macOS minneskompressor, och efteråt 1–3 GB. Det kalla anropet packar upp det modellen behöver, och det kostar 18–66 s extra: bildanalysen 38–86 s i stället för 20, AI-förslaget 78–82 s i stället för 46, importen av ett foto 76 s i stället för 21. Mer vilad tid än 5 minuter gör det inte tydligt värre. Det första anropet efter att modellen har laddats tar också ungefär dubbelt så lång tid (40–42 s för bildanalysen).

Modellen är en MoE-modell (35 miljarder parametrar, ungefär 3 miljarder aktiva per token). Ett anrop packar troligen bara upp de delar det använder: numren direkt efter en kall bildanalys tog ibland 14–15 s i stället för 6. Det talar för väckningen i 12.2, som gör ett anrop med flödets egen prompt när en sida med AI öppnas. Om den hjälper mäts i 12.2.

Det fanns 37–52 % fritt minne före de kalla anropen, så det är inte brist på minne. Att stänga andra program hjälper därför troligen inte. LM Studio har ingen inställning i `lms load` för att låsa modellen i minnet, och någon inställning i macOS är inte provad.

**Loggarna:** LM Studios serverlogg i `~/.lmstudio/server-logs/` sparar varje förfrågan, med recepttext och lager. Bilderna kortas i loggen till början och slutet av koden, så inga foton sparas där. Loggen ligger bara på din Mac.

## 5. Rekommendationen

**Behåll kontext 8 192, PARALLEL 4 och ingen TTL. Slå inte på spekulativ avkodning.**

- **PARALLEL 4 i stället för 1:** hypotesen före mätningen var PARALLEL 1, men den gav ingen fart för ett ensamt anrop, och med två samtidiga anrop misslyckades fler (4 av 12 med PARALLEL 1 mot 1 av 12 med PARALLEL 4). Minnet är detsamma (LM Studio uppskattar 26,64 GiB för båda).
- **Ingen TTL:** modellen ska ligga laddad. En urladdad modell måste laddas om (ungefär 13 s) och är sedan långsam på första anropet ändå.
- **Kontext 8 192:** den längsta importen hade 2 771 token in och ungefär 1 900 ut, och ett nytt försök efter ett ogiltigt svar skickar lika mycket igen. Det ryms med marginal.
- **Ingen spekulativ avkodning:** ingen mätbar vinst.

Det som gör skillnad är i appen: väckningen (12.2), kortare AI-förslag (12.3) och ett jobb i taget (12.4).

**Kortare AI-förslag (12.3):** modellen svarar nu med en kortare form av rätterna. Varje receptrad har bara text, mängd, enhet, namn och stegen, och avdelning, plats och enhet för katalogen (`new`) bara för en vara som inte finns i lagret. Räknat med Qwen3.6:s egen tokeniserare (`tokenizer.json` i LM Studios modellmapp) på mockens svar blir tre rätter på en rad 1 073 token i stället för 1 616 (33 % färre), och 905 i stället för 1 274 för "andra rätter" (29 % färre, med en rad mer). Om varje rad har `new` blir det 1 455 token (10 % färre). Indraget JSON kostar ungefär 80 % mer (2 947 token för det gamla svaret); 12.1:s svar på 1 470–2 130 token talar för att modellen redan skriver på en rad, och prompten ber om det. Vid 44 token per sekund är det 12 s kortare än förut, ungefär 34 s i stället för 46 s i median varmt. Taket för svaret sänktes från 4 000 till 3 000 token. Mätningen mot LM Studio är flyttad till Epic 12-mätningen, som görs en gång när epicen är klar: `EVAL_LABEL=epic-12-varm EVAL_RUNS=3 AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/suggest-dishes.eval.ts`. `tests/eval/suggest-report.md` visar då också token ut per anrop och per försök, om något försök kapades vid taket, rader ur lagret per förslag, om svaret var indraget och vilka rader utan `new` som inte fanns i lagret.

## 6. Så ställer du in LM Studio

Kontrollera vad som är laddat:

```bash
~/.lmstudio/bin/lms ps
```

Det rekommenderade (det du har nu):

```bash
~/.lmstudio/bin/lms unload qwen/qwen3.6-35b-a3b
~/.lmstudio/bin/lms load qwen/qwen3.6-35b-a3b -c 8192 --parallel 4 -y
```

Om du ändå vill prova ett anrop i taget, byt `--parallel 4` mot `--parallel 1`. Ange aldrig `--ttl`. Med `--estimate-only` först ser du vad laddningen kräver utan att något ändras; den säger "will fail to load" också för det du har nu, eftersom modellen redan tar minnet, men laddningen lyckas när modellen först är urladdad.

Servern ska bara lyssna på `127.0.0.1`. Appen i molnet når den genom Cloudflare Tunnel (`docs/drift.md`, steg 8).

**Kontroll:** `lms ps` visar `CONTEXT 8192`, `PARALLEL 4` och en tom `TTL`.

## 7. Så mäter du igen

```bash
EVAL_LABEL=parallel-4-varm EVAL_RUNS=3 AI_PROVIDER=lmstudio pnpm eval:ai
```

`EVAL_LABEL` namnger läget och `EVAL_RUNS` säger hur många körningar varje fall får. Rapporterna hamnar i `tests/eval/reports/` (ignoreras av git), och `tests/eval/reports/sammanfattning.md` har medianen per flöde och läge över alla rapporter där. Ett enskilt fall väljs med Vitests `-t`, till exempel `pnpm eval:ai tests/eval/analyze-image.eval.ts -t "syntetisk-kyl, körning"`. För en kall mätning: låt modellen vila minst 15 minuter med Macen vaken och kör `EVAL_RUNS=1`. Rapporten visar hur länge modellen hade vilat och hur mycket minne som var komprimerat.

**Väckningen (Story 12.2):** `tests/eval/warm-up.eval.ts` mäter det första anropet efter vila, med och utan väckning fem sekunder före. Den körs bara när `EVAL_WARM` är satt, och gör ett anrop per flöde (bildanalys med ditt första foto, och AI-förslag):

```bash
EVAL_WARM=utan EVAL_LABEL=kall-utan-vackning AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/warm-up.eval.ts
EVAL_WARM=med EVAL_LABEL=kall-med-vackning AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/warm-up.eval.ts
```

Väckningen har högst 50 s, eftersom ett kallt anrop tar 38–86 s för ett foto innan modellen är vaken (avsnitt 3) och nästan allt det är tiden före den första token: en väckning som bara får några sekunder hinner inte väcka modellen. Appen väcker samma modell högst en gång på tre minuter per användare, och inte strax efter ett riktigt anrop.

Låt modellen vila minst 5 minuter före varje körning. `EVAL_WARM_FLOW=bild` eller `EVAL_WARM_FLOW=forslag` kör bara ett av flödena. Mätningen görs i Epic 12-mätningen i slutet av epicen.

**Strömmen (Story 12.7):** `tests/eval/stream-probe.eval.ts` strömmar förslagen med `streamText` och `Output.array`, tidsstämplar varje rätt och slutet och jämför med `generateText` (giltighet och tid). Den skriver en dom: bygg vidare om första rätten kommer efter högst 80 % av tiden i alla körningar och svaret inte är oftare ogiltigt. Målet för mätningen efter bygget är att första rätten syns efter högst 40 % av tiden för alla tre. Körs i Epic 12-mätningen:

```bash
EVAL_RUNS=3 AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/stream-probe.eval.ts
```

## 8. Slutmätning Epic 12 (2026-10-29)

**Upplägg:** commit `08855d5` med Story 12.1-12.7 sammanslagna i `epic/12-asynkron-ai`. LM Studio `qwen/qwen3.6-35b-a3b`, körd 2026-10-29 mellan 00:00 och 00:33, med `EVAL_RUNS=3` och varm modell.

**12.3, kortare svar för AI-förslag** (`EVAL_LABEL=epic-12-varm`, sex anrop: tre "lagret" och tre "andra rätter"):

| Mått | Före (12.1) | Nu | Mål | Utfall |
|---|---|---|---|---|
| Tid, median | 45,9 s | 33,2 s | högst 40 s | Godkänd |
| Token ut, giltigt enstaka försök | 1 800-2 000 | 1 289, 1 534, 1 357, 1 303 | minst 25 % färre | Gränsfall, ungefär 25-30 % färre |
| Giltiga anrop till slut | 26 av 33 försök | 6 av 6 | inte färre | Godkänd |
| Giltiga försök | 26 av 33 | 6 av 9 | | Sämre |

- Tiderna var 29,8, 35,2, 92,6, 31,2, 39,6 och 29,9 s.
- Inget försök kapades vid taket. Största försöket var 2 169 token, så taket 3 000 står kvar.
- Tre av nio försök var ogiltiga och krävde nytt försök. "lagret" körning 2 behövde tre försök (499 + 2 169 + 1 358 token, 92,6 s) och körning 3 två (411 + 1 294). De korta ogiltiga försöken (omkring 400-500 token) tyder på att svaret avvisas av schemat, kanske de strikta uppräkningarna i `new`. Orsaken är inte analyserad.
- Rader utan `new` som inte fanns i lagret: bara "salt och svartpeppar" (tre rader i körning 3).

**12.2, väckningen** (kall efter ungefär 2,5 timmars vila, sedan 17 minuters vila):

- Första bildanalysen: 92,4 s utan väckning och 31,7 s med, 66 % snabbare (mål minst 20 %). Godkänd.
- Förslagsjämförelsen är inte avgörande. Utan väckning tog den 36,3 s, men den kördes direkt efter bildanropet och modellen var redan varm. Med väckning tog den 101,4 s på grund av nya försök (4 185 token ut), inte en kall modell.
- Slutsats: väckningen blir kvar.

**12.7, strömprovet** (`stream-probe.eval.ts`, tre körningar): domen blev "STOP: ingen strömning".

| Körning | Första rätten | Strömmat svar | `generateText` |
|---|---|---|---|
| 1 | 18,7 s av 27,1 s (69 %) | OGILTIGT | giltigt, 25,6 s |
| 2 | 10,0 s av 23,6 s (42 %) | OGILTIGT | giltigt, 29,6 s |
| 3 | 12,1 s av 28,3 s (43 %) | giltigt | giltigt, 25,6 s |

Första rätten kommer efter ungefär 40-70 % av tiden, men det strömmade svaret är för ofta ogiltigt. Strömningen drogs tillbaka som planerat och T9 är stängd. Provet kan köras om med `stream-probe.eval.ts` om modellen eller AI SDK byts.
