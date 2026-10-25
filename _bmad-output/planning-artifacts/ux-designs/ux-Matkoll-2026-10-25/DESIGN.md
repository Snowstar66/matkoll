---
name: Matkoll
description: Personlig matplanerare på mobilen. Lugn, luftig och grågrön, där matbilderna står för färgen. Inget rött.
status: final
updated: 2026-10-25
sources:
  - docs/ux/ux-spec.md
  - docs/brief.md
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
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
---

## Brand & Style

Den här filen och `EXPERIENCE.md` gäller före skisserna i `docs/ux/skisser/` när de inte stämmer överens.

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

Inget rött förekommer, inte ens för fel eller borttagning. Inga gradienter. Färgen i gränssnittet kommer från matfotona.

## Typography

En familj: systemtypsnittet (San Francisco på Apple-enheter), med Inter som reserv.

| Roll | Token | Används för |
| --- | --- | --- |
| Sidrubrik | `{typography.page-title}` | Recept, Matsedel, Inköpslista, Hemma |
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

- **Flikfält** (`tab-bar`): fyra flikar (Recept, Matsedel, Lista, Hemma) med ikon och etikett. Aktiv flik i `{colors.accent}`, övriga i `{colors.ink-3}`.
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

## Do's and Don'ts

| Gör | Gör inte |
| --- | --- |
| Använd blått för "saknas", varningar och fel | Använd rött någonstans, inte ens för fel |
| Låt matbilderna stå för färgen | Lägg till dekorativa illustrationer, gradienter eller mönster |
| Skapa djup med `bg` mot `surface` | Använd skuggor |
| Använd en accentfärg, för handling och "klart" | Färgkoda kategorier eller avdelningar |
| Gör tryckytor minst 44 × 44 px | Använd små ikonknappar utan luft runt |
| Märk AI-innehåll med sand-etiketten | Blanda AI-förslag med sparade recept utan märkning |
| Visa alla recept i samma format oavsett källa | Behåll källsajtens typsnitt, färger eller layout |
