---
title: 'Story 16.8: Hämta ersätter och tydliga filter'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
---

## Intent

**Problem:** Efter en ny hämtning låg gamla erbjudanden kvar, också från butiker Pontus just valt bort. Knappen "Filter" gömde vad den gjorde, och butikspillren i AI-kortet ("Maxi · Krokom") liknade ett filter.

**Approach:** En hämtning av ett urval ersätter övriga butikers erbjudanden. Filtren blir två märkta rader utan dold knapp, och AI-kortets butiksval får egen etikett.

## Ändringar

- Verifierat: `save_store_offers` med `replace_source = 'link'` ersätter butikens länkrader för veckan utan dubbletter (befintligt integrationstest "replaces the store's link rows").
- Migration `20261029210000_clear_other_store_offers.sql`: `clear_other_store_offers(keep uuid[])` raderar användarens erbjudanden (alla veckor) i butiker som inte ingår i `keep`. Security invoker, `search_path = ''`, `caller = auth.uid()`, tom `keep` nekas (22023), execute bara för `authenticated`. Typer i `database.types.ts`.
- `data/save.ts` `clearOtherStoreOffersIn`, `actions/clear-other-store-offers.ts` (zod, `requireUser`, `revalidateFor("store_offer")`).
- `offers-sheet.tsx`: `fetchFrom(stores, replaceOthers)`; "Hämta valda" med färre butiker än alla anropar åtgärden efter hämtningarna, bara om minst en lyckades (`keep` = de valda). "Hämta alla" och enbutiksknappen rensar inget. Knappen "Filter" borta; raderna "Visa butik:" (2+ butiker med erbjudanden) och "Sortera:" (något erbjudande har rabatt) med synlig etikett och `aria-label`. Valt butiksfilter faller tillbaka till "Alla" när butiken inte längre har erbjudanden. Sorteringsvalet heter "Avdelning".
- `suggest-from-offers-button.tsx`: "Föreslå rätter från:" över pillren inne i kortet (grupp med `aria-label` "Föreslå rätter från"), bara med 2+ butiker.

## Beslut

- Rensningen tar alla källor (länk, text, foto) i de bortvalda butikerna, eftersom Pontus vill se bara de butiker han valde.
- Resultatraderna per butik och antalet i sammanfattningen följer det som finns kvar efter rensningen.
- Ingen e-post, inget nätverk, ingen AI.

## Migration

Datasäkerhetskopia i scratchpad (`migration-16-8/backup.sql`), `scripts/pantry-site-check.sql` före och efter under testlåset gav identiska utdata. Tillämpad med psql plus rad i `schema_migrations` (MigrationMissingLocalError). Ingen `db reset`.

## Verifiering

lint, typecheck, `pnpm test` (5204), integration (554), `AI_PROVIDER=mock pnpm build`, e2e `offers-link` + `offer-suggestions` (19, inklusive nytt test: två butiker, hämta bara en, den andras erbjudanden är borta), kort kontroll i `pnpm dev` på port 3296. Status `in-progress` tills granskning efter migrationen är gjord.

## Review Triage Log

Claude granskade migreringen `clear_other_store_offers` själv. Funktionen tar bara bort den inloggade användarens egna rader (`user_id = caller`), vägrar en tom lista med butiker att behålla, är security invoker med `search_path = ''` och kan bara köras av `authenticated`. Ett id för en annan användares butik i listan gör ingen skada, eftersom bara egna rader berörs. Inget behövde rättas.
