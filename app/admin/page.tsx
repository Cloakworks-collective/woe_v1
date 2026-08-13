import { TICKS_PER_HOUR } from "@/lib/constants";
import { rankingScore } from "@/lib/engine";
import { storeMode } from "@/lib/server/store";
import { getWorld } from "@/lib/server/world";
import { accountStoreMode } from "@/lib/server/accounts";
import { adminBackfillStorage, adminCloseAge, adminForceTicks, adminSeed } from "./actions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const TICK_MINUTES = 60 / TICKS_PER_HOUR;

function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}

/** A vitals figure. Flat, scannable, and the tone is the whole point — an
 *  operator should be able to see "something is on fire" without reading. */
function Vital({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const colour = tone === "bad" ? "var(--neg)" : tone === "warn" ? "var(--coin)" : tone === "good" ? "var(--pos)" : undefined;
  return (
    <div style={{ border: "1px solid var(--flat-line)", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--ink-soft)" }}>
        {label}
      </div>
      <div style={{ font: "700 20px/1.2 Verdana, sans-serif", color: colour }}>{value}</div>
      {sub && <div className="flat-hint" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const world = await getWorld();
  const players = Object.values(world.players).sort((a, b) => rankingScore(b) - rankingScore(a));

  // Tick lateness is the single most important signal here: the world only
  // advances when the heartbeat fires, so if it has stopped, nothing else on
  // this page matters until it is running again.
  const now = Date.now();
  const lastTickMs = Date.parse(world.meta.lastTickAt);
  const sinceTick = Number.isFinite(lastTickMs) ? now - lastTickMs : NaN;
  const tickLate = sinceTick / 60_000 - TICK_MINUTES;
  const eraOver = Boolean(world.meta.winner);
  const tickTone: "good" | "warn" | "bad" = eraOver
    ? "warn"
    : !Number.isFinite(sinceTick)
      ? "bad"
      : tickLate > TICK_MINUTES * 2
        ? "bad"
        : tickLate > 1
          ? "warn"
          : "good";

  const humans = players.filter((p) => !p.isBot);
  const active24 = humans.filter((p) => p.lastSeenAtMs && now - p.lastSeenAtMs < 86_400_000).length;
  const banned = players.filter((p) => p.banned).length;
  const starving = players.filter((p) => p.starving).length;
  const premium = players.filter((p) => p.premium).length;
  const worldGold = players.reduce((s, p) => s + p.gold + p.bankedGold, 0);
  const winner = world.meta.winner;
  const forumMode = await accountStoreMode();

  return (
    <>
      {(err || ok) && <p className={`flat-notice ${err ? "is-bad" : "is-good"}`}>{err ?? ok}</p>}

      <div className="flat-card">
        <h2>Vitals</h2>
        <p className="flat-sub">
          Read the heartbeat first. If it has stalled the world is frozen and everything below is
          downstream of that.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Vital
            label="Heartbeat"
            value={eraOver ? "stopped" : Number.isFinite(sinceTick) ? ago(sinceTick) : "unknown"}
            sub={
              eraOver
                ? "the age is won — the world is deliberately halted"
                : tickTone === "good"
                  ? `on time · every ${TICK_MINUTES}m`
                  : tickTone === "warn"
                    ? `${Math.round(tickLate)}m late`
                    : "STALLED — check the cron"
            }
            tone={tickTone}
          />
          <Vital
            label="World store"
            value={storeMode() === "supabase" ? "Supabase" : "local file"}
            sub={storeMode() === "supabase" ? "durable" : "data/world.json — dev only"}
            tone={storeMode() === "supabase" ? "good" : "warn"}
          />
          <Vital
            label="Forum store"
            value={forumMode === "supabase" ? "Supabase" : "local file"}
            sub={forumMode === "supabase" ? "outlives eras" : "data/forum.json — dev only"}
            tone={forumMode === "supabase" ? "good" : "warn"}
          />
          <Vital
            label={winner ? "Age decided" : "Crown"}
            value={winner ? winner.name : (players[0]?.name ?? "—")}
            sub={winner ? `${winner.kind} · tick ${fmt(winner.atTick)}` : "current #1 by score"}
            tone={winner ? "warn" : undefined}
          />
          <Vital label="Empires" value={fmt(players.length)} sub={`${fmt(humans.length)} human`} />
          <Vital
            label="Active humans"
            value={fmt(active24)}
            sub="seen in the last 24h"
            tone={humans.length > 0 && active24 === 0 ? "bad" : undefined}
          />
          <Vital label="Starving" value={fmt(starving)} sub="frozen until fed" tone={starving > 0 ? "warn" : "good"} />
          <Vital label="Banished" value={fmt(banned)} tone={banned > 0 ? "warn" : undefined} />
          <Vital label="Charters" value={fmt(premium)} sub="premium holders" />
          <Vital label="Gold in world" value={fmt(worldGold)} sub="loose + vaulted" />
        </div>
      </div>

      <div className="flat-card">
        <h3>The world clock</h3>
        <p className="flat-sub">
          {world.meta.eraName} · tick {fmt(world.meta.tickNumber)}. Forced turns run on top of the
          wall clock, up to a week per press.
        </p>
        <div className="flat-row">
          <form action={adminForceTicks} className="flat-shrink">
            <input type="hidden" name="ticks" value="1" />
            <button className="flat-btn is-ghost" type="submit">+1 turn</button>
          </form>
          <form action={adminForceTicks} className="flat-shrink">
            <input type="hidden" name="ticks" value="144" />
            <button className="flat-btn is-ghost" type="submit">+1 day</button>
          </form>
          <form action={adminForceTicks} className="flat-row flat-shrink" style={{ gap: 6 }}>
            <input name="ticks" type="number" defaultValue={6} min={1} max={1008} aria-label="Turns to force" style={{ width: 90 }} />
            <button className="flat-btn is-ghost" type="submit">Force N</button>
          </form>
        </div>
      </div>

      <div className="flat-card">
        <h3>Close the age</h3>
        <p className="flat-sub">
          Seals this age&apos;s Annals for good and opens the next era, named for the current winner.
          <b> This wipes the world</b> — empires, ladder and in-game chat all reset. The Annals, and
          the forum, persist.
        </p>
        <form action={adminCloseAge}>
          <button className="flat-btn is-danger" type="submit">Close the age</button>
        </form>
      </div>

      <div className="flat-card">
        <h3>Dev tools</h3>
        <div className="flat-row" style={{ marginBottom: 10 }}>
          <form action={adminSeed} className="flat-row" style={{ gap: 8 }}>
            <select name="playerId" aria-label="Empire to seed">
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isBot ? " (bot)" : ""}
                </option>
              ))}
            </select>
            <button className="flat-btn is-ghost flat-shrink" type="submit">Seed rich data</button>
          </form>
        </div>
        <p className="flat-hint">
          Overwrites the chosen empire with a full, screenshot-ready state and refills the market
          book and price charts.
        </p>
        <hr style={{ border: 0, borderTop: "1px solid var(--flat-line)", margin: "14px 0" }} />
        <form action={adminBackfillStorage}>
          <button className="flat-btn is-ghost" type="submit">Backfill storage</button>
        </form>
        <p className="flat-hint" style={{ marginTop: 6 }}>
          Grants level-1 banking to any empire missing it and vaults loose goods up to capacity.
          Idempotent — fills gaps, never lowers.
        </p>
      </div>
    </>
  );
}
