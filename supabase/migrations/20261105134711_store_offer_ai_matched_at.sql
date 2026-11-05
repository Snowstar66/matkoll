-- Story 9.10: when the AI was asked which catalog ingredient an offer is.
-- An offer the model answered "none" for (not food, no fitting ingredient)
-- keeps no link, so without this stamp every visit to the filter Erbjudanden
-- would ask about it again. Null = never asked. Set for every offer in a
-- request, linked or not, by the app with the owner's own session (the table's
-- existing RLS policy and grants are unchanged), and carried over on a refetch
-- by name and store, like the link.

alter table public.store_offer add column ai_matched_at timestamptz;
