create extension if not exists pgcrypto;

create table if not exists gee_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  google_refresh_token_enc text,
  auto_send_daily_email boolean not null default true,
  send_hour_utc integer not null default 9 check (send_hour_utc >= 0 and send_hour_utc <= 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gee_user_state (
  user_id uuid primary key references gee_users(id) on delete cascade,
  first_run_completed boolean not null default false,
  last_run_at timestamptz,
  last_thread_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists gee_daily_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references gee_users(id) on delete cascade,
  subject text not null,
  model text not null,
  plan_json jsonb not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_gee_daily_runs_user_sent_at
  on gee_daily_runs (user_id, sent_at desc);

create table if not exists gee_run_sections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references gee_daily_runs(id) on delete cascade,
  section_key text not null,
  title text not null,
  confidence numeric(4,3),
  evidence_refs jsonb not null default '[]'::jsonb,
  content_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gee_run_sections_run
  on gee_run_sections (run_id);

create table if not exists gee_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references gee_users(id) on delete cascade,
  run_id uuid references gee_daily_runs(id) on delete set null,
  section_id uuid references gee_run_sections(id) on delete set null,
  feedback_type text not null,
  rating smallint,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_gee_feedback_user_time
  on gee_feedback_events (user_id, created_at desc);

create table if not exists gee_user_preferences (
  user_id uuid primary key references gee_users(id) on delete cascade,
  planning_constraints jsonb not null default '{}'::jsonb,
  preferred_sections jsonb not null default '[]'::jsonb,
  suppressed_sections jsonb not null default '[]'::jsonb,
  tone_prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
