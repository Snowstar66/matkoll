-- Story 16.8: a fetch of a selection of stores replaces what the other stores
-- had. clear_other_store_offers(keep) deletes the signed-in user's offers (any
-- week) of every store not in `keep`, and gives the number of rows deleted.
-- Security invoker (RLS also limits it to the user's rows), search_path = ''
-- and execute only for authenticated.

create or replace function public.clear_other_store_offers(keep uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  removed integer;
begin
  if caller is null then
    raise exception 'clear_other_store_offers needs a signed-in user' using errcode = '42501';
  end if;
  if keep is null or cardinality(keep) = 0 then
    raise exception 'at least one store to keep is required' using errcode = '22023';
  end if;

  delete from public.store_offer as offer
  where offer.user_id = caller
    and not (offer.store_id = any (clear_other_store_offers.keep));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.clear_other_store_offers(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.clear_other_store_offers(uuid[]) to authenticated;
