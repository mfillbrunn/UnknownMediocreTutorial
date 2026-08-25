-- Single-player campaign and achievements persistence for Supabase/PostgreSQL.
-- Run once in the Supabase SQL editor or keep as a migration.
-- Server writes are expected to use SUPABASE_SERVICE_ROLE_KEY.

begin;

create extension if not exists pgcrypto;

create table if not exists public.single_player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  campaign_version integer not null default 1 check (campaign_version >= 1),
  current_stage_id text not null default 'chapter-1-1',
  campaign_flags jsonb not null default '{}'::jsonb,
  total_campaign_stars integer not null default 0 check (total_campaign_stars >= 0),
  campaign_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint single_player_profiles_flags_object
    check (jsonb_typeof(campaign_flags) = 'object')
);

create table if not exists public.single_player_stage_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_id text not null,
  source_stage_id text,
  branch_key text,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, stage_id)
);

create table if not exists public.single_player_stage_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_id text not null,
  stage_version integer not null default 1 check (stage_version >= 1),
  status text not null default 'available'
    check (status in ('available', 'in_progress', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  best_stars smallint not null default 0 check (best_stars between 0 and 3),
  best_score integer,
  last_score integer,
  objective_results jsonb not null default '{}'::jsonb,
  reward_results jsonb not null default '{}'::jsonb,
  first_started_at timestamptz,
  last_played_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, stage_id),
  constraint single_player_stage_progress_objectives_object
    check (jsonb_typeof(objective_results) = 'object'),
  constraint single_player_stage_progress_rewards_object
    check (jsonb_typeof(reward_results) = 'object')
);

create table if not exists public.single_player_story_choices (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_id text not null,
  choice_id text not null,
  option_id text not null,
  choice_payload jsonb not null default '{}'::jsonb,
  chosen_at timestamptz not null default now(),
  primary key (user_id, stage_id, choice_id),
  constraint single_player_story_choices_payload_object
    check (jsonb_typeof(choice_payload) = 'object')
);

create table if not exists public.single_player_power_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('guesser', 'setter')),
  power_id text not null,
  source_stage_id text,
  source_choice_id text,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, role, power_id)
);

-- Contains private engine checkpoints, including data that must never be read
-- directly by a browser. RLS is enabled below with no client policy.
create table if not exists public.single_player_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage_id text not null,
  stage_version integer not null default 1 check (stage_version >= 1),
  attempt_no integer not null check (attempt_no >= 1),
  status text not null default 'pre_story'
    check (status in (
      'pre_story',
      'in_game',
      'post_story',
      'reward_choice',
      'completed',
      'abandoned',
      'failed'
    )),
  engine_checkpoint jsonb not null default '{}'::jsonb,
  public_result jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, stage_id, attempt_no),
  constraint single_player_sessions_checkpoint_object
    check (jsonb_typeof(engine_checkpoint) = 'object'),
  constraint single_player_sessions_result_object
    check (jsonb_typeof(public_result) = 'object')
);

create table if not exists public.achievement_definitions (
  id text primary key,
  title text not null,
  description text not null,
  category text not null check (category in ('campaign', 'multiplayer', 'powers', 'general')),
  target_value bigint not null check (target_value > 0),
  unit text not null default 'count',
  hidden boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievement_definitions_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievement_definitions(id) on delete cascade,
  progress_value bigint not null default 0 check (progress_value >= 0),
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table if not exists public.user_achievement_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  counter_key text not null,
  counter_value bigint not null default 0 check (counter_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, counter_key)
);

-- Idempotency ledger for server-recorded campaign and multiplayer events.
-- Browsers must never write or read this table directly.
create table if not exists public.achievement_event_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id),
  constraint achievement_event_receipts_payload_object
    check (jsonb_typeof(payload) = 'object')
);

create index if not exists single_player_stage_unlocks_user_idx
  on public.single_player_stage_unlocks (user_id, unlocked_at);
