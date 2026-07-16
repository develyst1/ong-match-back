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

-- Profile cover / badge background image (stored as a data URL).
alter table users add column if not exists cover_url text;

-- Phone number: one account per phone (anti multi-account). Partial unique so
-- existing/demo rows with NULL phone are unaffected.
alter table users add column if not exists phone text;
create unique index if not exists idx_users_phone on users(phone) where phone is not null;

-- Password hash (Bun.password / argon2). NULL for passwordless/demo/legacy users
-- (they cannot log in until they register a password).
alter table users add column if not exists password_hash text;

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

-- Hidden estimated level band the AI predicts from the story; the quiz
-- confirms where within [est_min, est_max] the user actually lands.
alter table quizzes add column if not exists est_min int not null default 1;
alter table quizzes add column if not exists est_max int not null default 40;

-- Chat policy: minimum level a sender must reach (in a tag-matching type) to
-- start a chat about this type with the owner. 0 = no requirement.
alter table types add column if not exists min_contact_level int not null default 0;

-- Social layer (Phase 2): posts feed + follow graph.
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  type_id uuid references types(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists follows (
  follower_id uuid not null references users(id) on delete cascade,
  followee_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

-- Real 1:1 chat (Phase 3.1). One conversation per unordered user pair
-- (user_lo < user_hi keeps it canonical so a pair can't create duplicates).
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references users(id) on delete cascade,
  user_hi uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_lo, user_hi)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Group chat: one room per tag ("ไทป์รูม"). Membership is implicit — anyone
-- with an active type carrying that tag can read/post. No room table needed.
create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_types_user on types(user_id);
create index if not exists idx_quizzes_type on quizzes(type_id);
create index if not exists idx_posts_user on posts(user_id);
create index if not exists idx_posts_created on posts(created_at desc);
create index if not exists idx_type_tags_tag on type_tags(tag);
create index if not exists idx_messages_conv on messages(conversation_id, created_at);
create index if not exists idx_group_messages_tag on group_messages(tag, created_at);
