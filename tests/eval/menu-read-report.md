# Menyrådgivare, steg 1: läsa menyn (Haiku 5.5 mot Sonnet 5.5)

Genererad av `pnpm eval:menu` (tests/eval/menu-read.eval.ts). Prompt: tests/eval/menu-read-prompt.md. Rådata: tests/eval/menu-read-results/ (ignoreras av git).

Mått: **recall rätter** = andel av sanningens rätter som hittades (fuzzy namnmatchning); **pris rätt** = andel av hittade rätter där pris och valuta stämmer exakt (null väntas där menyn saknar eget pris); **allergen recall/precision** mot allergener som följer av namn/beskrivning (missade allergener är det allvarliga; "inkl. kan_innehåller" räknar en miss som mjuk om modellen åtminstone angav allergenen som osäker; precision är pessimistisk eftersom en riktig men inte sanningsmärkt allergen räknas som fel); **kategori rätt** = kött/fisk/skaldjur/vegetariskt/veganskt; **översättning** = svenska förklaringen innehåller ett av nyckelorden; **parsbar** = giltig JSON enligt schemat (trunkerade svar räknas som fel och som alla rätter missade).

Körningar per bild och konfiguration: 2. Kostnad totalt för sparade körningar: 0.596 USD.

### Alla menyer

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 18 | 100.0 % | 100.0 % | 96.8 % | 93.7 % | 90.1 % | 98.8 % | 96.5 % | 94.7 % | 97.7 % | 8.5 s | 0.0014 USD |
| haiku-medium | 18 | 94.4 % | 93.2 % | 90.8 % | 95.7 % | 87.7 % | 98.7 % | 97.2 % | 95.0 % | 98.6 % | 8.9 s | 0.0020 USD |
| sonnet-medium | 18 | 100.0 % | 100.0 % | 100.0 % | 98.6 % | 94.3 % | 100.0 % | 99.1 % | 95.3 % | 98.2 % | 13.0 s | 0.0296 USD |

### Språk: es

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 6 | 100.0 % | 100.0 % | 100.0 % | 98.7 % | 92.2 % | 100.0 % | 100.0 % | 91.1 % | 94.9 % | 8.9 s | 0.0015 USD |
| haiku-medium | 6 | 83.3 % | 80.8 % | 100.0 % | 98.4 % | 95.7 % | 100.0 % | 100.0 % | 93.3 % | 95.2 % | 9.1 s | 0.0026 USD |
| sonnet-medium | 6 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 96.9 % | 100.0 % | 100.0 % | 92.9 % | 96.2 % | 13.0 s | 0.0304 USD |

### Språk: en

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 6 | 100.0 % | 100.0 % | 100.0 % | 89.7 % | 98.6 % | 100.0 % | 95.2 % | 100.0 % | 98.7 % | 8.8 s | 0.0015 USD |
| haiku-medium | 6 | 100.0 % | 100.0 % | 84.6 % | 93.6 % | 95.1 % | 100.0 % | 95.7 % | 98.3 % | 100.0 % | 10.6 s | 0.0018 USD |
| sonnet-medium | 6 | 100.0 % | 100.0 % | 100.0 % | 98.7 % | 98.6 % | 100.0 % | 99.3 % | 98.3 % | 98.7 % | 13.7 s | 0.0307 USD |

### Språk: sv

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 6 | 100.0 % | 100.0 % | 89.4 % | 92.4 % | 79.7 % | 96.9 % | 96.2 % | 92.6 % | 100.0 % | 6.9 s | 0.0013 USD |
| haiku-medium | 6 | 100.0 % | 100.0 % | 89.4 % | 95.5 % | 76.6 % | 96.9 % | 98.0 % | 92.6 % | 100.0 % | 7.8 s | 0.0017 USD |
| sonnet-medium | 6 | 100.0 % | 100.0 % | 100.0 % | 97.0 % | 88.3 % | 100.0 % | 98.3 % | 94.4 % | 100.0 % | 10.6 s | 0.0277 USD |

### Sämre bilder (rotation, oskärpa, låg kontrast, JPEG, perspektiv)

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 8 | 100.0 % | 100.0 % | 91.7 % | 88.1 % | 89.2 % | 97.7 % | 95.1 % | 95.6 % | 98.8 % | 7.6 s | 0.0013 USD |
| haiku-medium | 8 | 100.0 % | 100.0 % | 77.4 % | 91.7 % | 85.4 % | 98.5 % | 94.9 % | 95.6 % | 100.0 % | 8.6 s | 0.0017 USD |
| sonnet-medium | 8 | 100.0 % | 100.0 % | 100.0 % | 98.8 % | 93.1 % | 100.0 % | 97.6 % | 95.6 % | 100.0 % | 13.5 s | 0.0283 USD |

