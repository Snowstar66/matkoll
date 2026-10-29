---
name: Matkoll
description: Personlig matplanerare på mobilen. Lugn, luftig och grågrön, där matbilderna står för färgen. Inget rött.
status: final
updated: 2026-10-26
sources:
  - docs/ux/ux-spec.md
  - docs/brief.md
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/ (Epic 11, godkända av Pontus 2026-10-26)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-nytt-utseende.md (Epic 11)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden-v2.md (Epic 9, `offer-chip`)
colors:
  bg: '#F5F7F4'
  surface: '#FFFFFF'
  ink: '#1B2420'
  ink-2: '#56635D'
  ink-3: '#6B7872'
  hairline: '#EEF1EF'
  border: '#E3E8E4'
  accent: '#3E7C62'
  on-accent: '#FFFFFF'
  mint: '#DDEFE5'
  mint-ink: '#2C5E48'
  sky: '#DCE9F6'
  sky-ink: '#2E5A85'
  sand: '#F1ECE2'
  sand-ink: '#6E5B3E'
  bg-dark: '#121714'
  surface-dark: '#1B211E'
  ink-dark: '#E8EDEA'
  ink-2-dark: '#A9B5AF'
  ink-3-dark: '#8E9A94'
  hairline-dark: '#262E2A'
  border-dark: '#2F3833'
  accent-dark: '#6FB394'
  on-accent-dark: '#0F1A15'
  mint-dark: '#1F3A2D'
  mint-ink-dark: '#A8D9BF'
  sky-dark: '#1E3247'
  sky-ink-dark: '#A9C9EA'
  sand-dark: '#3A3326'
  sand-ink-dark: '#DCC9A6'
  store-ica: '#F1E3DD'
  store-ica-ink: '#6B4A3E'
  store-other: '#E9EDEA'
  store-other-ink: '#4A5751'
  tile-clay: '#F1E3DD'
  tile-lilac: '#E6E1F2'
  store-ica-dark: '#3B2C27'
  store-ica-ink-dark: '#E6C9BC'
  store-other-dark: '#2A322E'
  store-other-ink-dark: '#C3CDC8'
  tile-clay-dark: '#3B2C27'
  tile-lilac-dark: '#2C2840'
typography:
  family:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif"
  page-title:
    fontSize: 34px
    fontWeight: 700
    letterSpacing: -0.5px
    lineHeight: 1.1
  recipe-title:
    fontSize: 28px
    fontWeight: 700
    letterSpacing: -0.4px
    lineHeight: 1.15
  step:
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.4
  row-title:
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.35
  section-label:
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 0.4px
    textTransform: uppercase
  badge:
    fontSize: 12px
    fontWeight: 600
  tab-label:
    fontSize: 11px
    fontWeight: 500
rounded:
  sm: 10px
  md: 14px
  lg: 18px
  xl: 24px
  pill: 17px
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
  header-top-mobile: 56px
  tap-min: 44px
  tab-bar-height: 84px
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
    background: '{colors.surface}'
    borderTop: '1px solid {colors.border}'
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
    background: '{colors.sky}'
    text: '{colors.sky-ink}'
    height: '{spacing.button-height}'
    radius: '{rounded.md}'
  sheet:
    background: '{colors.surface}'
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

Ljust läge följer `docs/ux/ux-spec.md` exakt. Mörkt läge är härlett ur samma färgfamiljer och följer systemets inställning. `[ANTAGANDE: de mörka värdena är Claudes härledning; alla textpar är kontrollerade mot 4,5:1]`

