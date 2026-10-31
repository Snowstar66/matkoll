-- Fixture for scripts/test-move-to-cloud.sh: one realistic household. psql variables: uid (owner).
insert into public.ingredient (id, user_id, name, normalized_name, section, location, default_unit) values
 ('a1000000-0000-4000-8000-000000000001', :'uid', 'Mjölk', 'mjolk', 'Mejeri', 'Kyl', 'l'),
 ('a1000000-0000-4000-8000-000000000002', :'uid', 'Pasta', 'pasta', 'Skafferi', 'Skafferi', 'g');
insert into public.ingredient_synonym (id, user_id, ingredient_id, normalized) values
 ('a2000000-0000-4000-8000-000000000001', :'uid', 'a1000000-0000-4000-8000-000000000001', 'mellanmjolk');
insert into public.recipe (id, user_id, title, original_servings, total_minutes, image_url, source_kind, source_url, is_favorite, offer_names) values
 ('a3000000-0000-4000-8000-000000000001', :'uid', 'Pasta med tomatsås', 4, 25, 'https://example.test/pasta.jpg', 'url', 'https://example.test/pasta', true, '{pasta,tomat}'),
 ('a3000000-0000-4000-8000-000000000002', :'uid', 'Pannkakor', 4, 30, null, 'text', null, false, '{}');
insert into public.recipe_step (id, user_id, recipe_id, position, text) values
 ('a4000000-0000-4000-8000-000000000001', :'uid', 'a3000000-0000-4000-8000-000000000001', 0, 'Koka pastan.'),
 ('a4000000-0000-4000-8000-000000000002', :'uid', 'a3000000-0000-4000-8000-000000000001', 1, 'Rör ihop såsen.');
