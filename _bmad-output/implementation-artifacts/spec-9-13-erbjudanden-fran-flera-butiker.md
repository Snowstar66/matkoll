---
title: 'Story 9.13: Erbjudanden från flera butiker'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '23d94b5'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-12-valj-erbjudanden-till-inkopslistan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-valja-butik.md'
  - '{project-root}/docs/erbjudanden-lankar.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus skrev: "Kan jag även konfigurera in andra butikers extraerbjudanden. Så att jag antingen hämtar alla jag konfigurerat eller väljer vilka jag är intresserade. Sen att jag ser vilka som är willys, ica maxi, ica krokom osv på ngt bra sätt." Arket Veckans erbjudanden hämtar och visar bara den valda butikens erbjudanden.

**Approach:**
- Butiker: Pontus har redan flera butiker, var och en med egen länk (Story 7.1, 9.1). Inget behöver ändras för att lägga till en butik med länk i Inställningar.
- Hämtning: arket listar butikerna som har en länk, med en kryssruta per butik (alla ikryssade) och "Hämta valda" och "Hämta alla". Varje butik är en egen hämtning, en efter en, aldrig samtidigt mot ica.se. Varje butik behåller sin spärr (15 minuter) och sin 403/429-paus; en butik som är spärrad hoppas över med eget meddelande och de andra hämtas ändå. Resultatet visas per butik.
- Lista: varje rad får en liten butiksetikett ("Maxi", "Krokom", kortnamn av butikens namn) i kedjans färg, och filterpiller överst: "Alla" och en per butik. "Bäst rabatt" sorterar över butikerna. Samma vara i två butiker visas som två rader.
- Nedströms: "Lägg i inköpslistan" skriver butiken i noteringen ("Erbjudande Maxi: 89 kr/kg"), AI-förslagen (9.5) tar ett valfritt `storeId` (utan det den valda butiken; 9.14 lägger till valet i gränssnittet).
- Utan Willys-parser än: etiketten och filtret är byggda för en kedja som inte är ICA (neutral färg, kedjan från butikens `chain`).

## Boundaries & Constraints

**Always:**
- En hämtning är en förfrågan till en butiks sida. Butikerna hämtas strikt efter varandra (klienten väntar in svaret innan nästa), och varje butik går genom `fetchStoreOffers` med sin spärr och sin paus.
- Ingen hämtning från ica.se i tester: fixturerna i `tests/fixtures/sites/` (ny: `ica-erbjudanden-krokom.html`). Inga ICA-token eller cookies sparas eller loggas.
- Färgtokens `store-ica` och `store-other` (med `-ink`, ljust och mörkt) i `DESIGN.md` och `globals.css`; text mot bakgrund minst 4,5:1; ingen röd. Etikettens text bär alltid butiken, färgen bara kedjan.
- Epic 11-komponenter (`FilterPills`, `ListRow`, `CheckCircle`, `Button`, `Notice`, `Sheet`), minst 44 px tryckyta. Inga osynliga tecken i källkoden annat än som `\u`-escapes.
- Moduler: arket i `offers` importerar inte `shopping` eller `settings/server` (AD-1); sidan `app/(app)/lista/list-offers.tsx` läser butiker och erbjudanden och skickar dem till arket.

**Never:**
- Ingen parallell hämtning, ingen ny försökslogik och ingen ändring av spärr eller paus.
- Ingen migration: tabellerna, RLS och funktionerna räcker (se "Vid bygget").
- Ingen sammanslagning av samma vara i flera butiker.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| En butik med länk | Arket öppnas | Som förut: "Hämta veckans erbjudanden" / "Hämta igen", inga kryssrutor, ingen etikett, inga piller |
| Två butiker med länk | Arket öppnas | Panelen "Hämta från" med två ikryssade rader, "Hämta valda (2)" och "Hämta alla" |
| Bara en ikryssad | "Hämta valda (1)" | En hämtning, för den butiken |
| Hämta alla | Tre butiker | Tre hämtningar efter varandra ("Hämtar Maxi från ica.se (1 av 3) …"), en rad per butik, toast "Hämtade N erbjudanden från 3 butiker för vecka 44." |
| En butik spärrad | 403/429 eller hämtad nyss | Rad "Maxi: <meddelande>" med "Öppna sidan"; de andra hämtas |
| Butik utan länk | Willys utan länk | Står inte i panelen; ingen länk alls ger "Lägg in länken …" |
| Rader | Erbjudanden från flera butiker | Etikett per rad, piller "Alla" + en per butik; filtret visar bara den butikens rader |
| Bäst rabatt | Flera butiker | Sorterat över butikerna |
| Samma vara i två butiker | Laxfilé i Maxi och Krokom | Två rader |
| Lägg i listan | Rad från Krokom | Egen vara "Laxfilé (Erbjudande Krokom: 119 kr/kg)" |
| AI-förslag | `storeId` med eller utan | Med: den butikens erbjudanden (en annans butik är `offers_store_missing`); utan: den valda butikens |
| Session slut | `unauthorized` under hämtningen | Hämtningen avbryts, sidan läses om |

