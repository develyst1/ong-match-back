create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  bio text,
  age int,
  location text,
  avatar_url text,
  activity_level text,
  created_at timestamptz not null default now()
);

create table if not exists types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  level int not null default 0,
  status text not null default 'active',
  first_created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists type_tags (
  type_id uuid not null references types(id) on delete cascade,
  tag text not null,
  primary key (type_id, tag)
);

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references types(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  questions jsonb not null,
  status text not null default 'pending',
  score int,
  time_limit_sec int not null,
  attempt_no int not null default 1,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_types_user on types(user_id);
create index if not exists idx_quizzes_type on quizzes(type_id);
