-- Two more nutrition names (the nutrition feature; purely additive upserts): 'smetana' and 'ricotta' were "unknown ingredient".
--
-- Hand-written next to scripts/nutrition-mapping.mjs (the name is in its mapping; scripts/nutrition-data.mjs
-- treats this file as already applied). Values: Livsmedelsverket, Livsmedelsdatabasen, CC BY 4.0
-- (https://creativecommons.org/licenses/by/4.0/deed.sv): LMV has no smetana, so 1713 "Gräddfil fett 12%" stands in
-- (128 kcal per 100 g; smetana is 12-17 % fat, so the figure is a little low for the richer ones); 100 g per dl.
-- 'ricotta' is 7022 "Färskost ricotta fett ca 10%" (146 kcal), 100 g per dl. No package weights (not known).
--
-- Revert: delete the three rows (nothing else refers to them).

insert into public.ingredient_nutrition
  (normalized_name, lmv_number, lmv_name, kcal, protein_g, fat_g, carbs_g, fiber_g, grams_per_piece, grams_per_slice, grams_per_dl, kostrad_group, grams_per_package)
values
  ('smetana', 1713, 'Gräddfil fett 12%', 128, 2.5, 11.5, 4, 0, null, null, 100, 'mejeri', null),
  ('ricotta', 7022, 'Färskost ricotta fett ca 10%', 146, 10.2, 10.9, 2, 0, null, null, 100, 'mejeri', null),
  ('färskost ricotta', 7022, 'Färskost ricotta fett ca 10%', 146, 10.2, 10.9, 2, 0, null, null, 100, 'mejeri', null)
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
