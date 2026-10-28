-- Offers module (AD-25, Story 9.1 review): every fetch attempt is recorded, not
-- only the ones that saved offers, so a store that answers 403 or 429 (or a
-- page that cannot be read) is not asked again at once.
--
-- store.offers_attempted_at is set by the app in one conditional UPDATE before
-- the page is fetched: only when it is null or older than the cooldown. Zero
-- rows updated means the fetch is throttled, which also makes two taps at the
-- same time safe. After a 403 or 429 the app pushes it into the future so the
-- cooldown becomes 6 hours. Null means never tried. The column follows the
-- table's existing grants and row level security (store_own_rows).

alter table public.store add column offers_attempted_at timestamptz;

comment on column public.store.offers_attempted_at is
  'When the app last tried to fetch the store''s weekly offers (set before the request; in the future after a 403 or 429). Null when never.';