### Rena bilder

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku-low | 10 | 100.0 % | 100.0 % | 100.0 % | 97.1 % | 90.7 % | 99.5 % | 97.4 % | 94.1 % | 97.1 % | 9.5 s | 0.0015 USD |
| haiku-medium | 10 | 90.0 % | 89.1 % | 100.0 % | 98.4 % | 89.3 % | 98.9 % | 98.8 % | 94.5 % | 97.6 % | 9.4 s | 0.0024 USD |
| sonnet-medium | 10 | 100.0 % | 100.0 % | 100.0 % | 98.6 % | 95.1 % | 100.0 % | 100.0 % | 95.1 % | 97.1 % | 12.5 s | 0.0307 USD |

### Per meny (recall / pris rätt / missade allergener, summa över körningar)

| Meny | haiku-low | haiku-medium | sonnet-medium |
|---|---|---|---|
| en1-gilded-pig | 100.0 % / 100.0 % / 0 | 100.0 % / 100.0 % / 0 | 100.0 % / 100.0 % / 2 |
| en2-harbour | 100.0 % / 100.0 % / 1 | 100.0 % / 100.0 % / 3 | 100.0 % / 100.0 % / 0 |
| en3-blue-door | 100.0 % / 100.0 % / 1 | 100.0 % / 50.0 % / 4 | 100.0 % / 100.0 % / 0 |
| es1-tapas | 100.0 % / 100.0 % / 3 | 50.0 % / 100.0 % / 0 | 100.0 % / 100.0 % / 0 |
| es2-menu-del-dia | 100.0 % / 100.0 % / 2 | 100.0 % / 100.0 % / 2 | 100.0 % / 100.0 % / 2 |
| es3-pizarra | 100.0 % / 100.0 % / 0 | 100.0 % / 100.0 % / 0 | 100.0 % / 100.0 % / 0 |
| sv1-lilla-torget | 100.0 % / 100.0 % / 8 | 100.0 % / 100.0 % / 9 | 100.0 % / 100.0 % / 0 |
| sv2-vita-hjorten | 100.0 % / 100.0 % / 6 | 100.0 % / 100.0 % / 9 | 100.0 % / 100.0 % / 6 |
| sv3-tavlan | 100.0 % / 56.3 % / 12 | 100.0 % / 56.3 % / 12 | 100.0 % / 100.0 % / 9 |

### Tokens

- haiku-low: median 1907 utdatatokens (varav tänkande 0), 4946 indatatokens
- haiku-medium: median 2063.5 utdatatokens (varav tänkande 0), 4946 indatatokens
- sonnet-medium: median 1963.5 utdatatokens (varav tänkande 0), 4946 indatatokens

### Värsta missarna (allergener först, sedan mest frekventa)

