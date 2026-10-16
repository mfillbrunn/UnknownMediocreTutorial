-- Player insights: play tracking and "Did you have fun?" feedback.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). The server writes with the service-role key, so no
-- insert policies are needed; RLS is switched on so nobody else can read or
-- write these tables through the public API.
--
-- game is 'vowelplay' (multiplayer) or 'cuddle' (single player).

-- One row per run (Cuddle) or match (Vowel Play), updated as it goes.
create table if not exists public.play_runs (
  id              bigint generated always as identity primary key,
  game            text not null check (game in ('vowelplay', 'cuddle')),
  run_id          text not null,
  player_id       text,            -- account id, or the guest id
  device_id       text,            -- stable per browser, counts people
  is_guest        boolean not null default true,
  mode            text,            -- e.g. 'medium', 'ranked', 'vs_ai', 'daily'
  started_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  ended_at        timestamptz,     -- null = still going, or walked away
  outcome         text,            -- 'won', 'lost', 'tie', 'left', 'abandoned'
  active_seconds  integer,         -- time with the game on screen
  wall_seconds    integer,         -- start to last update
  details         jsonb,           -- stage reached, points, rounds...
  unique (game, run_id)
);
create index if not exists play_runs_game_started_idx on public.play_runs (game, started_at desc);
alter table public.play_runs enable row level security;

-- One row per answered prompt.
create table if not exists public.game_feedback (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  game            text not null check (game in ('vowelplay', 'cuddle')),
  run_id          text,
  player_id       text,
  device_id       text,
  is_guest        boolean not null default true,
  had_fun         boolean,         -- the smiley / frowny
  fun_reason      text,            -- why (or why not)
  had_bugs        boolean,
  bug_details     text,
  understand      text,            -- yes / mostly / no
  easy_to_play    text,            -- yes / mostly / no
  complexity      text,            -- too_simple / just_right / too_complicated
  difficulty      text,            -- too_easy / just_right / too_hard
  animations      text,            -- yes / okay / no
  style           text,            -- yes / okay / no
  play_style      text,            -- yes / okay / no
  recommend       text,            -- yes / maybe / no
  ideas           text,            -- anything to change or add
  mode            text,
  outcome         text,
  run_details     jsonb,
  user_agent      text
);
create index if not exists game_feedback_game_created_idx on public.game_feedback (game, created_at desc);
alter table public.game_feedback enable row level security;

-- ---------------------------------------------------------------------------
-- Summary views: open these in the Table Editor (or `select * from ...`).
-- ---------------------------------------------------------------------------

-- Per game, per day: runs, players, finished runs, time played.
create or replace view public.play_daily_stats as
select
  game,
  date_trunc('day', started_at)::date                         as day,
  count(*)                                                    as runs,
  count(distinct coalesce(device_id, player_id))              as players,
  count(*) filter (where ended_at is not null)                as finished_runs,
  round(avg(active_seconds) / 60.0, 1)                        as avg_minutes,
  round(sum(coalesce(active_seconds, 0)) / 3600.0, 1)         as total_hours
from public.play_runs
group by game, day
order by day desc, game;

-- All time, per game.
create or replace view public.play_totals as
select
  game,
  count(*)                                                    as runs,
  count(distinct coalesce(device_id, player_id))              as players,
  round(avg(active_seconds) / 60.0, 1)                        as avg_minutes,
  round(sum(coalesce(active_seconds, 0)) / 3600.0, 1)         as total_hours,
  min(started_at)                                             as first_run,
  max(started_at)                                             as latest_run
from public.play_runs
group by game;

-- Feedback at a glance, per game.
create or replace view public.feedback_summary as
select
  game,
  count(*)                                                        as responses,
  round(100.0 * avg(case when had_fun then 1 when had_fun = false then 0 end), 0) as fun_pct,
  count(*) filter (where had_bugs)                                as bug_reports,
  count(*) filter (where difficulty = 'too_easy')                 as too_easy,
  count(*) filter (where difficulty = 'just_right')               as difficulty_right,
  count(*) filter (where difficulty = 'too_hard')                 as too_hard,
  count(*) filter (where complexity = 'too_complicated')          as too_complicated,
  count(*) filter (where understand = 'no')                       as hard_to_understand,
  count(*) filter (where recommend = 'yes')                       as would_recommend
from public.game_feedback
group by game;

-- Views run with the owner's rights by default; keep them off the public API.
revoke all on public.play_daily_stats, public.play_totals, public.feedback_summary from anon, authenticated;
