---
name: Matkoll
description: Personlig matplanerare på mobilen. Lugn, luftig och grågrön, där matbilderna står för färgen. Lätt typografi, tre ytnivåer och en enda dämpad röd (Ta bort).
status: final
updated: 2026-11-02
sources:
  - docs/ux/ux-spec.md
  - docs/brief.md
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/ (Epic 11, godkända av Pontus 2026-10-26)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-nytt-utseende.md (Epic 11)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden-v2.md (Epic 9, `offer-chip`)
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/premium-look.html (Epic 19, Premiumlook, godkänd av Pontus 2026-10-31)
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/hjalp-valkomst.html (Epic 20, välkomsttur och hjälp, godkänd av Pontus 2026-11-01)
colors:
  bg: '#F5F7F4'
  surface: '#FFFFFF'
  surface-2: '#FFFFFF'
  fill: '#EAEDEB'
  ink: '#1B2420'
  ink-2: '#56635D'
  ink-3: '#6B7872'
  hairline: '#E8ECE9'
  border: '#DCE2DE'
  accent: '#3E7C62'
  on-accent: '#FFFFFF'
  danger: '#B3261E'
  seg-track: '#E9ECEA'
  seg-on: '#FFFFFF'
  mint: '#DDEFE5'
  mint-ink: '#2C5E48'
  sky: '#DCE9F6'
  sky-ink: '#2E5A85'
  sand: '#F1ECE2'
  sand-ink: '#6E5B3E'
  bg-dark: '#0F1311'
  surface-dark: '#181D1A'
  surface-2-dark: '#202622'
  fill-dark: '#242927'
  ink-dark: '#E6EBE8'
  ink-2-dark: '#A3AFA9'
  ink-3-dark: '#86928C'
  hairline-dark: '#262D29'
  border-dark: '#313934'
  accent-dark: '#6FB394'
  on-accent-dark: '#0F1A15'
  danger-dark: '#E5736A'
  seg-track-dark: '#1A1F1C'
  seg-on-dark: '#2C3430'
  mint-dark: '#1F3A2D'
  mint-ink-dark: '#A8D9BF'
  sky-dark: '#1E3247'
  sky-ink-dark: '#A9C9EA'
  sand-dark: '#3A3326'
  sand-ink-dark: '#DCC9A6'
  store-ica: '#B3261E'
  store-ica-ink: '#FFFFFF'
  store-other: '#4A5751'
  store-other-ink: '#FFFFFF'
  deal: '#FBE3C8'
  deal-ink: '#7A3A00'
  hot: '#B93C0B'
  hot-ink: '#FFFFFF'
  tile-clay: '#F1E3DD'
  tile-lilac: '#E6E1F2'
  store-ica-dark: '#E5736A'
  store-ica-ink-dark: '#2A0B08'
  store-other-dark: '#C3CDC8'
  store-other-ink-dark: '#14201A'
  deal-dark: '#4A3018'
  deal-ink-dark: '#F5CFA0'
  hot-dark: '#F59E6B'
  hot-ink-dark: '#2B1203'
  tile-clay-dark: '#3B2C27'
  tile-lilac-dark: '#2C2840'
  warm: '#D9963F'
  warm-dark: '#E9B872'
  illus-bg: '#EEF4F0'
  illus-bg-dark: '#16211B'
typography:
  family:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif"
  page-title:
    fontSize: 30px
    fontWeight: 600
    letterSpacing: -0.4px
    lineHeight: 36px
  recipe-title:
    fontSize: 26px
    fontWeight: 600
    letterSpacing: -0.3px
    lineHeight: 32px
  section-title:
    fontSize: 20px
    fontWeight: 600
    letterSpacing: -0.2px
    lineHeight: 26px
  step:
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.4
  headline:
    fontSize: 17px
    fontWeight: 600
    lineHeight: 22px
  row-title:
    fontSize: 17px
    fontWeight: 500
    lineHeight: 22px
  item:
    fontSize: 17px
    fontWeight: 400
    lineHeight: 22px
  body:
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  control:
    fontSize: 15px
    fontWeight: 500
    lineHeight: 20px
  meta:
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  section-label:
    fontSize: 13px
    fontWeight: 500
    letterSpacing: 0.5px
    lineHeight: 18px
    textTransform: uppercase
  badge:
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  tab-label:
    fontSize: 11px
    fontWeight: 500
    lineHeight: 13px
  tour-title:
    fontSize: 32px
    fontWeight: 500
    letterSpacing: -0.6px
    lineHeight: 38px
  tour-text:
    fontSize: 17px
    fontWeight: 400
    lineHeight: 25px
