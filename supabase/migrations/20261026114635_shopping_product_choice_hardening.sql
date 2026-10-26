-- Product choices and stores, follow-up to 20261026112347_shopping_product_choice.sql
-- and 20261026110955_settings_store_hardening.sql after review (AD-1, AD-4,
-- AD-20, Stories 7.1 and 7.2):
-- 1. The one-line texts also refuse zero-width and bidi marks (U+061C,
--    U+200B–U+200F, U+FEFF), which oneLine (src/lib/one-line.ts) now removes,
--    so a name of nothing but invisible characters is empty. Rows saved
--    before have them removed first. The characters are written as \uXXXX
--    escapes, never literally (tests/design/invisible-characters.test.ts).
-- 2. product_choice_user_id_store_id_idx goes: the list reads by store_id,
--    which product_choice_store_id_user_id_idx serves.
-- 3. save_product_choice: saving is a conditional write under a per-user
--    lock. The sheet sends the choice it opened with (id and updated_at), or
--    none; when the stored choice is another, nothing is written (MK409).

-- 1. Rows saved before: the marks removed.
update public.store
set
  name = btrim(regexp_replace(name, '[\u061c\u200b-\u200f\ufeff]', '', 'g')),
  external_store_id = nullif(btrim(regexp_replace(external_store_id, '[\u061c\u200b-\u200f\ufeff]', '', 'g')), ''),
  address = nullif(btrim(regexp_replace(address, '[\u061c\u200b-\u200f\ufeff]', '', 'g')), ''),
  url = case when url ~ '[\u061c\u200b-\u200f\ufeff]' then null else url end
where name ~ '[\u061c\u200b-\u200f\ufeff]'
  or external_store_id ~ '[\u061c\u200b-\u200f\ufeff]'
  or address ~ '[\u061c\u200b-\u200f\ufeff]'
  or url ~ '[\u061c\u200b-\u200f\ufeff]';

delete from public.product_choice
where btrim(regexp_replace(product_name, '[\u061c\u200b-\u200f\ufeff]', '', 'g')) = '';

update public.product_choice
set
  product_name = btrim(regexp_replace(product_name, '[\u061c\u200b-\u200f\ufeff]', '', 'g')),
  package_size = nullif(btrim(regexp_replace(package_size, '[\u061c\u200b-\u200f\ufeff]', '', 'g')), ''),
  url = case when url ~ '[\u061c\u200b-\u200f\ufeff]' then null else url end
where product_name ~ '[\u061c\u200b-\u200f\ufeff]'
  or package_size ~ '[\u061c\u200b-\u200f\ufeff]'
  or url ~ '[\u061c\u200b-\u200f\ufeff]';

-- The refused set, the same as refusedCodePoints in src/lib/one-line.ts:
-- control characters, U+061C, U+200B–U+200F, U+2028/U+2029, the bidi
-- controls U+202A–U+202E and U+2066–U+2069, and U+FEFF.
alter table public.store drop constraint store_name_check;
alter table public.store add constraint store_name_check check (
  btrim(name) <> ''
  and name = btrim(name)
  and char_length(name) <= 100
  and name !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.store drop constraint store_external_store_id_check;
alter table public.store add constraint store_external_store_id_check check (
  btrim(external_store_id) <> ''
  and external_store_id = btrim(external_store_id)
  and char_length(external_store_id) <= 40
  and external_store_id !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.store drop constraint store_address_check;
alter table public.store add constraint store_address_check check (
  btrim(address) <> ''
  and address = btrim(address)
  and char_length(address) <= 200
  and address !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.store drop constraint store_url_check;
alter table public.store add constraint store_url_check check (
  char_length(url) <= 2048
  and url ~ '^https://[^/?#]'
  and url !~ '[[:space:]\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.product_choice drop constraint product_choice_product_name_check;
alter table public.product_choice add constraint product_choice_product_name_check check (
  btrim(product_name) <> ''
  and product_name = btrim(product_name)
  and char_length(product_name) <= 200
  and product_name !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.product_choice drop constraint product_choice_package_size_check;
alter table public.product_choice add constraint product_choice_package_size_check check (
  btrim(package_size) <> ''
  and package_size = btrim(package_size)
  and char_length(package_size) <= 40
  and package_size !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

alter table public.product_choice drop constraint product_choice_url_check;
alter table public.product_choice add constraint product_choice_url_check check (
  char_length(url) <= 2048
  and url ~ '^https://[^/?#]'
  and url !~ '[[:space:]\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
);

-- 2. The redundant index.
drop index public.product_choice_user_id_store_id_idx;

-- 3. saveProductChoice (FR-27):
-- - choice: { ingredient_id, store_id, product_name, package_size, url }.
-- - expected_id and expected_updated_at: the choice the sheet opened with,
--   both null for none. Both or neither (22023).
-- - Under a per-user lock (the prefix product_choice: keeps it apart from
--   other modules' locks), the caller's choice for the ingredient and store
--   is read. When it already holds the same fields (a double tap, or a retry
--   after a lost answer), it is returned and nothing is written. Otherwise,
--   when it is not the expected one (another tab saved, changed or removed a
--   choice meanwhile), nothing is written (MK409). Else the choice is added,
--   or changed keeping its id; the trigger sets updated_at.
-- - The ingredient and the store must be the caller's (23503); the table's
--   checks refuse what productChoiceFormSchema refuses (23514).
-- - Execute only for authenticated.
create function public.save_product_choice(choice jsonb, expected_id uuid, expected_updated_at timestamptz)
returns public.product_choice
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  choice_ingredient uuid;
  choice_store uuid;
  current_choice public.product_choice;
  saved public.product_choice;
begin
  if caller is null then
    raise exception 'save_product_choice needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(choice) is distinct from 'object' then
    raise exception 'choice must be an object' using errcode = '22023';
  end if;
  choice_ingredient := (choice ->> 'ingredient_id')::uuid;
  choice_store := (choice ->> 'store_id')::uuid;
  if choice_ingredient is null or choice_store is null or (expected_id is null) <> (expected_updated_at is null) then
    raise exception 'choice needs its ingredient and store, and the expected choice both or neither of id and updated_at'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('product_choice:' || caller::text, 0));

  select own.* into current_choice
  from public.product_choice as own
  where own.user_id = caller and own.ingredient_id = choice_ingredient and own.store_id = choice_store;

  if found then
    if current_choice.product_name = (choice ->> 'product_name')
      and current_choice.package_size is not distinct from (choice ->> 'package_size')
      and current_choice.url is not distinct from (choice ->> 'url')
    then
      return current_choice;
    end if;
    if expected_id is null
      or current_choice.id <> expected_id
      or current_choice.updated_at <> expected_updated_at
    then
      raise exception 'the product choice has changed' using errcode = 'MK409';
    end if;
    update public.product_choice as own
    set
      product_name = choice ->> 'product_name',
      package_size = choice ->> 'package_size',
      url = choice ->> 'url'
    where own.id = current_choice.id
    returning own.* into saved;
    return saved;
  end if;

  if expected_id is not null then
    raise exception 'the product choice has been removed' using errcode = 'MK409';
  end if;
  insert into public.product_choice (user_id, ingredient_id, store_id, product_name, package_size, url)
  values (
    caller,
    choice_ingredient,
    choice_store,
    choice ->> 'product_name',
    choice ->> 'package_size',
    choice ->> 'url'
  )
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.save_product_choice(jsonb, uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.save_product_choice(jsonb, uuid, timestamptz) to authenticated;
