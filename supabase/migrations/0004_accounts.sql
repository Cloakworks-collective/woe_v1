-- ONE account for the whole system, and one empire per account per age.
--
-- This supersedes the never-applied 0004_forum / 0005_forum_magic_links pair,
-- which gave the forum its own users table and its own login. That was a second
-- identity to explain: a realm token for the game, a handle for the boards, and
-- nothing joining them. There is now a single account, a single magic link, and
-- two things that account may claim — a forum handle (once, forever) and an
-- empire (once per age).
--
-- The account lives HERE rather than in the world blob because `eraReset`
-- replaces the whole world. Anything kept there dies with the age; the account
-- is the one thing that must outlive every age, which is exactly why the forum
-- needed its own table in the first place — this just makes it the identity for
-- both halves instead of only one.

-- ── Accounts ────────────────────────────────────────────────────────────────
-- No email, no password. The token IS the account, exactly as a realm token was
-- the empire: you get a magic link on first contact and pasting it signs you
-- in. Whoever holds the link is the account — a bearer credential, with that
-- model's tradeoffs, which is the trade the game has always made.
create table if not exists accounts (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,          -- woe_<40 hex>, the magic link
  -- The forum name, claimed the first time this account tries to POST. Null
  -- until then: reading the boards needs no handle, and an account that has
  -- only ever played the game has no reason to hold one.
  handle       text,
  handle_lower text unique,                   -- case-insensitive uniqueness
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

-- ── Bans ────────────────────────────────────────────────────────────────────
-- A ban SILENCES rather than locks out: a banned account still reads every
-- channel and still sees why and until when. That keeps the rules visible to
-- the person who most needs to read them, and gives fewer reasons to register a
-- fresh account. `until_at` NULL = permanent.
create table if not exists forum_bans (
  id         bigint generated always as identity primary key,
  account_id uuid not null references accounts (id) on delete cascade,
  reason     text,
  until_at   timestamptz,
  created_at timestamptz not null default now(),
  lifted_at  timestamptz
);
create index if not exists forum_bans_account on forum_bans (account_id, lifted_at);

-- ── Threads & posts ─────────────────────────────────────────────────────────
-- Channels are a fixed list in code (lib/constants/forum.ts), not rows: they
-- are part of the product, not user data, and a text column keeps the schema
-- from needing a migration every time one is renamed.
create table if not exists forum_threads (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null,
  title        text not null,
  author_id    uuid references accounts (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Denormalised so a channel listing is one query, not one-per-thread.
  last_post_at timestamptz not null default now(),
  post_count   int not null default 0,
  pinned       boolean not null default false,
  locked       boolean not null default false
);
create index if not exists forum_threads_channel on forum_threads (channel, pinned desc, last_post_at desc);

create table if not exists forum_posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references forum_threads (id) on delete cascade,
  author_id  uuid references accounts (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                      -- soft delete keeps replies readable
  deleted_by uuid references accounts (id) on delete set null
);
create index if not exists forum_posts_thread on forum_posts (thread_id, created_at);

-- Every table is server-only: the app talks to Supabase with the service role,
-- which bypasses RLS. No anon policies are granted, so a leaked anon key cannot
-- read account tokens or write posts. The token column is the whole security
-- boundary of the system now, so this matters more than it did.
alter table accounts      enable row level security;
alter table forum_bans    enable row level security;
alter table forum_threads enable row level security;
alter table forum_posts   enable row level security;
