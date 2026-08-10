import Link from "next/link";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminTabs } from "@/components/AdminTabs";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { StatTile } from "@/components/StatTile";
import { RACE_NAMES, TICKS_PER_HOUR } from "@/lib/constants";
import { rankingScore, settlementTitle, totalPopulation } from "@/lib/engine";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { storeMode } from "@/lib/server/store";
import { getWorld } from "@/lib/server/world";
import {
  adminBackfillStorage,
  adminCloseAge,
  adminEnterAs,
  adminForceTicks,
  adminGrant,
  adminLogin,
  adminLogout,
  adminSeed,
  adminSetBan,
  adminSetPremium,
} from "./actions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** Minutes between ticks — the world's heartbeat. */
const TICK_MINUTES = 60 / TICKS_PER_HOUR;

function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; q?: string; only?: string }>;
}) {
  const { err, ok, q, only } = await searchParams;

  if (!adminEnabled()) {
    return (
      <div className="frame" style={{ maxWidth: 560, flexDirection: "column", paddingTop: 40 }}>
        <Panel title="🔒 The Crown Chamber">
          <p style={{ fontSize: 14.5 }}>
            The chamber is sealed. Set <code>ADMIN_PASSWORD</code> in the environment to open it.
          </p>
        </Panel>
      </div>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="frame" style={{ maxWidth: 560, flexDirection: "column", paddingTop: 40 }}>
        <Flash err={err} />
        <Panel title="🔒 The Crown Chamber">
          <AdminLoginForm action={adminLogin} />
        </Panel>
      </div>
    );
  }

  const world = await getWorld();
  const players = Object.values(world.players).sort((a, b) => rankingScore(b) - rankingScore(a));

  // ── Realm vitals — what an operator needs before touching anything ────────
  // The world only advances when the tick cron fires, so tick lateness is the
  // single most important signal on this page: if the heartbeat stops, the game
  // has stopped, and nothing else here matters until it is running again.
  const now = Date.now();
  const lastTickMs = Date.parse(world.meta.lastTickAt);
  const sinceTick = Number.isFinite(lastTickMs) ? now - lastTickMs : NaN;
  const tickLate = sinceTick / 60_000 - TICK_MINUTES;
  const tickTone: "good" | "warn" | "bad" = !Number.isFinite(sinceTick)
    ? "bad"
    : tickLate > TICK_MINUTES * 2
      ? "bad"
      : tickLate > 1
        ? "warn"
        : "good";

  const humans = players.filter((p) => !p.isBot);
  const bots = players.filter((p) => p.isBot);
  const active24 = humans.filter((p) => p.lastSeenAtMs && now - p.lastSeenAtMs < 86_400_000).length;
  const banned = players.filter((p) => p.banned).length;
  const starving = players.filter((p) => p.starving).length;
  const vacationing = players.filter((p) => p.onVacation).length;
  const premium = players.filter((p) => p.premium).length;
  const worldGold = players.reduce((s, p) => s + p.gold + p.bankedGold, 0);
  const crown = players[0];
  const winner = world.meta.winner;

  // The ledger is already 40-odd rows and only grows — a GET filter keeps it
  // navigable without shipping any client JS.
  const needle = (q ?? "").trim().toLowerCase();
  const ledger = players.filter((p) => {
    if (needle && !`${p.name} ${p.id} ${RACE_NAMES[p.race]}`.toLowerCase().includes(needle)) return false;
    if (only === "humans") return !p.isBot;
    if (only === "bots") return Boolean(p.isBot);
    if (only === "banned") return Boolean(p.banned);
    if (only === "premium") return Boolean(p.premium);
    if (only === "trouble") return Boolean(p.starving) || Boolean(p.banned);
    return true;
  });
  const FILTERS: { id: string; label: string }[] = [
    { id: "", label: "All" },
    { id: "humans", label: "Humans" },
    { id: "bots", label: "Bots" },
    { id: "trouble", label: "Trouble" },
    { id: "banned", label: "Banished" },
    { id: "premium", label: "Charters" },
  ];

  return (
    <div className="frame" style={{ maxWidth: 980, flexDirection: "column", paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ font: "bold 24px Georgia", color: "var(--heading)" }}>👑 The Crown Chamber</div>
        <form action={adminLogout}>
          <button className="btn btn-no" style={{ cursor: "pointer" }}>
            Leave quietly
          </button>
        </form>
      </div>
      {/* The Workbench used to hang off a gold-on-parchment link here, which
          was all but invisible. The rooms are tabs now. */}
      <AdminTabs active="/admin" />
      <Flash err={err} ok={ok} />

      <Panel
        title="Realm Vitals — is anything on fire?"
        info="Read top-left first: if the heartbeat is late, the tick cron has stopped and the whole world is frozen. Everything else is downstream of that."
      >
        <div className="stat-grid">
          <StatTile
            icon="💓"
            label="Heartbeat"
            value={Number.isFinite(sinceTick) ? ago(sinceTick) : "unknown"}
            sub={
              tickTone === "good"
                ? `on time · every ${TICK_MINUTES}m`
                : tickTone === "warn"
                  ? `${Math.round(tickLate)}m late — watch it`
                  : "STALLED — check the tick cron"
            }
            tone={tickTone}
          />
          <StatTile
            icon="🗄"
            label="Store"
            value={storeMode() === "supabase" ? "Supabase" : "local file"}
            sub={storeMode() === "supabase" ? "durable" : "data/world.json — dev only"}
            tone={storeMode() === "supabase" ? "good" : "warn"}
          />
          <StatTile
            icon="👑"
            label={winner ? "Age decided" : "Crown"}
            value={winner ? winner.name : (crown?.name ?? "—")}
            sub={winner ? `${winner.kind} · won at tick ${fmt(winner.atTick)}` : "current #1 by score"}
            tone={winner ? "warn" : undefined}
          />
          <StatTile
            icon="🏰"
            label="Empires"
            value={fmt(players.length)}
            sub={`${fmt(humans.length)} human · ${fmt(bots.length)} bot`}
          />
          <StatTile
            icon="🔥"
            label="Active humans"
            value={fmt(active24)}
            sub="seen in the last 24h"
            tone={humans.length > 0 && active24 === 0 ? "bad" : undefined}
          />
          <StatTile
            icon="☠"
            label="Starving"
            value={fmt(starving)}
            sub="frozen until fed"
            tone={starving > 0 ? "warn" : "good"}
          />
          <StatTile
            icon="⛔"
            label="Banished"
            value={fmt(banned)}
            sub={`${fmt(vacationing)} on vacation`}
            tone={banned > 0 ? "warn" : undefined}
          />
          <StatTile icon="✦" label="Charters" value={fmt(premium)} sub="premium holders" />
          <StatTile icon="💰" label="Gold in world" value={fmt(worldGold)} sub="loose + vaulted" />
          <StatTile
            icon="⚖"
            label="Market"
            value={fmt(world.orders.length)}
            sub={`${fmt(world.battles.length)} battles on file`}
          />
        </div>
      </Panel>

      <Panel title={`The World — ${world.meta.eraName}, tick ${fmt(world.meta.tickNumber)}`}>
        <form action={adminForceTicks} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="ticks" value="1" />
          <button className="btn">⏩ Force +1 turn</button>
        </form>{" "}
        <form action={adminForceTicks} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="ticks" value="144" />
          <button className="btn">⏭ Force +1 day</button>
        </form>{" "}
        <form action={adminForceTicks} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            name="ticks"
            type="number"
            defaultValue={6}
            min={1}
            max={1008}
            aria-label="Turns to force"
            style={{ width: 70 }}
          />
          <button className="btn">Force N turns</button>
        </form>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>
          Forced turns run on top of the wall clock (max 1,008 = 1 week per press).
        </p>
        <hr className="rule" />
        <form action={adminCloseAge} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button className="btn" style={{ background: "linear-gradient(#a8853f,#7c5426)", borderColor: "#4e3113" }}>
            📜 Close the Age
          </button>
        </form>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>
          Seals this age&apos;s Annals for good and opens the next era (named for the current winner,
          or &ldquo;an Unnamed Victor&rdquo; if none). <b>This wipes the world</b> — empires, ladder,
          and chat reset; the sealed Annals persist.
        </p>
      </Panel>

      <Panel title="Royal Grant — give (or take, with negatives) resources">
        <form action={adminGrant} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 14.5 }}>
          <select name="playerId" aria-label="Empire">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isBot ? " 🤖" : ""}
              </option>
            ))}
          </select>
          {(["gold", "food", "wood", "stone", "ore"] as const).map((r) => (
            <label key={r} style={{ fontSize: 13.5 }}>
              {r} <input name={r} type="number" defaultValue={0} style={{ width: 90 }} aria-label={`Grant ${r}`} />
            </label>
          ))}
          <button className="btn">👑 Decree</button>
        </form>
      </Panel>

      <Panel title={`The Ledger of Souls — ${fmt(ledger.length)} of ${fmt(players.length)} empires`}>
        <form method="get" className="admin-filter">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, id, or race…"
            aria-label="Search empires"
          />
          {only && <input type="hidden" name="only" value={only} />}
          <button className="btn">Search</button>
          <span className="admin-filter-chips">
            {FILTERS.map((f) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              if (f.id) params.set("only", f.id);
              const href = `/admin${params.toString() ? `?${params}` : ""}`;
              const on = (only ?? "") === f.id;
              return (
                <Link key={f.id || "all"} href={href} className={`chip${on ? " chip-on" : ""}`}>
                  {f.label}
                </Link>
              );
            })}
          </span>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th>Empire</th>
              <th>Race</th>
              <th className="num">Score</th>
              <th className="num">Pop</th>
              <th className="num">Gold</th>
              <th>Status</th>
              <th>Charter</th>
              <th>Fate</th>
              <th>Throne</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((p) => (
              <tr key={p.id} style={p.banned ? { opacity: 0.55 } : undefined}>
                <td>
                  <b>{p.name}</b>
                  {p.isBot ? " 🤖" : ""}
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{p.id}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    {p.isBot ? "—" : p.lastSeenAtMs ? `seen ${ago(now - p.lastSeenAtMs)}` : "never seen"}
                  </div>
                </td>
                <td>{RACE_NAMES[p.race]}</td>
                <td className="num">{fmt(rankingScore(p))}</td>
                <td className="num">{fmt(totalPopulation(p))}</td>
                <td className="num">{fmt(p.gold + p.bankedGold)}</td>
                <td>
                  {settlementTitle(p)}
                  {p.banned && <b style={{ color: "var(--warn)" }}> · BANISHED</b>}
                  {p.starving && " · ☠ starving"}
                  {p.onVacation && " · 🏳"}
                </td>
                <td>
                  <form action={adminSetPremium} style={{ display: "inline" }}>
                    <input type="hidden" name="playerId" value={p.id} />
                    <input type="hidden" name="flag" value={p.premium ? "0" : "1"} />
                    <button className="btn" title={p.premium ? "Revoke the Royal Charter" : "Grant the Royal Charter"}>
                      {p.premium ? "✦ revoke" : "grant ✦"}
                    </button>
                  </form>
                </td>
                <td>
                  <form action={adminSetBan} style={{ display: "inline" }}>
                    <input type="hidden" name="playerId" value={p.id} />
                    <input type="hidden" name="flag" value={p.banned ? "0" : "1"} />
                    <button className="btn" title={p.banned ? "Pardon — restore access" : "Banish — block all logins and commands"}>
                      {p.banned ? "🕊 pardon" : "⛔ banish"}
                    </button>
                  </form>
                </td>
                <td>
                  {p.isBot ? (
                    <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>—</span>
                  ) : (
                    <form action={adminEnterAs} style={{ display: "inline" }}>
                      <input type="hidden" name="playerId" value={p.id} />
                      <button className="btn" title={`Take the session as ${p.name} — you leave the chamber`}>
                        🔑 enter
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
          Banishment blocks the session cookie, the realm token, and every command — the empire
          stays in the world (still attackable, still ticks) until pardoned.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>
          <b>🔑 enter</b> swaps your player session for that empire&apos;s and drops you on its
          Command View — the debug door that used to sit on the founding screen. Bots hold no
          session. Your admin cookie survives, so <code>/admin</code> takes you back.
        </p>
      </Panel>

      <Panel title="🔧 Dev Tools — testing shortcuts">
        <form action={adminSeed} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 14.5 }}>
          <select name="playerId" aria-label="Empire to seed">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isBot ? " 🤖" : ""}
              </option>
            ))}
          </select>
          <button className="btn">🌱 Seed rich data</button>
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Overwrites the chosen empire with a full, screenshot-ready state (buildings, army,
            research, coffers, premium) and refills the market book + price charts.
          </span>
        </form>
        <hr className="rule" />
        <form action={adminBackfillStorage} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button className="btn">🏦 Backfill storage</button>
        </form>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4 }}>
          Grants level-1 banking (Counting House + the four resource stores) to any empire missing
          it, and vaults their loose goods up to capacity. Idempotent — fills gaps, never lowers.
        </p>
      </Panel>
    </div>
  );
}