insert into public.recipe_ingredient (id, user_id, recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague) values
 ('a5000000-0000-4000-8000-000000000001', :'uid', 'a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 0, '400 g pasta', 400, 'g', false),
 ('a5000000-0000-4000-8000-000000000002', :'uid', 'a3000000-0000-4000-8000-000000000001', null, null, 1, 'salt efter smak', null, null, true);
insert into public.recipe_site (id, user_id, domain, is_active) values
 ('a6000000-0000-4000-8000-000000000001', :'uid', 'ica.se', true);
insert into public.pantry_site (id, user_id, name, normalized_name, is_selected) values
 ('a7000000-0000-4000-8000-000000000001', :'uid', 'Hemma', 'hemma', true),
 ('a7000000-0000-4000-8000-000000000002', :'uid', 'Stugan', 'stugan', false);
insert into public.pantry_item (id, user_id, ingredient_id, location, amount, unit, site_id, label) values
 ('a8000000-0000-4000-8000-000000000001', :'uid', 'a1000000-0000-4000-8000-000000000001', 'Kyl', 2, 'l', 'a7000000-0000-4000-8000-000000000001', null),
 ('a8000000-0000-4000-8000-000000000002', :'uid', 'a1000000-0000-4000-8000-000000000002', 'Skafferi', 500, 'g', 'a7000000-0000-4000-8000-000000000001', 'Barilla');
insert into public.pantry_photo (id, user_id, site_id, location, object_path, media_type, width, height, taken_at, reading, points) values
 ('a9000000-0000-4000-8000-000000000001', :'uid', 'a7000000-0000-4000-8000-000000000001', 'Kyl',
  :'uid' || '/a7000000-0000-4000-8000-000000000001/kyl/a9000000-0000-4000-8000-000000000001.png', 'image/png', 640, 480, now(),
  '["mjölk","smör"]', '[{"n":1,"x":100,"y":200}]');
insert into public.pantry_removal (id, user_id, removed_rows) values ('aa000000-0000-4000-8000-000000000001', :'uid', '[]');
insert into public.pantry_addition (id, user_id, key) values ('ab000000-0000-4000-8000-000000000001', :'uid', 'mjolk');
insert into public.meal_plan (id, user_id, name, is_current, week_start) values
 ('ac000000-0000-4000-8000-000000000001', :'uid', 'Veckan', true, date_trunc('week', now())::date),
 ('ac000000-0000-4000-8000-000000000002', :'uid', 'Nästa vecka', false, (date_trunc('week', now()) + interval '7 days')::date);
insert into public.meal_plan_recipe (id, user_id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday) values
 ('ad000000-0000-4000-8000-000000000001', :'uid', 'ac000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Pasta med tomatsås', 4, 0, 1),
 ('ad000000-0000-4000-8000-000000000002', :'uid', 'ac000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'Pannkakor', 4, 1, 4);
insert into public.shopping_check (id, user_id, meal_plan_id, line_key) values
 ('ae000000-0000-4000-8000-000000000001', :'uid', 'ac000000-0000-4000-8000-000000000001', 't:pasta'),
 ('ae000000-0000-4000-8000-000000000002', :'uid', null, 'c:af000000-0000-4000-8000-000000000001');
insert into public.shopping_custom_item (id, user_id, meal_plan_id, label) values
 ('af000000-0000-4000-8000-000000000001', :'uid', 'ac000000-0000-4000-8000-000000000001', 'Toapapper');
insert into public.shopping_line_override (id, user_id, meal_plan_id, line_key, amount, hidden) values
 ('b0000000-0000-4000-8000-000000000001', :'uid', 'ac000000-0000-4000-8000-000000000001', 'r:a1000000-0000-4000-8000-000000000002:g', 300, false);
insert into public.store (id, user_id, name, chain, is_selected) values
 ('b1000000-0000-4000-8000-000000000001', :'uid', 'ICA Maxi', 'ICA', true);
insert into public.store_offer (id, user_id, store_id, week_start, label, name, ingredient_id, section, price, source, regular_price, saving_percent) values
 ('b2000000-0000-4000-8000-000000000001', :'uid', 'b1000000-0000-4000-8000-000000000001', date_trunc('week', now())::date, 'Pasta 500 g', 'Pasta', 'a1000000-0000-4000-8000-000000000002', 'Skafferi', '10 kr', 'text', 14.50, 30);
insert into public.product_choice (id, user_id, ingredient_id, store_id, product_name, package_size) values
 ('b3000000-0000-4000-8000-000000000001', :'uid', 'a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Barilla Spaghetti', '500 g');
insert into public.thing_place (id, user_id, site_id, room, part, room_key, part_key, kind) values
 ('b4000000-0000-4000-8000-000000000001', :'uid', 'a7000000-0000-4000-8000-000000000001', 'Garaget', 'Hylla 1', 'garaget', 'hylla 1', 'part'),
 ('b4000000-0000-4000-8000-000000000002', :'uid', 'a7000000-0000-4000-8000-000000000001', 'Källaren', null, 'kallaren', '', 'part');
insert into public.thing_photo (id, user_id, place_id, object_path, media_type, width, height, taken_at, status, unseen_count) values
 ('b5000000-0000-4000-8000-000000000001', :'uid', 'b4000000-0000-4000-8000-000000000001',
  :'uid' || '/b4000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000001.jpg', 'image/jpeg', 800, 600, now() - interval '2 days', 'done', 0);
insert into public.thing_photo (id, user_id, place_id, object_path, media_type, width, height, taken_at, status, unseen_count, replaces_photo_id) values
 ('b5000000-0000-4000-8000-000000000002', :'uid', 'b4000000-0000-4000-8000-000000000001',
  :'uid' || '/b4000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000002.jpg', 'image/jpeg', 800, 600, now(), 'done', 1, 'b5000000-0000-4000-8000-000000000001');
insert into public.thing_item (id, user_id, photo_id, place_id, name, category, where_hint, confidence, position, source) values
 ('b6000000-0000-4000-8000-000000000001', :'uid', 'b5000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'Borrmaskin', 'Verktyg', 'översta hyllan', 'high', 0, 'photo'),
 ('b6000000-0000-4000-8000-000000000003', :'uid', null, 'b4000000-0000-4000-8000-000000000002', 'Julgransfot', 'Hushåll', null, 'high', 0, 'manual');
insert into public.thing_item (id, user_id, photo_id, place_id, name, category, where_hint, confidence, position, source, same_as) values
 ('b6000000-0000-4000-8000-000000000002', :'uid', 'b5000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'Borrmaskin', 'Verktyg', null, 'medium', 0, 'photo', 'b6000000-0000-4000-8000-000000000001');
insert into public.ai_job (id, user_id, kind, status, client_key, context, result, created_at, started_at, finished_at, expires_at) values
 ('b7000000-0000-4000-8000-000000000001', :'uid', 'import', 'done', 'b8000000-0000-4000-8000-000000000001', '{}', '{"ok":true}', now(), now(), now(), now() + interval '1 hour');
insert into public.ai_job (id, user_id, kind, status, client_key, context, created_at, started_at, expires_at) values
 ('b7000000-0000-4000-8000-000000000002', :'uid', 'things', 'running', 'b8000000-0000-4000-8000-000000000002', '{}', now(), now(), now() + interval '1 hour');
insert into public.ai_setting (id, user_id, provider, model, effort) values
 ('b9000000-0000-4000-8000-000000000001', :'uid', 'anthropic', 'claude-haiku-5-5', 'medium');
insert into public.ai_usage (id, user_id, model, input_tokens, output_tokens) values
 ('ba000000-0000-4000-8000-000000000001', :'uid', 'claude-haiku-5-5', 1200, 340);
insert into public.api_key (id, user_id, key_hash, label, last_used_at) values
 ('bb000000-0000-4000-8000-000000000001', :'uid', encode(sha256(convert_to('fixture-key-' || :'uid', 'UTF8')), 'hex'), 'Siri', now());