rounded:
  xs: 6px
  sm: 10px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 999px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 32px
  gutter-mobile: 20px
  header-top-mobile: 'max(16px, safe-area-inset-top + 8px)'
  tap-min: 44px
  tab-bar-height: '56px + safe-area-inset-bottom'
  side-menu-width: 240px
  breakpoint-desktop: 1024px
  content-max: 720px
  dialog-max: 560px
  thumb-list: 72px
  button-height: 52px
  fixed-action-gap: 12px
  tile-size: 30px
  row-min: 56px
  card-image: 120px
  dish-thumb: 56px
  meter-height: 8px
  meter-height-small: 5px
components:
  tab-bar:
    background: '{colors.surface} 84 % + blur 20px'
    borderTop: '0.5px solid {colors.border}'
    height: '{spacing.tab-bar-height}'
    label: '{typography.tab-label}'
    active: '{colors.accent}'
    inactive: '{colors.ink-3}'
  side-menu:
    width: '{spacing.side-menu-width}'
    background: '{colors.surface}'
    active-background: '{colors.mint}'
    active-text: '{colors.mint-ink}'
    active-icon: '{colors.accent}'
  search-field:
    height: '{spacing.tap-min}'
    radius: '{rounded.md}'
    background: '{colors.surface}'
  filter-pill:
    height: 34px
    radius: '{rounded.pill}'
    padding: '0 14px'
    background: '{colors.surface}'
    text: '{colors.ink-2}'
    background-selected: '{colors.accent}'
    text-selected: '{colors.on-accent}'
  recipe-row:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    padding: '{spacing.3}'
    thumb: '{spacing.thumb-list}'
    thumb-radius: '{rounded.md}'
  status-badge-ok:
    background: '{colors.mint}'
    text: '{colors.mint-ink}'
    radius: '{rounded.sm}'
    padding: '3px 9px'
    font: '{typography.badge}'
  status-badge-missing:
    background: '{colors.sky}'
    text: '{colors.sky-ink}'
    radius: '{rounded.sm}'
    padding: '3px 9px'
    font: '{typography.badge}'
  ai-badge:
    background: '{colors.sand}'
    text: '{colors.sand-ink}'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  heart:
    hitArea: '{spacing.tap-min}'
    on: '{colors.accent}'
    off: '{colors.ink-3}'
  stepper:
    height: '{spacing.tap-min}'
    radius: '{rounded.full}'
    background: '{colors.surface}'
  ingredient-row:
    divider: '1px solid {colors.hairline}'
    have: '{colors.accent}'
    missing: '{colors.sky-ink}'
  check-circle:
    size: 26px
    hitArea: '{spacing.tap-min}'
    border-open: '2px solid {colors.ink-3}'
    fill-done: '{colors.accent}'
  location-card:
    height: 100px
    radius: '{rounded.lg}'
    selected-border: '2px solid {colors.accent}'
  pantry-tag:
    background: '{colors.mint}'
    text: '{colors.mint-ink}'
    radius: '{rounded.full}'
  camera-button:
    background: '{colors.sky}'
    text: '{colors.sky-ink}'
    height: '{spacing.button-height}'
    radius: '{rounded.md}'
  button-primary:
    background: '{colors.accent}'
    text: '{colors.on-accent}'
    height: '{spacing.button-height}'
    radius: '{rounded.md}'
    font: '{typography.row-title}'
  button-secondary:
    background: '{colors.surface}'
    text: '{colors.accent}'
    height: '{spacing.button-height}'
    radius: '{rounded.md}'
  sheet:
    background: '{colors.surface-2}'
    radius: '{rounded.xl} {rounded.xl} 0 0'
    desktop-max-width: '{spacing.dialog-max}'
  notice:
    background: '{colors.sky}'
    text: '{colors.sky-ink}'
    radius: '{rounded.md}'
  toast:
    background: '{colors.ink}'
    text: '{colors.surface}'
    action: '{colors.mint}'
    radius: '{rounded.md}'
  category-header:
    label: '{typography.section-label}'
    text: '{colors.ink-2}'
    count: '{colors.ink-2}'
    gap: '{spacing.3}'
  category-tile:
    size: '{spacing.tile-size}'
    radius: '{rounded.sm}'
    fruit-veg: '{colors.mint}'
    bread: '{colors.sand}'
    dairy-eggs: '{colors.sky}'
    meat-fish: '{colors.tile-clay}'
    frozen: '{colors.sky}'
    pantry: '{colors.sand}'
    sauces: '{colors.sand}'
    drinks: '{colors.tile-lilac}'
    other: '{colors.border}'
  list-group:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    divider: '1px solid {colors.hairline}'
  list-row:
    minHeight: '{spacing.row-min}'
    padding: '{spacing.3} {spacing.2} {spacing.3} {spacing.4}'
    title: '{typography.row-title}'
    meta: '{typography.meta}'
    meta-text: '{colors.ink-3}'
  trash-button:
    size: '{spacing.tap-min}'
    radius: '{rounded.md}'
    icon: '{colors.ink-3}'
    pressed: '{colors.hairline}'
  meter:
    height: '{spacing.meter-height}'
    height-small: '{spacing.meter-height-small}'
    track: '{colors.hairline}'
    fill: '{colors.accent}'
    radius: '{rounded.full}'
  progress-row:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    padding: '{spacing.4}'
  product-chip:
    background: '{colors.sky}'
    text: '{colors.sky-ink}'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  offer-chip:
    background: '{colors.mint}'
    text: '{colors.mint-ink}'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  store-badge:
    background: '{colors.store-ica}'
    text: '{colors.store-ica-ink}'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  store-badge-other:
    background: '{colors.store-other}'
    text: '{colors.store-other-ink}'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  recipe-card:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    image-height: '{spacing.card-image}'
    padding: '{spacing.3}'
  image-badge:
    background: '{colors.surface} 92 %'
    radius: '{rounded.sm}'
    font: '{typography.badge}'
  dish-card:
    background: '{colors.surface}'
    radius: '{rounded.lg}'
    thumb: '{spacing.dish-thumb}'
    thumb-radius: '{rounded.md}'
    padding: '{spacing.3}'
  basket-row:
    text: '{colors.ink-2}'
    action: '{colors.accent}'
  app-icon:
    background: '{colors.bg}'
    motif: 'morot i {colors.accent} och sand'
  job-row:
    background: '{colors.surface}'
    text: '{colors.ink-2}'
    border: '{colors.hairline}'
    min-height: '{spacing.tap-min}'
  tab-badge:
    background: '{colors.accent}'
    text: '{colors.surface}'
    font: '{typography.badge}'
    radius: '{rounded.full}'