- **Bakgrund (`{colors.bg}`)** är sidbakgrunden. Den är ljust grågrön så att vita kort syns utan skuggor.
- **Yta (`{colors.surface}`)** används för kort, listor, flikfält och ark.
- **Text (`{colors.ink}`, `{colors.ink-2}`, `{colors.ink-3}`)**: `ink` för rubriker och varunamn, `ink-2` för brödtext och mängder, `ink-3` för metadata, inaktiva flikar och kanter på kontroller (omarkerad bock, inmatningsfält), som behöver minst 3:1 mot bakgrunden (WCAG 1.4.11). `ink-3` får bara ligga på `surface` (4,6:1). På `bg` når den bara 4,3:1, så text direkt på sidbakgrunden använder `ink-2`.
- **Accent (`{colors.accent}`)** är den enda starka färgen: primärknappar, aktiv flik, valt filter, bocken på avbockade poster och ramen på valt platskort. Den används inte som dekor.
- **Mint (`{colors.mint}` / `{colors.mint-ink}`)** betyder "finns" eller "går att laga": "Kan lagas nu", "Finns hemma"-etiketter och platskortet Kyl.
- **Ljusblått (`{colors.sky}` / `{colors.sky-ink}`)** betyder "saknas" eller "obs": "Saknar N varor", blå ring på saknade ingredienser, sekundärknappar, kameraknappen, platskortet Frys och alla varnings- och felmeddelanden.
- **Sand (`{colors.sand}` / `{colors.sand-ink}`)** används för platskortet Skafferi och märkningen av AI-förslag.
- **Butiksetikett (Story 9.13, `store-badge`):** en liten etikett på varje erbjudanderad med butikens korta namn ("Maxi", "Krokom"), i kedjans färg: ICA har `{colors.store-ica}` / `{colors.store-ica-ink}` (varm lera), varje annan kedja det neutrala `{colors.store-other}` / `{colors.store-other-ink}` (`store-badge-other`). Färgen visar bara kedjan; butikens namn står alltid i etiketten. Mörkt läge har egna värden. En ny kedja (Willys) får en egen färgtoken när den läggs till.
- **Kategoriplattor (Epic 11):** den lilla plattan bakom kategorins ikon har en ljus ton: mint, ljusblått, sand, `{colors.tile-clay}` (lera, en ljus beige) eller `{colors.tile-lilac}` (syren), och `{colors.border}` för Övrigt. Fördelningen står under `category-tile`. Plattan är dekor: kategorins namn står alltid bredvid, och färgen betyder ingenting. Lera och syren används inte till något annat. I mörkt läge har de egna mörka värden, och mint, ljusblått och sand har sina mörka värden som förut.

Inget rött förekommer, inte ens för fel eller borttagning. Soptunnan är grå (`{colors.ink-3}`). Inga gradienter. Färgen i gränssnittet kommer från matfotona och de små kategoriplattorna.

## Typography

En familj: systemtypsnittet (San Francisco på Apple-enheter), med Inter som reserv.

| Roll | Token | Används för |
| --- | --- | --- |
| Sidrubrik | `{typography.page-title}` | Recept, Matsedel, Inköpslista, Lagersaldo |
| Receptrubrik | `{typography.recipe-title}` | Receptvy och förhandsgranskning |
| Steg | `{typography.step}` | Stegläge, läsbart på en armlängds avstånd |
| Radrubrik | `{typography.row-title}` | Recepttitlar i listor, knapptext |
| Brödtext | `{typography.body}` | Ingredienser, listposter, lagervaror, steg i receptvyn |
| Metadata | `{typography.meta}` | Tid, portioner, källa, vilken rätt en listpost kommer från |
| Sektionsrubrik | `{typography.section-label}` | Butiksavdelningar, "Med mängd", "Finns hemma", "Ingredienser" |
| Etikett | `{typography.badge}` | Statusetiketter och AI-märkning |
| Flik | `{typography.tab-label}` | Flikfältet |

Webbläsarens textförstoring ska fungera fullt ut. Ingen text är mindre än 11 px.

## Layout & Spacing

Skala: 4 / 8 / 12 / 16 / 20 / 24 / 32 px. Mobilen har `{spacing.gutter-mobile}` sidmarginal och `{spacing.header-top-mobile}` luft ovanför sidrubriken. På mobil är layouten en kolumn, från 375 px bredd.

Från `{spacing.breakpoint-desktop}` blir innehållet högst `{spacing.content-max}` brett. Vad som ändras vid brytpunkten står i `EXPERIENCE.md` under Responsive & Platform. `[ANTAGANDE: brytpunkt 1024 px]`

Fasta knappar längst ned ligger `{spacing.fixed-action-gap}` ovanför flikfältet och håller sig innanför iPhones säkerhetsmarginal.

## Elevation & Depth

Inga skuggor. Djup skapas av tonskillnaden mellan `{colors.bg}` och `{colors.surface}` och av hårfina avdelare i `{colors.hairline}` inne i kort. Ark och dialoger lägger en halvgenomskinlig mörk slöja (40 % `{colors.ink}`) över sidan i stället för skugga.

## Shapes

Mjuka, generösa hörn enligt `rounded`-tokens och komponenternas tokens ovan. Bockar, portionsväljare, hjärtan och etiketter för obegränsade varor är helt runda. Receptvyns toppbild går kant i kant utan rundning upptill.