create index if not exists single_player_stage_progress_user_status_idx
  on public.single_player_stage_progress (user_id, status, last_played_at desc);
create index if not exists single_player_sessions_user_status_idx
  on public.single_player_sessions (user_id, status, updated_at desc);
create index if not exists single_player_power_unlocks_user_role_idx
  on public.single_player_power_unlocks (user_id, role, unlocked_at);
create index if not exists user_achievements_user_unlocked_idx
  on public.user_achievements (user_id, unlocked_at desc);
create index if not exists achievement_event_receipts_user_type_idx
  on public.achievement_event_receipts (user_id, event_type, created_at desc);

create or replace function public.sp_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sp_seed_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.single_player_stage_unlocks (
    user_id,
    stage_id,
    source_stage_id
  ) values (
    new.user_id,
    'chapter-1-1',
    null
  ) on conflict (user_id, stage_id) do nothing;

  -- Starter powers mirror the powers introduced by the campaign's first stage.
  insert into public.single_player_power_unlocks (
    user_id,
    role,
    power_id,
    source_stage_id
  ) values
    (new.user_id, 'guesser', 'revealGreen', 'chapter-1-1'),
    (new.user_id, 'setter', 'countOnly', 'chapter-1-1')
  on conflict (user_id, role, power_id) do nothing;

  return new;
end;
$$;

create or replace function public.sp_recalculate_total_stars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_user uuid;
begin
  if tg_op = 'DELETE' then
    affected_user := old.user_id;
  else
    affected_user := new.user_id;
  end if;

  update public.single_player_profiles profile
  set
    total_campaign_stars = coalesce((
      select sum(progress.best_stars)::integer
      from public.single_player_stage_progress progress
      where progress.user_id = affected_user
    ), 0),
    updated_at = now()
  where profile.user_id = affected_user;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- Updated-at triggers.
drop trigger if exists sp_profiles_set_updated_at on public.single_player_profiles;
create trigger sp_profiles_set_updated_at
before update on public.single_player_profiles
for each row execute function public.sp_set_updated_at();

drop trigger if exists sp_stage_progress_set_updated_at on public.single_player_stage_progress;
create trigger sp_stage_progress_set_updated_at
before update on public.single_player_stage_progress
for each row execute function public.sp_set_updated_at();

drop trigger if exists sp_sessions_set_updated_at on public.single_player_sessions;
create trigger sp_sessions_set_updated_at
before update on public.single_player_sessions
for each row execute function public.sp_set_updated_at();

drop trigger if exists achievement_definitions_set_updated_at on public.achievement_definitions;
create trigger achievement_definitions_set_updated_at
before update on public.achievement_definitions
for each row execute function public.sp_set_updated_at();

drop trigger if exists user_achievements_set_updated_at on public.user_achievements;
create trigger user_achievements_set_updated_at
before update on public.user_achievements
for each row execute function public.sp_set_updated_at();

drop trigger if exists user_achievement_counters_set_updated_at on public.user_achievement_counters;
create trigger user_achievement_counters_set_updated_at
before update on public.user_achievement_counters
for each row execute function public.sp_set_updated_at();

-- Seed the first stage and starter powers whenever a profile is created.
drop trigger if exists sp_profiles_seed_defaults on public.single_player_profiles;
create trigger sp_profiles_seed_defaults
after insert on public.single_player_profiles
for each row execute function public.sp_seed_profile_defaults();

-- Keep the aggregate star total synchronized with per-stage best scores.
drop trigger if exists sp_stage_progress_recalculate_stars on public.single_player_stage_progress;
create trigger sp_stage_progress_recalculate_stars
after insert or update or delete on public.single_player_stage_progress
for each row execute function public.sp_recalculate_total_stars();

