-- Fully Deterministic Daily Challenge: playMode-aware result columns
-- (REFINEMENT_SPEC section 9). Non-destructive: only adds nullable
-- columns, never drops or recreates public.daily_results, so every
-- existing Daily Challenge row (written before playMode existed) stays
-- intact and readable exactly as before -- see server/core/dailyTracking.js's
-- resultFromRow, which falls back to the legacy score/opponent_score/
-- won/tie columns whenever these new ones are null.
--
-- `create table if not exists` below also makes this migration safe to run
-- against an environment where public.daily_results doesn't exist yet at
-- all (it predates the migrations directory and was created directly in
-- Supabase in earlier work) -- it recreates the table with its known
-- existing shape rather than assuming that shape, then the ALTER TABLE
-- below adds the new columns either way.
begin;

create table if not exists public.daily_results (
  user_id uuid not null,
  date date not null,
  room_id text,
  status text not null default 'in_progress',
  score integer not null default 0,
  opponent_score integer not null default 0,
  time_seconds integer not null default 0,
  won boolean not null default false,
  tie boolean not null default false,
  difficulty integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, date)
);

alter table public.daily_results
  -- "both" | "setter" | "guesser" -- the day's shared, deterministic play
  -- mode (see server/utils/dailyConfig.js). Null on any row written before
  -- this migration.
  add column if not exists play_mode text,
  -- "setter" | "guesser" -- which role the human started as. Only
  -- meaningful for play_mode = 'both'; null otherwise (and null on any
  -- pre-migration row).
  add column if not exists first_role text,
  -- Guesses the AI needed to crack the player's secret, across whichever
  -- round(s) the player held Secretkeeper. 0 (not null) for a
  -- 'guesser'-only challenge, where the player never held Secretkeeper at all.
  add column if not exists setter_score integer,
  -- Guesses the player needed to crack the AI's secret, across whichever
  -- round(s) the player held Guesser. 0 (not null) for a 'setter'-only
  -- challenge.
  add column if not exists guesser_score integer,
  -- setter_score - guesser_score. Only meaningfully used to RANK
  -- play_mode = 'both' results (see the client's daily rankings sort,
  -- public/client/daily-challenge.js) -- still populated for every mode
  -- for consistency, just not used to rank a single-role challenge.
  add column if not exists score_difference integer;

alter table public.daily_results
  drop constraint if exists daily_results_play_mode_valid,
  add constraint daily_results_play_mode_valid
    check (play_mode is null or play_mode in ('both', 'setter', 'guesser')),
  drop constraint if exists daily_results_first_role_valid,
  add constraint daily_results_first_role_valid
    check (first_role is null or first_role in ('setter', 'guesser'));

-- The daily rankings screen (public/client/daily-challenge.js's
-- _showDailyRankings) reads this table directly with the browser's own
-- Supabase client (window.supabaseClient, the anon/authenticated key),
-- NOT through the server -- unlike every write here, which always goes
-- through the server's service-role client (server/core/dailyTracking.js)
-- and so already bypasses RLS regardless of these policies. A leaderboard
-- is inherently public-within-the-app: every signed-in player needs to
-- read every OTHER player's row for today, not just their own, so this
-- is a broad "any authenticated user may read every row" policy rather
-- than the auth.uid() = user_id pattern private per-user tables use (see
-- 202608250001_single_player_campaign.sql). If RLS was already enabled on
-- this table with no read policy, every client-side read was silently
-- returning zero rows (no error) -- indistinguishable from "nobody has
-- played today" -- which is exactly the "my result never shows up in the
-- rankings" symptom this fixes.
alter table public.daily_results enable row level security;

drop policy if exists daily_results_select_all on public.daily_results;
create policy daily_results_select_all
on public.daily_results
for select
to authenticated
using (true);

commit;
