---
title: 'Story 13.7: Planera kommande veckor'
type: 'feature'
created: '2026-10-29'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '288dd20'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "jag måste kunna planera nästa/kommande veckors matsedlar denna vecka". Matsedeln var en enda "aktuell" matsedel; det gick inte att lägga rätter på nästa vecka utan att röra denna veckas.

**Approach:** Varje matsedel hör till en vecka (måndagen, svensk tid). Matsedel-sidan bläddrar mellan denna vecka och de följande med "‹ Vecka 44 ›", veckan ligger i adressen, och inköpslistan får en veckoväljare. Tidigare veckor ligger kvar i Tidigare (3.2).

## Boundaries & Constraints

**Always:** Allt som i 13.5 och 13.6 (dagar, idag och datum, lagad, portioner, soptunna, "Ledig"-rader). Mörkt läge, 375 px utan sidled (även vid 200 % text), tryckytor minst 44 px. Pontus verkliga matsedlar och bockar ska överleva migreringen.

**Never:** Ingen `supabase db reset`, ingen redigering av körda migreringar, inget nätverk.

</frozen-after-approval>

## Design

- **Data.** `meal_plan.week_start date` (måndag, kontroll `isodow = 1`, null = "tidigare"). Unikt per användare och vecka (partiellt unikt index där `week_start is not null`; det gamla "en aktuell"-indexet försvinner). Funktionen `meal_plan_week_start()` ger veckans måndag i Europe/Stockholm.
- **Backfill.** Den matsedel som var aktuell får denna veckas måndag, så Pontus meny och inköpslista (bockar, egna varor och dolda rader hänger på matsedelns id) ligger kvar orörda. Äldre matsedlar får `null` (Tidigare): flera av dem kan dela vecka, Tidigare sorterar redan på `created_at`, och en gissad måndag riskerade bara unik-brott. Verifierat före/efter: matsedlar, rätter och bockar identiska, `pantry-site-check.sql` utan diff.
- **`is_current` byter betydelse till "öppen"** (denna vecka eller senare, inte undanlagd). Alla funktioner som säger `plan.is_current` (bockar, egna varor, justeringar, "Ångra", `detach_recipe_from_current_plan`) fungerar därför oförändrade för kommande veckor, och RLS och grants rörs inte. "Aktuell matsedel" i appen är den vars `week_start` är denna måndag. När en vecka passerat stänger `meal_plan_close_past()` (anropas under låset av skrivande funktioner) dess flagga; läsningen av Tidigare går på `week_start` och är därför rätt även innan dess. När en ny vecka börjar blir den planerade veckan alltså av sig själv denna vecka.
- **Funktioner.** Nya `add_to_plan(week_start, …)` skapar veckans matsedel vid första rätten (måndag, denna vecka till 12 veckor fram, annars 22023). `add_to_current_plan` finns kvar med samma signatur som tunn wrapper mot denna vecka (migrering 20261029231000), eftersom koden på main anropar den. `set_current_meal_plan` ("Använd igen"/"Ny matsedel") gäller denna vecka: veckans gamla matsedel läggs undan (`week_start = null`, inte öppen, eller tas bort om den är tom, som förut behålls den om den har egna varor, 20261029232000); kommande veckor rörs inte. `delete_meal_plan` vägrar öppna matsedlar.
- **Domän** (`domain/week.ts`): måndag i Stockholm, `addWeeks`, `weekParam`/`parseWeekParam` (`2026-W45` eller datum), `viewedWeek` (denna vecka om värdet saknas, är gammalt eller mer än 12 veckor fram), etiketter ("Denna vecka", "Nästa vecka", "Om 2 veckor").
- **Matsedel.** `WeekNav` (länkar, renderas på servern): "‹" finns bara från nästa vecka och framåt (bakåt är Tidigare), "Idag" tillbaka. `getMealPlanView(weekStart)`; en kommande vecka utan matsedel visar sju "Ledig"-rader. Datum räknas från den visade veckans måndag (13.6 räknade från "denna vecka" och rättas här), och "Idag" märks bara i denna vecka. "Lägg till rätt", dag, flytta, portioner, soptunna och lagad verkar på den visade veckans matsedel (rätt får `weekStart`; utan dag väljs första lediga dag från måndag i en kommande vecka). "Visa inköpslistan" tar veckan med.
- **Inköpslista.** Standard är denna vecka. Veckoväljaren är en native `<select>` ("Vecka 44 · Denna vecka", "Nästa vecka" …; 44 px, bryter vid stor text), veckan ligger i adressen `?vecka=`. Listan räknas från den veckans matsedel minus lagret. Bockar, dolda rader och egna varor är redan nycklade på matsedelns id (`planId nyckel`), så veckorna blandas inte; listan får dessutom `key={vecka}` så ingen lokal state följer med. "Lägg i lagret" hittar matsedeln via id när den är en kommande veckas.
- **Avstått:** valet "Lägg på: Denna vecka / Nästa vecka" i AI-förslag och "Från dina recept" gjordes inte (de lägger på denna vecka som förut; nästa vecka nås via Lägg till rätt på Matsedel). "Veckans erbjudanden" lägger fortfarande egna varor på denna veckas lista.
- **Tester.** Enhet (`week.test.ts`, `week-nav.test.tsx`), integration (en matsedel per vecka, kontroll av måndag, lägg på kommande vecka, egna rader, stängning av passerad vecka, lista och bockar per vecka), e2e (nästa vecka: lägg till, finns bara där, ladda om, Idag, väljaren i listan).

## Vid bygget

- **Missar som rättades:** migreringen tappade först wrappern `add_to_current_plan` (main bröts, rättat i 20261029231000) och regeln att en matsedel med egna varor behålls vid byte (rättat i 20261029232000).
- **Känd risk mot main:** main läser aktuell matsedel med `is_current = true` och `maybeSingle()`; så fort en kommande veckas matsedel finns har användaren två öppna rader och den koden felar tills 13.7 är deployad. Migreringen och koden bör gå ut tillsammans.
- Backup och före/efter-körningar ligger i scratchpad, inte incheckade.

## Review Triage Log

Migreringsgranskning återstår (status `in-progress`).