insert into public.achievement_definitions (
  id,
  title,
  description,
  category,
  target_value,
  unit,
  hidden,
  sort_order,
  metadata
) values
  (
    'campaign_complete',
    'The Final Chapter',
    'Complete the single-player campaign.',
    'campaign',
    1,
    'campaign',
    false,
    10,
    '{"counterKey":"campaigns_completed"}'::jsonb
  ),
  (
    'multiplayer_10_games',
    'Ten Across the Table',
    'Complete 10 multiplayer matches.',
    'multiplayer',
    10,
    'matches',
    false,
    20,
    '{"counterKey":"multiplayer_matches_completed"}'::jsonb
  ),
  (
    'use_20_powers',
    'Power User',
    'Successfully use 20 powers.',
    'powers',
    20,
    'powers',
    false,
    30,
    '{"counterKey":"powers_used"}'::jsonb
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  target_value = excluded.target_value,
  unit = excluded.unit,
  hidden = excluded.hidden,
  active = true,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

alter table public.single_player_profiles enable row level security;
alter table public.single_player_stage_unlocks enable row level security;
alter table public.single_player_stage_progress enable row level security;
alter table public.single_player_story_choices enable row level security;
alter table public.single_player_power_unlocks enable row level security;
alter table public.single_player_sessions enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_achievement_counters enable row level security;
alter table public.achievement_event_receipts enable row level security;

-- Read-only browser policies. All writes are performed by the server with the
-- service-role client. This avoids trusting client-supplied scores or unlocks.
drop policy if exists single_player_profiles_select_own on public.single_player_profiles;
create policy single_player_profiles_select_own
on public.single_player_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists single_player_stage_unlocks_select_own on public.single_player_stage_unlocks;
create policy single_player_stage_unlocks_select_own
on public.single_player_stage_unlocks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists single_player_stage_progress_select_own on public.single_player_stage_progress;
create policy single_player_stage_progress_select_own
on public.single_player_stage_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists single_player_story_choices_select_own on public.single_player_story_choices;
create policy single_player_story_choices_select_own
on public.single_player_story_choices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists single_player_power_unlocks_select_own on public.single_player_power_unlocks;
create policy single_player_power_unlocks_select_own
on public.single_player_power_unlocks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists achievement_definitions_select_active on public.achievement_definitions;
create policy achievement_definitions_select_active
on public.achievement_definitions
for select
to anon, authenticated
using (active = true);

drop policy if exists user_achievements_select_own on public.user_achievements;
create policy user_achievements_select_own
on public.user_achievements
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists user_achievement_counters_select_own on public.user_achievement_counters;
create policy user_achievement_counters_select_own
on public.user_achievement_counters
for select
to authenticated
using (auth.uid() = user_id);

-- Explicitly keep private session checkpoints and idempotency receipts off the
-- browser API. The service role bypasses RLS and retains server access.
revoke all on table public.single_player_sessions from anon, authenticated;
revoke all on table public.achievement_event_receipts from anon, authenticated;

-- Allow only the intended read paths from browser roles.
revoke insert, update, delete on table public.single_player_profiles from anon, authenticated;
revoke insert, update, delete on table public.single_player_stage_unlocks from anon, authenticated;
revoke insert, update, delete on table public.single_player_stage_progress from anon, authenticated;
revoke insert, update, delete on table public.single_player_story_choices from anon, authenticated;
revoke insert, update, delete on table public.single_player_power_unlocks from anon, authenticated;
revoke insert, update, delete on table public.achievement_definitions from anon, authenticated;
revoke insert, update, delete on table public.user_achievements from anon, authenticated;
revoke insert, update, delete on table public.user_achievement_counters from anon, authenticated;

grant select on table public.single_player_profiles to authenticated;
grant select on table public.single_player_stage_unlocks to authenticated;
grant select on table public.single_player_stage_progress to authenticated;
grant select on table public.single_player_story_choices to authenticated;
grant select on table public.single_player_power_unlocks to authenticated;
grant select on table public.achievement_definitions to anon, authenticated;
grant select on table public.user_achievements to authenticated;
grant select on table public.user_achievement_counters to authenticated;

commit;
