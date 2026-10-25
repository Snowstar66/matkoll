-- Catalog, follow-up to 20261025194532_catalog.sql (AD-1, AD-4, AD-6, AD-20).
-- 1. One commit writes new ingredients and synonyms in a single statement.
-- 2. Only signed-in users run it: auth.uid() is null for service_role.
-- 3. Catalog ingredients are never deleted in v1 (AD-20).
-- 4. Normalised names and synonyms cannot be whitespace only.

alter table public.ingredient drop constraint ingredient_normalized_name_check;
alter table public.ingredient
  add constraint ingredient_normalized_name_check check (btrim(normalized_name) <> '');

alter table public.ingredient_synonym drop constraint ingredient_synonym_normalized_check;
alter table public.ingredient_synonym
  add constraint ingredient_synonym_normalized_check check (btrim(normalized) <> '');

revoke delete on table public.ingredient from authenticated, service_role;

drop function public.commit_new_ingredients(jsonb);

-- Saves the catalog side of a save, atomically, as the caller (RLS applies):
-- - new_ingredients: [{ name, normalized_name, section, location, default_unit }]
--   are created with insert … on conflict (user_id, normalized_name) do update
--   … returning id. The update is a no-op, so an existing ingredient keeps its
--   values, and concurrent commits of one name get one row and the same id.
-- - synonyms: [{ normalized, ingredient_id }] for an existing ingredient, or
--   [{ normalized, ingredient_name }] for one of new_ingredients by its
--   normalized_name. An existing synonym is pointed at the new ingredient.
-- Returns the id for each normalized name in new_ingredients. The caller removes
-- duplicate names and synonyms first: one command cannot update a row twice.
create function public.commit_ingredients(new_ingredients jsonb, synonyms jsonb)
returns table (id uuid, normalized_name text)
language sql
security invoker
set search_path = ''
as $$
  with inserted as (
    insert into public.ingredient as existing (name, normalized_name, section, location, default_unit)
    select item.name, item.normalized_name, item.section, item.location, item.default_unit
    from jsonb_to_recordset(new_ingredients) as item (
      name text,
      normalized_name text,
      section text,
      location text,
      default_unit text
    )
    on conflict (user_id, normalized_name) do update
      set normalized_name = existing.normalized_name
    returning existing.id, existing.normalized_name
  ),
  -- Runs even though the final select does not read it.
  linked as (
    insert into public.ingredient_synonym as synonym (ingredient_id, normalized)
    select coalesce(link.ingredient_id, inserted.id), link.normalized
    from jsonb_to_recordset(synonyms) as link (normalized text, ingredient_id uuid, ingredient_name text)
    left join inserted on inserted.normalized_name = link.ingredient_name
    on conflict (user_id, normalized) do update
      set ingredient_id = excluded.ingredient_id
    returning synonym.id
  )
  select inserted.id, inserted.normalized_name from inserted;
$$;

revoke all on function public.commit_ingredients(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.commit_ingredients(jsonb, jsonb) to authenticated;