## Code Map

- `src/features/offers/domain/store-badge.ts` -- `storeBadgeText`, `storeBadgeTone`
- `src/features/offers/domain/offer.ts` -- `offerListItem` (butik i noteringen), texterna för flera butiker
- `src/features/offers/ui/offers-sheet.tsx` -- butiker, panelen, filtret, hämtning en i taget, resultat per butik
- `src/features/offers/ui/offers-list.tsx`, `fetch-offers-button.tsx` -- etiketten på raden, knappen utan formulär
- `src/app/(app)/lista/list-offers.tsx` -- alla butiker och deras erbjudanden till arket
- `src/features/suggestions/` (`domain/suggestions.ts`, `actions/suggest-from-pantry.ts`), `src/app/api/ai/jobs/route.ts` -- valfritt `storeId`
- `src/app/globals.css`, `DESIGN.md` -- färgtokens och `store-badge`
- Tester: enhet (etikett, ark, förslag), `tests/design/contrast.test.ts`, `tests/e2e/offers-link.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] Domän: `storeBadgeText`/`storeBadgeTone`, butik i `offerListItem`, texter
- [x] Ark: butiker, panel med kryssrutor, hämtning en efter en, resultat per butik, filter och etikett, rabattsortering över butiker
- [x] Sida: alla butiker och deras erbjudanden; `fetchedAt` per butik
- [x] AI-förslag: valfritt `storeId`
- [x] Tokens i `DESIGN.md` och CSS, kontrasttest
- [x] Fixtur för butik två, tester: enhet och e2e

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && AI_PROVIDER=mock pnpm build && CI=1 scripts/with-test-lock.sh pnpm test:e2e` för `offers-link`, `store`, `settings`, `shopping` och `offer-suggestions`, when de körs, then lyckas alla.
- Given epics.md Story 9.13, when den läses mot koden, then är varje kriterium uppfyllt.

## Vid bygget

- **Ingen migration.** `store` tillåter flera butiker per användare (unik på kedja + butiks-id, `external_store_id` får saknas), arket Butik lägger till en ny butik med egen länk, och `store_offer.store_id` och spärren `offers_attempted_at` är redan per butik. Pontus data (erbjudanden, två butiker) rörs inte.
- **En butik med länk ser ut som förut.** Panelen, etiketterna och pillren visas först när minst två butiker har en länk; med en är arket oförändrat ("Hämta veckans erbjudanden"/"Hämta igen"). Noteringen på listan nämner butiken alltid ("Erbjudande Maxi: 89 kr/kg"), eftersom en lista kan innehålla varor från flera veckors hämtningar.
- **Hämtningen sker i klienten, en butik i taget.** Arket anropar `fetchStoreOffers` en gång per butik och väntar in svaret; åtgärden är oförändrad (spärr, paus, 403/429). Formuläret med `useActionState` är borta, eftersom ett formulär bara kan ha ett svar. Hämtningen avbryts vid `unauthorized`.
- **Butiksetiketten.** Kortnamn: "Maxi" för en Maxi-butik, annars första ordet som inte är ett kedje- eller butiksordord ("ICA Kvantum Krokom" → "Krokom"), annars första ordet, högst 12 tecken. Färgen följer `store.chain`: ICA varm lera (`store-ica`), alla andra kedjor neutral (`store-other`). Willys får en egen token när dess parser byggs; ett nytt `case` i `storeBadgeTone` räcker. Kryssrutans namn på raden slutar med etiketten ("…, Krokom"), så färgen aldrig bär ensam.
- **`/lista`.** Inköpslistan har ännu inga erbjudandemärken (Story 9.2 är inte byggd); knappen "Erbjudanden" i `list-offers.tsx` läser alla butiker, inte bara den valda, och sidan visar veckan för de senaste erbjudandena. När 9.2 byggs väljer den valda butiken eller alla efter vad märket ska visa.
- **9.14.** `storeId` i `suggestRequestSchema` är valfritt och kontrolleras mot användarens butiker (`listStores`); utan det gäller den valda butiken. Gränssnittet för valet kommer i 9.14.

## Spec Change Log

## Review Triage Log

Granskningen gjordes av Claude direkt (tokensnål loop, ingen migration): hämtningen är sekventiell, åtgärden `fetchStoreOffers` är orörd och en annan användares butik ger `offers_store_missing` i förslagen. Inget behövde rättas.
