-- Story 17.6: what the AI has cost. One row per AI call (an AI job's run or a
-- synchronous call): the model id and the tokens in and out, which Inställningar
-- turns into a cost with a price table in code. A table of its own rather than
-- columns on ai_job: ai_job rows are temporary (removed after a day or when
-- dismissed, and left out of the backup), so a month's total could not be
-- summed from them. Only src/features/settings reads and writes it (AD-1).
-- Additive: no existing table or function is touched. Every row belongs to one
-- user and is protected by RLS (AD-4). Never holds a prompt, an answer or a photo.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- The model id as the provider knows it ("claude-haiku-5-5", LM Studio's model id, "mock").
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ai_usage_model_check check (char_length(model) between 1 and 100),
  constraint ai_usage_input_tokens_check check (input_tokens between 0 and 100000000),
  constraint ai_usage_output_tokens_check check (output_tokens between 0 and 100000000)
);

create index ai_usage_user_id_created_at_idx on public.ai_usage (user_id, created_at);

alter table public.ai_usage enable row level security;

create policy ai_usage_own_rows on public.ai_usage
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.ai_usage from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_usage to authenticated, service_role;

-- The calls and tokens per model from `from_at` (inclusive) to `to_at` (exclusive),
-- for the signed-in user. security invoker: RLS limits it to the user's own rows,
-- and grouping here keeps the read short however many calls there are.
create function public.ai_usage_month(from_at timestamptz, to_at timestamptz)
returns table (model text, calls bigint, input_tokens bigint, output_tokens bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.model, count(*), sum(u.input_tokens)::bigint, sum(u.output_tokens)::bigint
  from public.ai_usage u
  where u.created_at >= from_at and u.created_at < to_at
  group by u.model
$$;

revoke all on function public.ai_usage_month(timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.ai_usage_month(timestamptz, timestamptz) to authenticated;
