-- Story 24.2: the look of a note's avatar when the author chose no mood emoji.
--
-- The app asks the AI for one word about the text when the note is sent and
-- stores it here; a note whose author picked an emoji (mood) never needs it,
-- and a failed or late AI call leaves it null (the avatar then looks neutral).
-- Additive: one nullable column; the grants and policies of the table stay as
-- they are, the column is only added to what a member may insert.

set local lock_timeout = '5s';

alter table public.household_note
  add column avatar_mood text,
  add constraint household_note_avatar_mood_check
    check (avatar_mood is null or avatar_mood in ('neutral', 'glad', 'arg', 'karleksfull', 'stressad'));

grant insert (avatar_mood) on table public.household_note to authenticated;
