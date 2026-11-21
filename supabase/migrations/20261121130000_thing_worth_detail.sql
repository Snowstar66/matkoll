-- Värt en titt: a föremål's fuller explanation ("Förklara närmare"), asked of the AI once and kept
-- here so it is never asked twice. One nullable text column on thing_item, at most 1500 characters.
-- Additive only: nothing existing changes and the code before this never reads or writes it.

alter table public.thing_item add column if not exists worth_detail text;

alter table public.thing_item drop constraint if exists thing_item_worth_detail_check;
alter table public.thing_item add constraint thing_item_worth_detail_check check (
  worth_detail is null or char_length(worth_detail) between 1 and 1500
);