---

## Brand & Style

Den här filen och `EXPERIENCE.md` gäller före skisserna i `docs/ux/skisser/` när de inte stämmer överens.

**Skisserna för Epic 11 (nytt utseende).** Pontus godkände tre skisser 2026-10-26, och de visar hur appen ska se ut i mobilen:

- [`mockups/matkoll-mobil.html`](mockups/matkoll-mobil.html): hela appen (Recept, Matsedel, Inköpslista, Lagersaldo och appen på hemskärmen). "ja nu börjar du verkligen hitta ux som app. bravo. håll den stilen".
- [`mockups/lagersaldo.html`](mockups/lagersaldo.html): Lagersaldo med kategorier och soptunna. "ja mycket snyggare enl din skiss".
- [`mockups/inkopslista.html`](mockups/inkopslista.html): Inköpslistan med framsteg och "I korgen". "inköpslistan börjar bli mkt bättre".

Skisserna är ritade med hårdkodade värden och påhittade varor. När en skiss och den här filen eller `EXPERIENCE.md` inte stämmer överens gäller de här två filerna (spine-dokumenten). Det gäller till exempel de exakta måtten, ikonen för Såser & smaksättare, "Ny"-etiketten, källan "från fotot" och gnistorna på AI-knappen, som inte följer med.

Matkoll är ett lugnt verktyg för vardagen, inte en matblogg. Förebilderna är Mela (enhetligt receptformat, lugn layout där matbilderna står för färgen), Crouton (ordnade samlingar) och Mealime (raka flöden). Principerna lånas, inte utseendet.

Känslan är Apple-lik: systemtypsnitt, ljus grågrön botten, vita kort, mycket luft och rundade hörn. Färg betyder något: grönt för det som är klart eller går att göra, blått för det som saknas, sand för skafferi och AI. Allt som inte hjälper Pontus att planera, handla eller laga mat tas bort.

## Colors

Ljust läge följer `docs/ux/ux-spec.md`, med de nya rollerna från Premiumlook (Epic 19). Mörkt läge är designat, inte inverterat: tre ytnivåer (sida `#0F1311`, yta `#181D1A`, lyft yta `#202622`), mjukare vit text `#E6EBE8`, och samma kontrastkrav i båda lägena. Det följer systemets inställning. `[ANTAGANDE: de mörka värdena är Claudes härledning; alla textpar är kontrollerade mot 4,5:1]`

