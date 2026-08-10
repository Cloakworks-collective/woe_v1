-- The forum — a place that OUTLIVES the game.
--
-- Deliberately not in the world blob. `eraReset` replaces the whole world, so
-- anything kept there is wiped when an age ends; the forum is the one surface
-- that must survive every reset, be readable by someone with no empire at all,
-- and keep its own accounts. Hence its own tables and its own login.
--
-- In-game chat is a different thing entirely and stays where it is: era chat
-- and letters live in the world blob and are meant to die with the age; clan
-- chat lives in the clan. Nothing here touches them.

-- ── Accounts ────────────────────────────────────────────────────────────────
-- Open signup: a handle and a password, no empire required. Passwords are
-- scrypt hashes with a per-user salt (see lib/server/forumAuth.ts) — the plain
-- text never reaches this table.
create table if not exists forum_users (
  id            uuid primary key default gen_random_uuid(),
  handle        text not null,
  handle_lower  text not null unique,          -- case-insensitive uniqueness
  password_hash text not null,                 -- scrypt, "salt:derived" hex
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  -- Optional vanity link to an empire. Purely cosmetic: it shows a banner
  -- beside the handle and confers nothing.
  empire_name   text
);

-- ── Bans ────────────────────────────────────────────────────────────────────
-- A ban SILENCES rather than locks out: a banned account still reads every
-- channel and still sees why and until when. That keeps the rules visible to
-- the person who most needs to read them, and gives fewer reasons to register
-- a fresh account. `until_at` NULL = permanent.
create table if not exists forum_bans (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references forum_users (id) on delete cascade,
  reason     text,
  until_at   timestamptz,                      -- null = permanent
  created_at timestamptz not null default now(),
  lifted_at  timestamptz                       -- set when an admin pardons
);
create index if not exists forum_bans_user on forum_bans (user_id, lifted_at);

-- ── Threads & posts ─────────────────────────────────────────────────────────
-- Channels are a fixed list in code (lib/constants/forum.ts), not rows: they
-- are part of the product, not user data, and a text column keeps the schema
-- from needing a migration every time one is renamed.
create table if not exists forum_threads (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  title       text not null,
  author_id   uuid references forum_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Denormalised so a channel listing is one query, not one-per-thread.
  last_post_at timestamptz not null default now(),
  post_count  int not null default 0,
  pinned      boolean not null default false,
  locked      boolean not null default false
);
create index if not exists forum_threads_channel on forum_threads (channel, pinned desc, last_post_at desc);

create table if not exists forum_posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references forum_threads (id) on delete cascade,
  author_id  uuid references forum_users (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                      -- soft delete keeps replies readable
  deleted_by uuid references forum_users (id) on delete set null
);
create index if not exists forum_posts_thread on forum_posts (thread_id, created_at);

-- Every table is server-only: the app talks to Supabase with the service role,
-- which bypasses RLS. No anon policies are granted, so a leaked anon key
-- cannot read password hashes or write posts.
alter table forum_users   enable row level security;
alter table forum_bans    enable row level security;
alter table forum_threads enable row level security;
alter table forum_posts   enable row level security;
