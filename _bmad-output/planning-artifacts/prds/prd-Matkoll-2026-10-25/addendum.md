# Matkoll – PRD-addendum

Tekniska val och underlag som hör till arkitektur och UX snarare än till PRD:n. Källor: `docs/brief.md` och `docs/autonomi.md`.

## Teknik (från brief och arbetsregler)

| Område | Val |
| --- | --- |
| Ramverk | Next.js (App Router), TypeScript strikt läge, pnpm |
| Styling | Tailwind CSS med tokens från `docs/ux/ux-spec.md`, inget tungt komponentbibliotek |
| Databas och inloggning | Supabase (Postgres, Auth med engångslänk, RLS). Lokal Supabase via CLI under utveckling |
| Drift | Vercel, efter att Epic 1–3 fungerar lokalt |
| AI-klient | Vercel AI SDK bakom ett eget gränssnitt: `parseRecipe`, `analyzeImage`, `suggestDishes`. Leverantör via miljövariabel: `lmstudio`, `anthropic`, `openai`, `mock` |
| Testmodell | Qwen3.6-35B-A3B i LM Studio, `http://localhost:1234` lokalt, Cloudflare Tunnel + Access när appen körs på Vercel |
| Validering | Zod för alla AI-svar och formulär, med nytt försök vid ogiltigt AI-svar |
| Promptar | Samlade på ett ställe, separat från koden |
| Tester | Vitest för logik, Playwright för huvudflödena, RLS-tester mot lokal Supabase |
| CI | GitHub Actions: lint, typkontroll, tester, hemlighetsskanning, RLS-tester |

## Datamodell (utgångspunkt)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| ingredient | Normaliserat namn, synonymer, butiksavdelning, plats, standardenhet, ev. vikt per dl/st | – |
| recipe | Titel, käll-URL, originalportioner, steg, bild-URL, favorit, tid | – |
| recipe_ingredient | Originaltext, mängd, enhet, vag, ev. stegkoppling | recipe, ingredient |
| pantry_item | Mängd (null = obegränsad), enhet, plats | ingredient |
| meal_plan | Namn eller period | – |
| meal_plan_recipe | Valt antal portioner | meal_plan, recipe |
| shopping_list_item | Beräknad mängd, enhet, avbockad, egen vara, ursprung | meal_plan, ingredient |
| recipe_site | Domän, aktiv | – |
| store | Namn, kedja, butiks-id, URL, vald | – |
| product_choice | Produktnamn, förpackningsstorlek, länk | ingredient, store |

Alla tabeller har `user_id` och RLS.

## Ingrediensmatchning

Största risken enligt briefen. Utgångspunkt:
1. Exakt träff på normaliserat namn eller synonym i katalogen.
2. Annars föreslår AI-tjänsten en befintlig katalogingrediens eller en ny (namn, avdelning, plats, standardenhet), som syns i förhandsgranskningen.
3. Pontus rättning sparas som synonym, så att samma originaltext matchar rätt nästa gång.

## Varukorgsexport – formatskiss

```
Matkoll – inköpslista för Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733)
https://handla.ica.se/...

Mejeri
- Grädde, 3 dl – önskad produkt: Arla Matlagningsgrädde 15 % 5 dl
- Smör, 1 st

Frukt och grönt
- Gul lök, 2 st
...

Instruktion: lägg varorna i varukorgen. Välj närmast större förpackning när mängden inte matchar.
Rapportera varor du är osäker på i en separat lista. Beställ inte.
```

Exakt format bestäms i arkitekturen och dokumenteras så att Claude in Chrome kan följa det.
