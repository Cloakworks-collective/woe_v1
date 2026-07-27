import Link from "next/link";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { Flash } from "@/components/Flash";
import { Panel } from "@/components/Panel";
import { RACE_NAMES } from "@/lib/constants";
import { rankingScore, settlementTitle, totalPopulation } from "@/lib/engine";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { getWorld } from "@/lib/server/world";
import {
  adminBackfillStorage,
  adminCloseAge,
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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;

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

  return (
    <div className="frame" style={{ maxWidth: 980, flexDirection: "column", paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ font: "bold 24px Georgia", color: "var(--heading)" }}>👑 The Crown Chamber</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin/balance" style={{ fontSize: 14, color: "var(--gold)" }}>
            ⚖ Balance Workbench →
          </Link>
          <form action={adminLogout}>
            <button className="btn">Leave quietly</button>
          </form>
        </div>
      </div>
      <Flash err={err} ok={ok} />

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
        <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "10px 0" }} />
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

      <Panel title={`The Ledger of Souls — ${players.length} empires`}>
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
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} style={p.banned ? { opacity: 0.55 } : undefined}>
                <td>
                  <b>{p.name}</b>
                  {p.isBot ? " 🤖" : ""}
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{p.id}</div>
                </td>
                <td>{RACE_NAMES[p.race]}</td>
                <td className="num">{fmt(rankingScore(p))}</td>
                <td className="num">{fmt(totalPopulation(p))}</td>
                <td className="num">{fmt(p.gold + p.bankedGold)}</td>
                <td>
                  {settlementTitle(p)}
                  {p.banned && <b style={{ color: "var(--warn)" }}> · BANISHED</b>}
                  {p.starving && " · ☠ starving"}
                  {p.surrendered && " · 🏳"}
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
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
          Banishment blocks the session cookie, the realm token, and every command — the empire
          stays in the world (still attackable, still ticks) until pardoned.
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
        <hr style={{ border: "none", borderTop: "1px solid var(--border-light)", margin: "10px 0" }} />
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
