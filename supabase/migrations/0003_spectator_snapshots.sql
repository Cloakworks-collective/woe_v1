-- §14.4 — durable read-heavy edge: spectator snapshots.
--
-- The live world stays in the writer's memory (the §14.2 service) / the
-- world_docs blob (§14.1). This table is the read-scaling layer for §14.5:
-- the tick writes the top-N ladder + crown state here, and any number of
-- spectators read the latest row instead of recomputing the ladder per viewer.
--
-- Purpose-built for the world-doc model (keyed by era_number, no FK into the
-- unpopulated normalized `eras` table). Ordered by captured_at so "latest"
-- is correct across era resets (where the tick counter restarts).

create table if not exists spectator_snapshots (
  id           bigint generated always as identity primary key,
  era_number   int not null,
  era_name     text not null,
  tick         int not null,
  captured_at  timestamptz not null default now(),
  ladder       jsonb not null,   -- top-N [{id,name,race,score,pop,clanId}]
  crown        jsonb not null    -- { overlord:{holderId,name,cumMs,streakMs}, clan:{…}, winner }
);

create index if not exists spectator_snapshots_latest on spectator_snapshots (captured_at desc);

alter table spectator_snapshots enable row level security;

-- Spectating is public — anyone may read the ladder. Writes are server-only
-- (the service role bypasses RLS), so no insert policy is granted to anon.
create policy spectator_read on spectator_snapshots for select using (true);
