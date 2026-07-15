-- War of Empires — initial schema (spec/architecture.md Engineering Decisions).
-- Player state is a versioned JSONB document; market/battles/clans/forum/
-- rankings/eras are normalized. Writes go through the service role only;
-- RLS restricts direct client reads to own rows + public data.

create table eras (
  id            bigint generated always as identity primary key,
  number        int not null,
  name          text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  winner_kind   text check (winner_kind in ('overlord', 'clan')),
  winner_name   text
);

create table players (
  id            uuid primary key,
  auth_user_id  uuid references auth.users (id) on delete set null,
  era_id        bigint not null references eras (id),
  name          text not null,
  doc           jsonb not null,          -- the Player document (lib/engine/types.ts)
  version       int not null default 1,  -- optimistic concurrency
  is_bot        boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (era_id, name)
);

create table clans (
  id            uuid primary key,
  era_id        bigint not null references eras (id),
  name          text not null,
  doc           jsonb not null,          -- the Clan document
  version       int not null default 1,
  unique (era_id, name)
);

create table market_orders (
  id            uuid primary key,
  era_id        bigint not null references eras (id),
  seller_id     uuid not null references players (id) on delete cascade,
  resource      text not null check (resource in ('food','wood','stone','ore')),
  remaining     int not null check (remaining >= 0),
  price_per_unit numeric not null check (price_per_unit > 0),
  created_tick  int not null
);
create index market_orders_book on market_orders (era_id, resource, price_per_unit, created_tick);

create table battle_reports (
  id            uuid primary key,
  era_id        bigint not null references eras (id),
  attacker_id   uuid not null references players (id) on delete cascade,
  defender_id   uuid not null references players (id) on delete cascade,
  tick          int not null,
  doc           jsonb not null           -- the BattleReport document
);
create index battle_reports_by_player on battle_reports (era_id, attacker_id, defender_id, tick desc);

create table events (
  id            bigint generated always as identity primary key,
  era_id        bigint not null references eras (id),
  player_id     uuid not null references players (id) on delete cascade,
  tick          int not null,
  event         jsonb not null           -- GameEvent; delivered via Realtime
);
create index events_by_player on events (player_id, id desc);

create table messages (
  id            uuid primary key,
  era_id        bigint references eras (id),  -- null for DMs: they outlive eras
  channel       text not null,                -- 'era' | 'clan:<id>' | 'dm:<a>:<b>'
  author_id     uuid not null references players (id) on delete cascade,
  author_name   text not null,
  body          text not null check (char_length(body) <= 800),
  tick          int not null,
  created_at    timestamptz not null default now()
);
create index messages_by_channel on messages (channel, id);

create table ranking_snapshots (
  id            bigint generated always as identity primary key,
  era_id        bigint not null references eras (id),
  tick          int not null,
  ladder        jsonb not null           -- [{playerId, name, score, pop}, …]
);

create table world_meta (
  era_id             bigint primary key references eras (id),
  tick_number        int not null,
  last_tick_at       timestamptz not null,
  overlord_clocks    jsonb not null default '{}',
  overlord_streak    jsonb,
  clan_clocks        jsonb not null default '{}',
  clan_streak        jsonb,
  winner             jsonb
);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table players enable row level security;
alter table clans enable row level security;
alter table market_orders enable row level security;
alter table battle_reports enable row level security;
alter table events enable row level security;
alter table messages enable row level security;
alter table ranking_snapshots enable row level security;
alter table world_meta enable row level security;
alter table eras enable row level security;

-- Public reads: eras, rankings, clan directory (name/doc minus ledger is
-- shaped by a view in a later migration; doc read is acceptable at launch).
create policy eras_read on eras for select using (true);
create policy rankings_read on ranking_snapshots for select using (true);
create policy meta_read on world_meta for select using (true);

-- Players read their own document only (ladder data comes from snapshots).
create policy players_own_read on players for select
  using (auth.uid() = auth_user_id);

-- Battle reports: visible to both parties.
create policy battles_parties_read on battle_reports for select
  using (exists (
    select 1 from players p
    where p.auth_user_id = auth.uid() and (p.id = attacker_id or p.id = defender_id)
  ));

-- Events: own feed only.
create policy events_own_read on events for select
  using (exists (
    select 1 from players p where p.auth_user_id = auth.uid() and p.id = player_id
  ));

-- Messages: era chat is public; clan chat requires membership (checked via
-- the player's doc); DMs require being a participant (channel contains id).
create policy messages_read on messages for select
  using (
    channel = 'era'
    or exists (
      select 1 from players p
      where p.auth_user_id = auth.uid()
        and (
          channel = 'clan:' || (p.doc ->> 'clanId')
          or channel like 'dm:%' || p.id || '%'
        )
    )
  );

-- Market: the order book is public but ANONYMOUS — clients read through this
-- view (no seller_id); the base table stays service-role-only.
create view market_book as
  select id, resource, remaining, price_per_unit, created_tick
  from market_orders
  where remaining > 0;

-- No insert/update/delete policies anywhere: all writes go through API
-- routes using the service role. The client never computes outcomes.
