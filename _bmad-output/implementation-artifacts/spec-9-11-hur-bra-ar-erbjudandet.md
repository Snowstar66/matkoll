---
title: 'Story 9.11: Hur bra är erbjudandet'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '6530a8c'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/docs/erbjudanden-lankar.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus skrev: "När jag fått lista av veckans erbjudanden vill jag gärna se hur bra rabatt eller erbjudande det är." Listan visar bara priset som ICA skrev det ("89 kr/kg", "2 för 30 kr"), så det går inte att se vilka som är riktigt bra.

**Approach:**
- ICA:s `weeklyOffers` har mer än 9.1 läser: `parsedMechanics` (`benefitType`, `quantity`, `unitSign`, `value1`, `value2`) och `stores[].regularPrice` ("111,90"). Parsern läser dem och räknar ut ordinarie pris och besparing i hela procent.
- `store_offer` får `regular_price numeric(8,2)` och `saving_percent smallint`, båda null när det inte går att säga. `save_store_offers` tar dem per post.
- Raden under varan blir "89 kr/kg · Ord. 111,90 kr · spara 20 % · Stammis · …". Okänt visas inte alls.
- Arket får filterpillerna "Efter avdelning" (standard) och "Bäst rabatt" (en lista, störst besparing först, okända sist). De visas bara när minst ett erbjudande har en besparing. Från 30 % visas märket "Toppklipp".

## Boundaries & Constraints

**Always:**
- Gissa aldrig. Besparingen räknas bara så här, annars är den null:
  - `PERCENT` med `unitSign` "%" och `value1` 1–99: procenten är `value1` (inget ordinarie pris behövs).
  - `MULTI` "Köp N" / "betala för M" med M < N: `1 - M/N` avrundat (3 för 2 ger 33 %).
  - `FIXED` med ordinarie pris: pris per kg eller st (`kr/kg`, `kr/st`, kvantitet 1) eller "N för X" (`:-`, `value2` delat på N) mot ordinarie pris. Billigare med minst 1 %, annars null. Andra enheter (till exempel `kr/l`) ger ingen besparing.
  - Ordinarie pris är en vanlig siffra ("111,90", högst två decimaler, över 0), annars null. `referencePriceText` och `comparisonPrice` läses inte.
- Ordinarie pris antas gälla samma enhet som erbjudandet (ICA:s eget "Ord.pris"). Det kontrolleras vid Pontus nästa tryck (se Implementation Notes).
- Fel form i `parsedMechanics` eller `stores` ger bara ingen besparing, aldrig ett bortfallet erbjudande.
- En ny migration (`20261029100000_store_offer_saving.sql`) med `check` (pris > 0, procent 1–99). `save_store_offers` byts med `create or replace`, fortfarande `security invoker`, `search_path = ''` och `execute` bara för `authenticated`. Redan sparade rader får null. Inget redigeras i tidigare migrationer, och `supabase db reset` körs aldrig.
- `offers_fetched` får `withRegularPrice` (antal). Loggar har bara antal, aldrig varunamn.
- Epic 11-komponenter: `ListRow`, `Badge`, `FilterPills`. Inga osynliga tecken i källkoden annat än som `\u`-escapes. Ingen hämtning från ica.se i tester och inga ICA-token eller kakor sparas.

**Never:**
- Ingen besparing i kronor sparas eller visas (priset är text, och Pontus bad om procent); `savingKronor` finns som ren funktion för senare bruk.
- Ingen påverkan på inköpslistan, recept eller `src/server/ai/` (9.5 byggs parallellt).

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| Ordinarie pris, kr/kg | "89 kr/kg", `regularPrice` "111,90" | "89 kr/kg · Ord. 111,90 kr · spara 20 %" |
| Ordinarie pris, "2 för" | "2 för 40 kr", ordinarie "24,90" | 20 kr per st mot 24,90: "spara 20 %" |
| Procent | "25% rabatt", inget ordinarie pris | "25% rabatt · spara 25 %" |
| Köp 3 betala för 2 | `MULTI` | "spara 33 %" och märket "Toppklipp" |
| Okänd enhet | `kr/l` med ordinarie pris | Bara "Ord. … kr" |
| Dyrare än ordinarie | pris 120, ordinarie 111,90 | Bara "Ord. 111,90 kr" |
| Inget ordinarie pris | "129 kr/kg" | Raden som förut |
| Sortera | "Bäst rabatt" | En lista, 33 % först, okända sist, sidans ordning bland lika |
| Ingen besparing alls | Inga poster med procent | Inga filterpiller |

</frozen-after-approval>

## Code Map

- `src/features/offers/domain/offer-saving.ts` (+ test) -- `offerSaving`, `parsePrice`, `savingText`, `topDealPercent`
- `domain/ica-offer-page.ts`, `offer.ts` (`bestSavingFirst`, `offerMetaText`) -- fälten `regularPrice` och `savingPercent`
- `data/save.ts`, `data/queries.ts`, `actions/fetch-store-offers.ts` -- spara, läsa, logga
- `ui/offers-list.tsx`, `ui/offers-sheet.tsx` -- raden, märket och sorteringen
- `supabase/migrations/20261029100000_store_offer_saving.sql`, `src/lib/supabase/database.types.ts`
- `tests/fixtures/sites/ica-erbjudanden.html` (två poster fick ordinarie pris), `tests/integration/offers.test.ts`, `tests/e2e/offers-link.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] Migration, `save_store_offers` och `database.types.ts` -- kolumnerna och funktionen
- [x] `offer-saving.ts`, parsern, `toOfferDraft`, `data/` -- räkna, spara och läsa
- [x] `offers-list.tsx`, `offers-sheet.tsx` -- rad, "Toppklipp" och "Bäst rabatt"
- [x] Tester: enhet, integration (kolumner och checks), e2e (raden, märket, sorteringen)

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e tests/e2e/offers-link.spec.ts`, when de körs, then lyckas alla.
- Given migrationen, when `scripts/pantry-site-check.sql` körs före och efter, then är utskrifterna identiska.

## Implementation Notes

- **Verifieras vid Pontus nästa tryck (T15):** fixturen har ordinarie pris på bara tre av nio poster, och formen är påhittad efter förstudien. Den verkliga andelen erbjudanden med ordinarie pris syns i loggraden `offers_fetched` (`withRegularPrice` av `saved`). Är den låg, eller är ordinarie pris per annan enhet än erbjudandet, justeras reglerna här.
- **Beslut: procent, inte kronor.** Priset sparas som ICA:s text och räknas aldrig med; besparingen sparas som heltal så att sorteringen sker i listan utan att tolka text.
- **Beslut: standardsortering oförändrad.** "Bäst rabatt" är ett val i arket, så att kategorierna som Pontus känner igen är kvar.

## Spec Change Log

## Review Triage Log

Granskningen gjordes av Claude direkt på migreringen, enligt den tokensnåla loopen: migreringen lägger bara till två kolumner som får vara tomma, med kontroller. `save_store_offers` byts med `create or replace` och har samma mönster som granskades i 9.1: `caller = auth.uid()`, kontroll att butiken tillhör användaren, advisory lock, security invoker, `search_path = ''` och execute bara för `authenticated`. Ingenting behövde rättas.
