-- Pantry hardening after review (AD-19): an upper bound for amounts. NaN
-- and Infinity compare greater than every number in Postgres, so the bound
-- also keeps them out (tests/integration/pantry.test.ts).

alter table public.pantry_item
  add constraint pantry_item_amount_max_check check (amount is null or amount < 1000000);