- **Bakgrund (`{colors.bg}`)** är sidbakgrunden. Den är ljust grågrön så att vita kort syns utan skuggor.
- **Yta (`{colors.surface}`)** används för kort och listor (nivå 1). **`{colors.surface-2}`** är nivå 3 för ark, menyer och toast: samma vit i ljust läge, en lyft yta i mörkt. Flikfältet och den hopfällda rubriken är nivå 2: 84 % yta över en oskärpa på 20 px med en hårfin linje. **`{colors.fill}`** är spår och fält inne i ark (ink 6 % / 8 %).
- **Segment (`{colors.seg-track}`, `{colors.seg-on}`)**: grå skena och en platta för det valda; den mörka plattan är tydligt ljusare än skenan.
- **Text (`{colors.ink}`, `{colors.ink-2}`, `{colors.ink-3}`)**: `ink` för rubriker och varunamn, `ink-2` för brödtext och mängder, `ink-3` för metadata, inaktiva flikar och kanter på kontroller (omarkerad bock, inmatningsfält), som behöver minst 3:1 mot bakgrunden (WCAG 1.4.11). `ink-3` får bara ligga på `surface` (4,6:1). På `bg` når den bara 4,3:1, så text direkt på sidbakgrunden använder `ink-2`.
- **Accent (`{colors.accent}`)** är den enda starka färgen: primärknappar, aktiv flik, valt filter, bocken på avbockade poster och ramen på valt platskort. Den används inte som dekor.
- **Mint (`{colors.mint}` / `{colors.mint-ink}`)** betyder "finns" eller "går att laga": "Kan lagas nu", "Finns hemma"-etiketter och platskortet Kyl.
- **Ljusblått (`{colors.sky}` / `{colors.sky-ink}`)** betyder "saknas" eller "obs": "Saknar N varor", blå ring på saknade ingredienser, sekundärknappar, kameraknappen, platskortet Frys och alla varnings- och felmeddelanden.
- **Dämpad röd (`{colors.danger}`, Story 16.17):** endast för Ta bort i Lagervara-bladet (text och papperskorg, aldrig fylld knapp). Pontus 2026-10-31: "dämpad röd endast för Ta bort". Det är det enda undantaget från att fel och varningar är ljusblå; mörkt läge har eget värde (`danger-dark`).
- **Sand (`{colors.sand}` / `{colors.sand-ink}`)** används för platskortet Skafferi och märkningen av AI-förslag.
- **Butiksetikett (Story 9.13, lugnad i Story 16.6, `store-badge`):** på varje erbjudanderad en liten text med butikens korta namn ("Maxi", "Krokom") i `{colors.ink-3}`, med en liten prick (8 px) i kedjans färg framför: ICA `{colors.store-ica}` (varm röd), varje annan kedja `{colors.store-other}`. Etiketten står först i radens metarad ("● Maxi · ICA · Spanien") och visas bara när listan visar mer än en butik (filtret "Alla" med två butiker eller fler). Färgen finns bara i pricken; butikens namn är text. Mörkt läge har egna värden. En ny kedja (Willys) får en egen prickfärg när den läggs till.
- **Kategoriplattor (Epic 11):** den lilla plattan bakom kategorins ikon har en ljus ton: mint, ljusblått, sand, `{colors.tile-clay}` (lera, en ljus beige) eller `{colors.tile-lilac}` (syren), och `{colors.border}` för Övrigt. Fördelningen står under `category-tile`. Plattan är dekor: kategorins namn står alltid bredvid, och färgen betyder ingenting. Lera och syren används inte till något annat. I mörkt läge har de egna mörka värden, och mint, ljusblått och sand har sina mörka värden som förut.
- **Varm ton och linjebilder (Epic 20):** `{colors.warm}` (ljust #D9963F, mörkt #E9B872) är den enda varma detaljen i linjebilderna i två toner (rundturen, hjälpens ikoner) och i stjärnorna i Betygsätt. Den är bara dekor, aldrig text och aldrig en yta, så den ingår inte i kontrasttestets textpar. `{colors.illus-bg}` är den mjuka runda plattan bakom en linjebild och plattan bakom en tvåtonsikon. Rundturens bakgrund är `{colors.surface}` i ljust läge (rent vitt) och `{colors.bg}` i mörkt (`--tour-bg`).

Det enda röda är `{colors.danger}`, den dämpade röda för Ta bort: bara text och ikon (soptunna), aldrig en fylld knapp eller bakgrund (6,5:1 ljust, 5,1:1 mörkt). Butiksprickens ICA-röda och de varma erbjudandefärgerna är dekor. Fel och varningar är fortfarande blå. Inga gradienter. Färgen i gränssnittet kommer från matfotona och de små kategoriplattorna.

## Typography

En familj: systemtypsnittet (San Francisco på Apple-enheter), med Inter som reserv.

Vikter efter roll, och aldrig 700: **400** för allt man läser, **500** för det man trycker på och för radtitlar, **600** för rubriker och knappar. Storlekarna är rem-baserade i bygget (px nedan vid 100 %), så raderna växer med textstorleken. Siffror i mängder och tabeller har `font-variant-numeric: tabular-nums`.

| Roll | Token | Storlek / vikt | Används för |
| --- | --- | --- | --- |
| Sidrubrik | `{typography.page-title}` | 30/36 · 600 | Recept, Matsedel, Inköpslista, Matvaror, Förråd |
| Receptrubrik | `{typography.recipe-title}` | 26/32 · 600 | Receptvy och förhandsgranskning |
| Arkrubrik, avsnitt | `{typography.section-title}` | 20/26 · 600 | Rubrik i ark, avsnitt |
| Steg | `{typography.step}` | 24/1,4 · 500 | Stegläge, läsbart på en armlängds avstånd |
| Liten rubrik | `{typography.headline}` | 17/22 · 600 | Hopfälld sidrubrik, framsteg, knapptext |
| Radrubrik | `{typography.row-title}` | 17/22 · 500 | Recepttitlar i listor, radtitlar |
| Listpost | `{typography.item}` | 17/22 · 400 | Varor, ingredienser, inställningsrader |
| Brödtext | `{typography.body}` | 16/24 · 400 | Löpande text, steg i receptvyn |
| Kontroll | `{typography.control}` | 15/20 · 500 (vald 600) | Chips, segment, små textknappar |
| Metadata | `{typography.meta}` | 14/20 · 400 | Tid, portioner, källa, vilken rätt en listpost kommer från |
| Sektionsrubrik | `{typography.section-label}` | 13/18 · 500, versaler +0,5 | Butiksavdelningar, "Ingredienser" |
| Etikett | `{typography.badge}` | 12/16 · 500 | Statusetiketter och AI-märkning |
| Flik | `{typography.tab-label}` | 11/13 · 500 (vald 600) | Flikfältet |
| Rundturens rubrik | `{typography.tour-title}` | 32/38 · 500, −0,6 | Välkomstturen (Epic 20, beslut 10): lättare, mer keynote |
| Rundturens text | `{typography.tour-text}` | 17/25 · 400 | Meningen under rubriken i välkomstturen, i `{colors.ink-2}` |

Webbläsarens textförstoring ska fungera fullt ut. Ingen text är mindre än 11 px.

## Layout & Spacing

Skala: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px (bas 4, rytm 8). Alla kontrollhöjder är multiplar av 4. Mobilen har `{spacing.gutter-mobile}` sidmarginal och `{spacing.header-top-mobile}` luft ovanför sidrubriken (16 px i en webbläsarflik, under notchen på hemskärmen, 40 px på dator). Flikfältet är 56 px plus säkra området. På mobil är layouten en kolumn, från 375 px bredd.

Från `{spacing.breakpoint-desktop}` blir innehållet högst `{spacing.content-max}` brett. Vad som ändras vid brytpunkten står i `EXPERIENCE.md` under Responsive & Platform. `[ANTAGANDE: brytpunkt 1024 px]`

Fasta knappar längst ned ligger `{spacing.fixed-action-gap}` ovanför flikfältet och håller sig innanför iPhones säkerhetsmarginal.

## Elevation & Depth

Tre nivåer: sidan (`{colors.bg}`), kort och listor (`{colors.surface}`, ingen skugga) och det som flyger över sidan. Djupet kommer främst från tonskillnaden mellan sida och yta och från hårfina avdelare i `{colors.hairline}`. Flikfältet och den hopfällda rubriken är halvgenomskinliga (84 % yta, oskärpa 20 px, 0,5 px linje). Ark, menyer och toast ligger på `{colors.surface-2}`.

Det finns exakt **en** skugga, `--shadow-float` (`0 12px 32px rgb(27 36 32 / .14), 0 0 0 .5px rgb(27 36 32 / .08)`), och den är bara för det som flyger över sidan: ark som dialog på dator, menyer och toasten. Mörkt läge använder ingen skugga (den syns inte) utan en ljusare yta och en hårfin ljus kant. Ark och dialoger lägger också en slöja (40 % `{colors.ink}`, 60 % svart i mörkt) över sidan.

## Shapes

Mjuka, generösa hörn enligt `rounded`-tokens (6 / 10 / 12 / 16 / 24 / rund) och komponenternas tokens ovan. Bockar, portionsväljare, hjärtan och etiketter för obegränsade varor är helt runda. Receptvyns toppbild går kant i kant utan rundning upptill.

## Components

Samma komponenter, i samma ordning och med samma namn, finns i `EXPERIENCE.md` under Component Patterns. Tokennyckeln står inom parentes.

- **Flikfält** (`tab-bar`): fem flikar (Recept, Matsedel, Inköpslista, Matvaror, Förråd) med linjeikon (bok, kalender, kundvagn, morot, låda) och etikett, 56 px höga plus säkra området, halvgenomskinliga med en 0,5 px linje upptill. Vald flik: grön ikon med svag grön fyllning (16 %) och etikett 600, ingen platta eller ruta. Fokusringen (2 px grön, bara vid tangentbord) ritas runt ikon och etikett. En etikett som inte får plats bryts på två rader mellan orddelarna (Mat/sedel, Inköps/lista, Lager/saldo), aldrig mitt i en del. Aktiv flik i `{colors.accent}`, övriga i `{colors.ink-3}`. Emoji finns inte i ramen; de stannar bara där de är innehåll (matkategorier, rum, receptbilder som saknas).
- **Sidomeny** (`side-menu`): samma fem mål och linjeikoner som flikfältet, i en lista, plus Inställningar längst ned. Aktivt mål har `{colors.mint}`-bakgrund och `{colors.mint-ink}`-text i vikt 500 (accent på mint ger bara 4,1:1).
- **Sökfält** (`search-field`): vitt fält med förstoringsglas och platshållartext i `{colors.ink-3}`.
- **Filterpiller** (`filter-pill`): Alla, Favoriter, Kan lagas nu. Valt piller fylls med `{colors.accent}`.
- **Receptrad** (`recipe-row`): kort med bild (`{spacing.thumb-list}` i kvadrat), titel i `{typography.row-title}`, "35 min · 4 portioner" i `{typography.meta}` och en statusetikett.
- **Statusetikett** (`status-badge-ok`, `status-badge-missing`): "Kan lagas nu" i mint, "Saknar N varor" i ljusblått.
- **AI-etikett** (`ai-badge`): "AI-förslag" i sand.
- **Hjärta** (`heart`): ifyllt i `{colors.accent}` för favorit, kontur i `{colors.ink-3}` annars.
- **Portionsväljare** (`stepper`): rund stegräknare med − och + och "4 portioner" i mitten.
- **Ingrediensrad** (`ingredient-row`): grön bock i `{colors.accent}` om varan finns hemma, blå ring i `{colors.sky-ink}` om den saknas. Mängden står till höger, i `{colors.sky-ink}` om varan saknas.
- **Listpost** (`check-circle`): rund bock (26 px synlig, 44 px tryckyta) till vänster, varunamn och "från Krämig kycklinggryta" under, mängd till höger. Avbockad post: bocken fylls med `{colors.accent}` och texten blir `{colors.ink-3}` och genomstruken.
- **Platskort** (`location-card`): tre kort i rad (Kyl mint, Frys ljusblått, Skafferi sand) med ikon, namn och "12 varor". Valt kort har 2 px ram i `{colors.accent}`.
- **Etikett för obegränsad vara** (`pantry-tag`): piller i `{colors.mint}` med `{colors.mint-ink}`-text under "Finns hemma".
- **Kameraknapp** (`camera-button`): ljusblå knapp i full bredd med kameraikon.
- **Primärknapp** (`button-primary`) och **sekundärknapp** (`button-secondary`): `{spacing.button-height}` höga. Primär i accent med text 17/600, sekundär vit (`{colors.surface}`) med grön text, så att blått bara betyder "saknas". Högst en primärknapp per vy.
- **Fast åtgärdsknapp**: en primär- eller sekundärknapp i full bredd, fäst längst ned (se Layout & Spacing).
- **Ark** (`sheet`): glider upp nedifrån för Importera recept, Lägg till rätt, Listpostdetalj, Lagervara och bekräftelser. På dator en dialog i mitten, högst `{spacing.dialog-max}` bred.
- **Meddelanderuta** (`notice`): `{colors.sky}`-bakgrund, `{colors.sky-ink}`-text, ikonen "i" och en åtgärdsknapp när det finns en väg vidare.
- **Kort bekräftelse** (`toast`): mörk remsa nederst, ovanför flikfältet, med text i `{colors.surface}` och eventuell knapp "Ångra" i `{colors.mint}`.
- **Lagerförslag**: receptrad-liknande kort med varunamn, mängd och plats, och tre knappar i rad: Bekräfta (primär), Rätta och Avvisa (textknappar).

Från Epic 11 (skisserna ovan):

- **Kategorirubrik** (`category-header`, `category-tile`): en platta på `{spacing.tile-size}` med kategorins ikon (emoji), kategorins namn i `{typography.section-label}` och antalet längst till höger, båda i `{colors.ink-2}` direkt på sidbakgrunden. Används i Lagersaldo och Inköpslista. Kategorierna, ikonerna och plattornas färger:

  | Kategori | Ikon | Platta |
  | --- | --- | --- |
  | Frukt & grönt | 🥦 | mint |
  | Bröd | 🍞 | sand |
  | Mejeri & ägg | 🥛 | ljusblå |
  | Kött, fisk & chark | 🥩 | lera |
  | Frys | ❄️ | ljusblå |
  | Skafferi | 🥫 | sand |
  | Såser & smaksättare | 🧂 | sand |
  | Dryck | 🥤 | syren |
  | Övrigt | 🛍️ | `border` |

- **Listgrupp** (`list-group`): ett vitt kort med `{rounded.lg}` och hårfina avdelare mellan raderna. Raderna under en kategorirubrik ligger i en listgrupp.
- **Listrad** (`list-row`): minst `{spacing.row-min}` hög. Namnet i `{typography.row-title}` och raden under i `{typography.meta}` och `{colors.ink-3}`, på en rad med "…" när den inte får plats. Till vänster kan en rund bock stå, och till höger en soptunna eller en produktetikett.
- **Soptunna** (`trash-button`): en grå soptunna (linjeikon) i en tryckyta på `{spacing.tap-min}`, utan ram. Ytan blir `{colors.hairline}` vid tryck eller hovring.
- **Mätare** (`meter`): ett runt spår i `{colors.hairline}` med en fyllning i `{colors.accent}`. `{spacing.meter-height}` i framstegsraden och `{spacing.meter-height-small}` i rättkort.
- **Framstegsrad** (`progress-row`): ett vitt kort överst i Inköpslistan med "8 varor kvar" (fet) och "6 av 14 i korgen" (`{colors.ink-3}`) på en rad, och mätaren under.
- **Produktetikett** (`product-chip`): ljusblå etikett med produktvalets namn till höger på en listpost, avkortad med "…".
- **Korgrad** (`basket-row`): raden "6 varor i korgen" i `{colors.ink-2}` med textknappen "Visa" i `{colors.accent}`, under listans sista kategori.
- **Receptkort** (`recipe-card`): ett vitt kort med bilden överst i full bredd och `{spacing.card-image}` hög, och titeln och "35 min · 4 portioner" under. Statusetiketten ligger nere till vänster på bilden och hjärtat nere till höger, båda på en ljus platta (`image-badge`, `{colors.surface}` till 92 %) så att de syns på alla bilder. Ett recept utan bild får platshållaren i mint som förut.
- **Rättkort** (`dish-card`): ett vitt kort med en bild på `{spacing.dish-thumb}`, titeln, raden "6 av 8 hemma" och en liten mätare. Portionsväljaren står under.
- **Appikon** (`app-icon`): en morot i accent och sand på `{colors.bg}`, med iPhones egna rundade hörn. Ingen text i ikonen.

Från Epic 12 (AI i bakgrunden):

- **Jobbrad** (`job-row`): en vit remsa i full bredd direkt ovanför flikfältet, med en hårfin linje överst, minst `{spacing.tap-min}` hög. Texten "AI: Tittar på fotot av kylen · 2 i kö" i `{typography.meta}` och `{colors.ink-2}`, avkortad med "…", och en liten pil till höger. En lugn, pulserande prick i `{colors.accent}` till vänster visar att något pågår; med "Minska rörelse" står pricken still. På dator ligger raden överst i sidomenyn.
- **Välkomsttur** (Story 20.1): sex sidor helskärm på mobil (utan flikfält) och en dialog på `{spacing.dialog-max}` × 680 px med `--shadow-float` över den tonade appen på dator. Varje sida: en linjebild (inline-SVG, 2,4 px linje i `{colors.accent}` med en detalj i `{colors.warm}`, på en rund `{colors.illus-bg}`-platta), rubriken i `{typography.tour-title}` och en mening i `{typography.tour-text}`, högst 310 px bred. Nederst sex prickar (den aktiva en 22 px kapsel i `{colors.accent}`) och Fortsätt (primärknapp); Hoppa över i `{colors.ink-2}` uppe till höger. Sista sidan har i stället tre valkort (`{colors.surface}`, hårfin kant, en 44 px `{colors.illus-bg}`-platta med tvåtonsikon, titel, en rad och ›). Rörelse: sidorna glider 460 ms, linjerna ritas fram 1,1 s, texten tonar upp 12 px; med "Minska rörelse" tonar sidan bara in.
- **Tvåtonsikon** (`icons-duo.tsx`): samma 24 px rutnät och 1,8 px linje som linjeikonerna, i `{colors.accent}` med en detalj i `{colors.warm}`. Bara som dekor bredvid text.
- **Flikmärke** (`tab-badge`): en rund etikett i `{colors.accent}` med siffran i `{colors.surface}`, minst 18 px, uppe till höger på flikens ikon. Aldrig rött. Över 9 står "9+".

Från Epic 9 (veckans erbjudanden):

- **Erbjudandeetikett** (`offer-chip`): en liten etikett i `{colors.mint}` med `{colors.mint-ink}`-text, samma form som produktetiketten, med varan och priset: "Falukorv 29 kr". Avkortad med "…". På en listpost står den först på raden under namnet, på ett receptkort eller rättkort under titeln (högst två och "+N"). Mint skiljer den från produktetiketten (ljusblå) och AI-etiketten (sand). Ingen ikon och ingen emoji.
- **Veckans erbjudanden** byggs bara av befintliga komponenter: Ark, Kategorirubrik, Listgrupp, Listrad, Soptunna, Meddelanderuta, kort bekräftelse, primärknapp och textknappar. Inga nya tokens utöver `offer-chip` och, från Story 9.15, `deal` och `hot`.
- **Erbjudanderad** (`offer-row`, Story 9.12, lugnad i Story 16.6): en Listrad lika hög som en vanlig listrad, sidorna lodrätt centrerade, avstånd i 4/8 px. Till vänster en kryssruta (Krysscirkel, 44 px) med namnet "Aubergine, 12 kr per st, spara 20 %". Rad ett är produktnamnet rensat från märke och ursprungsland; metaraden under är liten och `{colors.ink-3}` med, i ordning: "🔥 Toppklipp" (från 30 %, en liten mjukt tonad etikett: `{colors.hot}` som text på `{colors.hot}` i 12 % täckning, 🔥 som aria-dold text), "På listan", butiksetiketten (se ovan, bara vid flera butiker), landet och märket, Stammis, villkor och sista dag. Till höger högst två rader: priset ("15 kr/kg", "2 för 25 kr") i fet `{colors.ink}` utan bakgrund, och under det i liten `{colors.ink-3}` det ordinarie priset genomstruket följt av rabatten "−50 %" som text i `{colors.deal-ink}` (ingen bricka). Inga heldragna färgblock på raden; varm färg finns bara i Toppklipp-etiketten, rabatttexten och butikspricken. Överst i listan står "Veckans fynd" med antalet Toppklipp. Allt som saknas (pris, ordinarie pris, rabatt) utelämnas. Raden håller 375 px utan sidscroll. Kontrast: `deal-ink` och `hot` mot `surface`, och `hot` mot sin 12 %-tona, är minst 4,5:1; prickarna minst 3:1 (`tests/design/contrast.test.ts`).

## Do's and Don'ts

| Gör | Gör inte |
| --- | --- |
| Använd blått för "saknas", varningar och fel | Använd rött till något annat än Ta bort (`{colors.danger}`, bara text och ikon) |
| Låt matbilderna stå för färgen | Lägg till dekorativa illustrationer, gradienter eller mönster |
| Skapa djup med `bg` mot `surface`, och `{colors.surface-2}` för det som lyfts | Använd fler skuggor än `--shadow-float`, eller någon skugga på kort och listor |
| Använd vikt 400, 500 och 600 efter roll | Använd vikt 700, eller halvfet text som inte är rubrik eller knapp |
| Använd linjeikoner i ramen (flikar, meny, knappar) | Använd emoji i ramen |
| Använd en accentfärg, för handling och "klart" | Låt en färg betyda en kategori; plattorna är dekor och namnet står alltid bredvid |
| Ge varje kategori en ljus platta med ikon (Epic 11) | Använd emoji någon annanstans än i kategoriplattorna, eller lägg en egen ikon på varje vara |
| Gör Ta bort i `{colors.danger}` som text och soptunna, sist under en hårfin linje | Gör borttagning till en fylld röd knapp, eller lägg en kontrollfråga på en borttagning som går att ångra |
| Gör tryckytor minst 44 × 44 px | Använd små ikonknappar utan luft runt |
| Märk AI-innehåll med sand-etiketten | Blanda AI-förslag med sparade recept utan märkning |
| Visa alla recept i samma format oavsett källa | Behåll källsajtens typsnitt, färger eller layout |