## Components

Samma komponenter, i samma ordning och med samma namn, finns i `EXPERIENCE.md` under Component Patterns. Tokennyckeln står inom parentes.

- **Flikfält** (`tab-bar`): fyra flikar (Recept, Matsedel, Inköpslista, Lagersaldo) med ikon och etikett. En etikett som inte får plats bryts på två rader mellan orddelarna (Mat/sedel, Inköps/lista, Lager/saldo), aldrig mitt i en del. Aktiv flik i `{colors.accent}`, övriga i `{colors.ink-3}`.
- **Sidomeny** (`side-menu`): samma fyra mål som flikfältet, i en lista, plus Inställningar längst ned. Aktivt mål har `{colors.mint}`-bakgrund, `{colors.mint-ink}`-text och ikon i `{colors.accent}` (accent på mint ger bara 4,1:1).
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
- **Primärknapp** (`button-primary`) och **sekundärknapp** (`button-secondary`): `{spacing.button-height}` höga. Primär i accent, sekundär i ljusblått. Högst en primärknapp per vy.
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
- **Flikmärke** (`tab-badge`): en rund etikett i `{colors.accent}` med siffran i `{colors.surface}`, minst 18 px, uppe till höger på flikens ikon. Aldrig rött. Över 9 står "9+".

Från Epic 9 (veckans erbjudanden):

- **Erbjudandeetikett** (`offer-chip`): en liten etikett i `{colors.mint}` med `{colors.mint-ink}`-text, samma form som produktetiketten, med varan och priset: "Falukorv 29 kr". Avkortad med "…". På en listpost står den först på raden under namnet, på ett receptkort eller rättkort under titeln (högst två och "+N"). Mint skiljer den från produktetiketten (ljusblå) och AI-etiketten (sand). Ingen ikon och ingen emoji.
- **Veckans erbjudanden** byggs bara av befintliga komponenter: Ark, Kategorirubrik, Listgrupp, Listrad, Soptunna, Meddelanderuta, kort bekräftelse, primärknapp och textknappar. Inga nya tokens utöver `offer-chip`.
- **Erbjudanderad** (`offer-row`, Story 9.12): en Listrad som produktrad. Till vänster en kryssruta (Krysscirkel, 44 px) med namnet "Aubergine, 12 kr per st, spara 20 %". Rad ett är produktnamnet rensat från märke och ursprungsland ("ICA. Spanien Aubergine" blir "Aubergine"); raden under är liten, `{colors.ink-3}`, och bär landet och märket ("ICA · Spanien"), Stammis, villkor och sista dag. Till höger en rad staplad åt höger: priset ("15 kr/kg", "2 för 25 kr") fetstilt i en piller av `{colors.mint}` med `{colors.mint-ink}`-text (accent på mint ger bara 4,1:1), under det ordinarie priset genomstruket i `{colors.ink-3}` ("111,90 kr"), sedan rabattmärket "−20 %" i `{colors.sand}` och från 30 % "Toppklipp −33 %" i `{colors.accent}` med `{colors.on-accent}`-text, och för en vara som redan ligger i inköpslistan märket "På listan". Allt som saknas (pris, ordinarie pris, rabatt) utelämnas. Raden håller 375 px utan sidscroll: namnet bryts, högerkolumnen är högst 9 rem.

## Do's and Don'ts

| Gör | Gör inte |
| --- | --- |
| Använd blått för "saknas", varningar och fel | Använd rött någonstans, inte ens för fel |
| Låt matbilderna stå för färgen | Lägg till dekorativa illustrationer, gradienter eller mönster |
| Skapa djup med `bg` mot `surface` | Använd skuggor |
| Använd en accentfärg, för handling och "klart" | Låt en färg betyda en kategori; plattorna är dekor och namnet står alltid bredvid |
| Ge varje kategori en ljus platta med ikon (Epic 11) | Använd emoji någon annanstans än i kategoriplattorna, eller lägg en egen ikon på varje vara |
| Gör soptunnan grå och utan ram | Gör borttagning röd eller lägg en kontrollfråga på en borttagning som går att ångra |
| Gör tryckytor minst 44 × 44 px | Använd små ikonknappar utan luft runt |
| Märk AI-innehåll med sand-etiketten | Blanda AI-förslag med sparade recept utan märkning |
| Visa alla recept i samma format oavsett källa | Behåll källsajtens typsnitt, färger eller layout |
