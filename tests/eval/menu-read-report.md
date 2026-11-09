# Menyrådgivare, steg 1: läsa menyn (Haiku 5.5 mot Sonnet 5.5)

Genererad av `pnpm eval:menu` (tests/eval/menu-read.eval.ts). Prompt: tests/eval/menu-read-prompt.md. Rådata: tests/eval/menu-read-results/ (ignoreras av git).

Mått: **recall rätter** = andel av sanningens rätter som hittades (fuzzy namnmatchning); **pris rätt** = andel av hittade rätter där pris och valuta stämmer exakt (null väntas där menyn saknar eget pris); **allergen recall/precision** mot allergener som följer av namn/beskrivning (missade allergener är det allvarliga; "inkl. kan_innehåller" räknar en miss som mjuk om modellen åtminstone angav allergenen som osäker; precision är pessimistisk eftersom en riktig men inte sanningsmärkt allergen räknas som fel); **kategori rätt** = kött/fisk/skaldjur/vegetariskt/veganskt; **översättning** = svenska förklaringen innehåller ett av nyckelorden; **parsbar** = giltig JSON enligt schemat (trunkerade svar räknas som fel och som alla rätter missade).

Körningar per bild och konfiguration: 1. Kostnad totalt för sparade körningar: 0.934 USD.

### Alla menyer

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Språk: es

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Språk: en

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Språk: sv

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Sämre bilder (rotation, oskärpa, låg kontrast, JPEG, perspektiv)

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Rena bilder

| Konfiguration | Anrop | Parsbar | Recall rätter | Pris rätt | Grupp rätt | Allergen recall | Allergen recall (inkl. kan_innehåller) | Allergen precision | Kategori rätt | Översättning | Medianlatens | Kostnad/bild |
|---|---|---|---|---|---|---|---|---|---|---|---|---|


### Per meny (recall / pris rätt / missade allergener, summa över körningar)

| Meny | haiku-low | haiku-medium | sonnet-medium |
|---|---|---|---|


### Tokens

- haiku-low: median 1925.5 utdatatokens (varav tänkande 0), 4627 indatatokens
- haiku-medium: median 2152.5 utdatatokens (varav tänkande 0), 4627 indatatokens
- sonnet-medium: median 1963.5 utdatatokens (varav tänkande 0), 4627 indatatokens

### Värsta missarna (allergener först, sedan mest frekventa)

- inga

### Misslyckade anrop (ej parsbara)

- haiku-medium es1-tapas #2: stop_reason max_tokens, 16000 utdatatokens

### Riktiga foton (ingen sanning)

Sparade i menu-read-results/ för ögonkontroll: real-IMG_0778, real-IMG_4569, real-IMG_4719, real-IMG_4737, real-IMG_4738, real-IMG_4739, real-IMG_4776, real-IMG_4804, real-IMG_5042, real-IMG_5043.

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
