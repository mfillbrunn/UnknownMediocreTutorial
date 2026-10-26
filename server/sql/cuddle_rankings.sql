-- Cuddle rankings: one row per finished Standard or Hard run.
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). The server reads and writes with the service-role
-- key (server/routes/cuddleRankings.js), so no public policies are needed;
-- RLS is switched on so nobody else can read or write it through the public
-- API.

create table if not exists public.cuddle_scores (
  id           bigint generated always as identity primary key,
  run_id       text not null unique,
  player_id    text not null,            -- account id, or the guest's device id
  name         text not null,            -- shown on the board
  is_guest     boolean not null default true,
  difficulty   text not null check (difficulty in ('medium', 'hard')),
  ascension    integer not null default 0,
  score        integer not null,
  stages       integer not null default 0,
  won          boolean not null default false,
  seed         text,
  created_at   timestamptz not null default now()
);
create index if not exists cuddle_scores_board_idx on public.cuddle_scores (difficulty, score desc);
alter table public.cuddle_scores enable row level security;
