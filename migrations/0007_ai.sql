create table if not exists cinevo_ai_consents (
  user_id text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists cinevo_ai_usage (
  user_id text not null,
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (user_id, window_start)
);
create index if not exists cinevo_ai_usage_window on cinevo_ai_usage (window_start);
