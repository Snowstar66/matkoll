-- Story 17.5: the AI choice made in Inställningar (provider, model, effort),
-- one row per user. No row means "use AI_PROVIDER/AI_MODEL from the environment".
-- Only src/features/settings reads and writes this table (AD-1). Additive: no
-- existing table or function is touched. Every row belongs to one user and is
-- protected by RLS (AD-4).

create table public.ai_setting (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null,
  -- The model id as the provider knows it ("claude-sonnet-5-5", LM Studio's model id).
  model text not null,
  effort text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_setting_user_id_key unique (user_id),
  constraint ai_setting_provider_check check (provider in ('lmstudio', 'anthropic')),
  constraint ai_setting_model_check check (char_length(model) between 1 and 100),
  constraint ai_setting_effort_check check (effort in ('low', 'medium', 'high'))
);

alter table public.ai_setting enable row level security;

create policy ai_setting_own_rows on public.ai_setting
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.ai_setting from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_setting to authenticated, service_role;
