-- Three more nutrition names (the nutrition feature; purely additive upserts), found when a Thai curry
-- from koket.se could not be counted: "limefrukt" (the whole fruit, as "lime"), and "chiliflakes" and
-- "chili flakes" (dried chilli, a pinch: not counted, like "chiliflingor").
--
-- Hand-written next to scripts/nutrition-mapping.mjs (the names are in its mapping; scripts/nutrition-data.mjs
-- treats this file as already applied). Values: Livsmedelsverket, Livsmedelsdatabasen, CC BY 4.0
-- (https://creativecommons.org/licenses/by/4.0/deed.sv), the same food as 'lime' (572).
--
-- Revert: delete these three rows (nothing else refers to them).

insert into public.ingredient_nutrition
  (normalized_name, lmv_number, lmv_name, kcal, protein_g, fat_g, carbs_g, fiber_g, grams_per_piece, grams_per_slice, grams_per_dl, kostrad_group, grams_per_package)
values
  ('chili flakes', null, null, null, null, null, null, null, null, null, null, 'ej_raknad', null),
  ('chiliflakes', null, null, null, null, null, null, null, null, null, null, 'ej_raknad', null),
  ('limefrukt', 572, 'Lime', 47, 0.7, 0.2, 10.3, 0.5, 70, null, null, 'gronsak', null)
on conflict (normalized_name) do update set
  lmv_number = excluded.lmv_number,
  lmv_name = excluded.lmv_name,
  kcal = excluded.kcal,
  protein_g = excluded.protein_g,
  fat_g = excluded.fat_g,
  carbs_g = excluded.carbs_g,
  fiber_g = excluded.fiber_g,
  grams_per_piece = excluded.grams_per_piece,
  grams_per_slice = excluded.grams_per_slice,
  grams_per_dl = excluded.grams_per_dl,
  kostrad_group = excluded.kostrad_group,
  grams_per_package = excluded.grams_per_package;
