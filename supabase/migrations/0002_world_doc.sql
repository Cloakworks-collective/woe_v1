-- Interim persistence: the whole World as one versioned JSONB document,
-- mirroring the dev file store 1:1 so serverless deploys have real
-- persistence today. The normalized tables from 0001 take over when the
-- SupabaseStore is decomposed (players/market/battles/etc. per row).
-- Service-role access only — RLS enabled with no policies.

create table world_docs (
  id          text primary key,
  doc         jsonb not null,
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);

alter table world_docs enable row level security;
