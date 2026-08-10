import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminTabs } from "@/components/AdminTabs";
import { Panel } from "@/components/Panel";
import { StatTile } from "@/components/StatTile";
import { TICKS_PER_HOUR } from "@/lib/constants";
import { adminEnabled, isAdmin } from "@/lib/server/admin";
import { getWorld } from "@/lib/server/world";
import { adminLogin } from "../actions";

export const dynamic = "force-dynamic";

const TICK_MINUTES = 60 / TICKS_PER_HOUR;
const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminHeartbeatPage() {
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
        <Panel title="🔒 The Crown Chamber">
          <AdminLoginForm action={adminLogin} />
        </Panel>
      </div>
    );
  }

  const world = await getWorld();
  const now = Date.now();
  const log = [...(world.tickLog ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const failures = log.filter((r) => !r.ok);
  const durations = log.map((r) => r.ms);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const maxMs = durations.length ? Math.max(...durations) : 0;
  const lastRunMs = log.length ? now - Date.parse(log[0].at) : NaN;

  // The biggest hole between consecutive runs — how long the world was frozen
  // at its worst this week. More telling than an average: one 6-hour gap is a
  // real outage, and it hides completely in a mean.
  let worstGapMs = 0;
  for (let i = 0; i < log.length - 1; i++) {
    worstGapMs = Math.max(worstGapMs, Date.parse(log[i].at) - Date.parse(log[i + 1].at));
  }

  const lateTone: "good" | "warn" | "bad" = !log.length
    ? "warn"
    : lastRunMs / 60_000 - TICK_MINUTES > TICK_MINUTES * 2
      ? "bad"
      : lastRunMs / 60_000 - TICK_MINUTES > 1
        ? "warn"
        : "good";

  return (
    <div className="frame" style={{ maxWidth: 980, flexDirection: "column", paddingTop: 20 }}>
      <div style={{ font: "bold 24px Georgia", color: "var(--heading)" }}>💓 The Heartbeat</div>
      <AdminTabs active="/admin/heartbeat" />

      <Panel
        title="The last 7 days of ticks"
        info="Every run that actually advanced the world clock, plus every failure. Runs that found nothing due are not recorded — the in-process path checks on every world read, and logging those would bury the signal."
      >
        <div className="stat-grid">
          <StatTile
            icon="💓"
            label="Last run"
            value={log.length ? ago(lastRunMs) : "never"}
            sub={log.length ? `tick ${fmt(log[0].tick)} · every ${TICK_MINUTES}m` : "no runs recorded yet"}
            tone={lateTone}
          />
          <StatTile
            icon="✅"
            label="Runs (7d)"
            value={fmt(log.length)}
            sub={`${fmt(log.reduce((s, r) => s + r.processed, 0))} ticks applied`}
          />
          <StatTile
            icon="⚠"
            label="Failures (7d)"
            value={fmt(failures.length)}
            sub={failures.length ? `last: ${when(failures[0].at)}` : "none — clean week"}
            tone={failures.length ? "bad" : "good"}
          />
          <StatTile
            icon="⏱"
            label="Run time"
            value={`${Math.round(avgMs)}ms avg`}
            sub={`slowest ${fmt(maxMs)}ms`}
            tone={maxMs > 5000 ? "warn" : undefined}
          />
          <StatTile
            icon="🕳"
            label="Worst gap"
            value={worstGapMs ? ago(worstGapMs).replace(" ago", "") : "—"}
            sub={`expected ${TICK_MINUTES}m between runs`}
            tone={worstGapMs > TICK_MINUTES * 60_000 * 3 ? "bad" : worstGapMs > TICK_MINUTES * 60_000 * 1.5 ? "warn" : "good"}
          />
        </div>
      </Panel>

      <Panel title={`The log — ${fmt(log.length)} run${log.length === 1 ? "" : "s"}, newest first`}>
        {log.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            Nothing recorded yet. The log fills as the clock advances — a run is written only when it
            actually applies a tick (or fails trying), so a quiet world writes nothing.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th className="num">Ago</th>
                  <th className="num">Tick</th>
                  <th className="num">Applied</th>
                  <th className="num">Took</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 300).map((r, i) => (
                  <tr key={`${r.at}-${i}`} style={r.ok ? undefined : { background: "color-mix(in srgb, var(--red) 14%, transparent)" }}>
                    <td>{when(r.at)}</td>
                    <td className="num">{ago(now - Date.parse(r.at))}</td>
                    <td className="num">{fmt(r.tick)}</td>
                    <td className="num">{fmt(r.processed)}</td>
                    <td className="num">{fmt(r.ms)}ms</td>
                    <td>
                      {r.ok ? (
                        <span style={{ color: "var(--pos)", fontWeight: 700 }}>ok</span>
                      ) : (
                        <>
                          <b style={{ color: "var(--neg)" }}>FAILED</b>
                          {r.error && (
                            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{r.error}</div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.length > 300 && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
            Showing the newest 300 of {fmt(log.length)}.
          </p>
        )}
      </Panel>
    </div>
  );
}
