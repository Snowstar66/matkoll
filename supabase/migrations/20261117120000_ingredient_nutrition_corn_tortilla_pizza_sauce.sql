-- Two more nutrition names (the nutrition feature; purely additive upserts), found when the recipe
-- "Tortillapizza med kalkon och vitlökssås" (recept.se) showed no kcal: its lines "2 majstortillor (à 50 g)"
-- and "1 dl pizzasås, tomat" were "unknown ingredient".
--
-- Hand-written next to scripts/nutrition-mapping.mjs (the names are in its mapping; scripts/nutrition-data.mjs
-- treats this file as already applied). Values: Livsmedelsverket, Livsmedelsdatabasen, CC BY 4.0
-- (https://creativecommons.org/licenses/by/4.0/deed.sv):
--   majstortilla, majstortillor, majstortillas: LMV has no corn tortilla, so 6878 "Bröd vitt tortilla glutenfritt"
--     stands in (252 kcal per 100 g); 50 g per piece is the size the recipe itself gives ("à 50 g").
--   pizzasås, pizzasås tomat: 5726 "Tomatsås till pizza hemlagad"; 100 g per dl, as 'tomatsås'.
-- No package weight for either (not known).
--
-- Revert: delete these five rows (nothing else refers to them).

insert into public.ingredient_nutrition
  (normalized_name, lmv_number, lmv_name, kcal, protein_g, fat_g, carbs_g, fiber_g, grams_per_piece, grams_per_slice, grams_per_dl, kostrad_group, grams_per_package)
values
  ('majstortilla', 6878, 'Bröd vitt tortilla glutenfritt', 252, 6.4, 4.3, 41.1, 11.2, 50, null, null, 'raffinerad', null),
  ('majstortillas', 6878, 'Bröd vitt tortilla glutenfritt', 252, 6.4, 4.3, 41.1, 11.2, 50, null, null, 'raffinerad', null),
  ('majstortillor', 6878, 'Bröd vitt tortilla glutenfritt', 252, 6.4, 4.3, 41.1, 11.2, 50, null, null, 'raffinerad', null),
  ('pizzasås', 5726, 'Tomatsås till pizza hemlagad', 100, 1.4, 6.8, 7.7, 1.8, null, null, 100, 'ovrigt', null),
  ('pizzasås tomat', 5726, 'Tomatsås till pizza hemlagad', 100, 1.4, 6.8, 7.7, 1.8, null, null, 100, 'ovrigt', null)
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