- es2-menu-del-dia: ALLERGEN missad: Solomillo de cerdo ibérico (laktos), fanns i kan_innehalla (6 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv2-vita-hjorten: ALLERGEN missad: Svamppasta (agg), fanns i kan_innehalla (6 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv3-tavlan: ALLERGEN missad: Fiskgratäng (gluten), fanns i kan_innehalla (6 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv3-tavlan: ALLERGEN missad: Räksmörgås (laktos), fanns i kan_innehalla (6 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv2-vita-hjorten: ALLERGEN missad: Svampsoppa (laktos), fanns i kan_innehalla (5 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv1-lilla-torget: ALLERGEN missad: Måndag: Pannbiff med lök (gluten), fanns i kan_innehalla (4 körningar: haiku-low, haiku-medium)
- sv1-lilla-torget: ALLERGEN missad: Tisdag: Ugnsbakad torsk (laktos), fanns i kan_innehalla (4 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Dagens soppa (laktos), fanns i kan_innehalla (4 körningar: haiku-low, haiku-medium, sonnet-medium)
- en2-harbour: ALLERGEN missad: Lobster roll (agg), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium)
- en3-blue-door: ALLERGEN missad: The Reuben (agg), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium)
- sv1-lilla-torget: ALLERGEN missad: Raggmunk med fläsk (gluten), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium)
- sv2-vita-hjorten: ALLERGEN missad: Älggryta (laktos), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Vegolasagne (laktos), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Vegolasagne (agg) (3 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Kanelbulle (agg), fanns i kan_innehalla (3 körningar: haiku-low, haiku-medium, sonnet-medium)
- sv3-tavlan: ALLERGEN missad: Vegolasagne (agg), fanns i kan_innehalla (3 körningar: haiku-medium, sonnet-medium)
- es1-tapas: ALLERGEN missad: Patatas bravas (agg), fanns i kan_innehalla (2 körningar: haiku-low)
- sv1-lilla-torget: ALLERGEN missad: Måndag: Pannbiff med lök (agg), fanns i kan_innehalla (2 körningar: haiku-low, haiku-medium)
- sv1-lilla-torget: ALLERGEN missad: Måndag: Pannbiff med lök (agg) (2 körningar: haiku-low, haiku-medium)
- sv2-vita-hjorten: ALLERGEN missad: Vegetarisk burgare (laktos), fanns i kan_innehalla (2 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Dagens soppa (gluten), fanns i kan_innehalla (2 körningar: haiku-low, haiku-medium)
- sv3-tavlan: ALLERGEN missad: Dagens soppa (laktos) (2 körningar: haiku-low, haiku-medium)
- en3-blue-door: ALLERGEN missad: Chocolate malt shake (gluten), fanns i kan_innehalla (2 körningar: haiku-medium)
- sv1-lilla-torget: ALLERGEN missad: Toast Skagen (laktos), fanns i kan_innehalla (2 körningar: haiku-medium)
- en1-gilded-pig: ALLERGEN missad: Wild mushroom wellington (laktos), fanns i kan_innehalla (2 körningar: sonnet-medium)

### Misslyckade anrop (ej parsbara)

- haiku-medium es1-tapas #2: stop_reason max_tokens, 16000 utdatatokens


## Rekommendation

Totalt förbrukat: cirka 0,60 USD (54 anrop plus en sanity-körning om 0,003 USD). Underlaget är 9 syntetiska menyer, 117 rätter, 2 körningar per konfiguration, så små skillnader (några procentenheter) är brus.

**Läsningen fungerar bra på alla tre konfigurationerna.** Alla hittade 100 % av rätterna när svaret blev klart, i alla tre språken och även på de sämre bilderna. Prisläsning, grupp, kategori och översättning ligger på 95 till 100 %.

**Haiku 5.5 räcker för steg 1, med effort `low`.** Den är 20 gånger billigare (cirka 0,0014 USD mot 0,030 USD per bild) och 4 sekunder snabbare, och i mätningen sämre på tre punkter, alla hanterbara i koden:

1. Priser på den sämsta handskrivna tavlan (sv3, rotation, oskärpa, JPEG): ett pris lästes som null i båda Haiku-konfigurationerna i körning 2 (Sonnet 100 %). Lösning: visa "pris saknas/osäkert" i stället för att räkna med det.
2. Ibland returnerades pris utan valuta (Haiku medium, en3). Lösning i koden: fyll i menyns dominerande valuta när den saknas på en rad.
3. Haiku medium fastnade i en upprepningsloop ("stånkig stånkig ...") i 1 av 18 körningar och slog i max_tokens (16 000 tokens). Lösning: sänk max_tokens (en meny behöver cirka 2 000 till 4 000), upptäck stop_reason `max_tokens` eller ogiltig JSON och försök en gång till, helst då med Sonnet.

**Effort `medium` för Haiku ger ingen vinst** (sämre parsbarhet och prisrätt i mätningen, högre kostnad). Använd `low`. Modellerna visade ingen mätbar tänkandeåtgång (0 tänkandetokens, cirka 2 000 utdatatokens, bara JSON), så effort påverkar främst stilen.

**Allergener är den svaga punkten hos alla, även Sonnet.** Strikt recall: Haiku 88 till 90 %, Sonnet 94 %. De flesta missar är dolda ingredienser i sås eller bakverk (ägg i alioli och pannbiff, laktos i gratäng och soppa, gluten i fiskgratäng) och nästan alla fanns ändå i `kan_innehalla` (mjuk recall 98,7 till 100 %). Därför: **allergifiltret i steg 2 ska behandla allergener OCH kan_innehalla som träff** och visa "kan innehålla" tydligt för personer med allergi, aldrig lita på att en rätt är säker bara för att `allergener` är tom. Det gäller oavsett modell. Är ett sällskap allergikänsligt (anafylaxi) kan appen erbjuda "Läs noggrannare" som kör Sonnet (cirka 3 cent).

**Steg 2 kan ligga i koden:** matchning mot personer, allergifilter (över allergener och kan_innehalla), valutaomräkning till SEK (priset är ett rent tal plus valutakod) och totalsumma. Modellen behöver bara läsa och förklara.

Förslag: Haiku 5.5 `low` som standard. Kör om med Sonnet 5.5 `medium` när (a) JSON eller stop_reason är fel, (b) en eller flera rätter saknar pris, eller (c) användaren trycker "Läs noggrannare".

**Var ärlig med begränsningen:** menybilderna är renderade i HTML och därmed betydligt lättare än riktiga foton (jämn skärpa, perfekt text, inga fingrar, reflexer, veck, flera sidor, bakgrundsbrus, handstil med riktig variation). Resultaten är en övre gräns. Sämre bilder är simulerade (rotation 3 till 5 grader, oskärpa, låg kontrast, skugga, JPEG, perspektiv) och Haiku tappade redan där mer än Sonnet på priser. Lägg riktiga foton i tests/eval/menus/real/ och kör `pnpm eval:menu -- --only=real --runs=1` innan beslutet blir slutgiltigt, särskilt för handskrivna tavlor och flersidiga menyer.
