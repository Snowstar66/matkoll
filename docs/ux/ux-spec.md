# Matkoll – UX-specifikation

Underlag för BMAD:s UX-steg och för implementationen. Kompletterar avsnittet UX-riktning i `docs/brief.md`.

## Skisser

Mappen `skisser/` innehåller fyra mobilskärmar (390 × 844) som HTML-markup från designverktyget. Filerna är **referens för layout, innehåll och mått**, inte körbar kod: de är beroende av designverktygets runtime och renderas inte korrekt om de öppnas direkt i webbläsaren. Bygg om dem som riktiga Next.js-komponenter.

| Fil | Skärm |
| --- | --- |
| `1-recept-bibliotek.html` | Recept: biblioteket med sökning, filter och status per rätt |
| `2-receptvy.html` | Receptvy: portionsväljare, ingredienser mot lagret, knappar |
| `3-inkopslista.html` | Inköpslista: grupperad per avdelning, Skicka till ICA |
| `4-hemma.html` | Hemma: platskort, kamera, varor med och utan mängd |

Matsedel och Laga mat (stegläge) är inte skissade. Följ samma mönster.

## Designtokens

| Token | Värde | Användning |
| --- | --- | --- |
| `bg` | `#F5F7F4` | Sidbakgrund |
| `surface` | `#FFFFFF` | Kort och listor |
| `ink` | `#1B2420` | Primär text |
| `ink-2` | `#56635D` | Sekundär text |
| `ink-3` | `#6B7872` | Inaktiva flikar, metadata |
| `hairline` | `#EEF1EF` | Avdelare i listor |
| `border` | `#E3E8E4` | Flikfältets kant |
| `accent` | `#3E7C62` | Primärknappar, aktiv flik, bockar |
| `mint` | `#DDEFE5` | "Kan lagas nu", Kyl, "Finns"-etiketter |
| `mint-ink` | `#2C5E48` | Text på mint |
| `sky` | `#DCE9F6` | Sekundärknappar, Frys, kamera |
| `sky-ink` | `#2E5A85` | Text på sky, "Saknas" |
| `sand` | `#F1ECE2` | Skafferi |
| `sand-ink` | `#6E5B3E` | Text på sand |

Inget rött i gränssnittet. Varningar och "saknas" använder blått.

**Typografi:** `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif`. Sidrubrik 34 px / 700, rubrik i receptvy 28 px / 700, brödtext 16–17 px, metadata 13–15 px, sektionsrubriker 13 px / 600 versaler.

**Form:** kort 18 px radie, knappar 14–16 px radie, piller 17–18 px radie. Tryckytor minst 44 px.

**Mörkt läge:** ska finnas men är inte skissat. Behåll samma tonalitet.

## Navigering

Fyra flikar längst ned på mobil, sidomeny på dator: Recept, Matsedel, Lista, Hemma. Aktiv flik i `accent`.

## Skärmregler

- **Recept:** filterpiller Alla / Favoriter / Kan lagas nu. Varje rätt visar bild, titel, tid, portioner och status ("Kan lagas nu" i mint, "Saknar N varor" i sky). Hjärta för favorit.
- **Receptvy:** bild överst, portionsväljare, sammanfattning "X av Y hemma". Ingredienser med grön bock (finns hemma) eller blå ring (saknas). Knappar: "Lägg på matsedeln" (primär) och "Laga nu" (sekundär).
- **Inköpslista:** sektioner per butiksavdelning, runda bockar, vilken rätt varan kommer från. "Lägg till egen vara". Fast knapp "Skicka till ICA".
- **Hemma:** tre platskort (Kyl/mint, Frys/sky, Skafferi/sand) med ikon och antal, valt kort med 2 px ram i `accent`. Kameraknappen följer vald plats. "Med mängd" som rader; "Finns hemma" (utan mängd) som etiketter.
