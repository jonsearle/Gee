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
