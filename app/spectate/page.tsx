"use client";

// §14.5 — the public live spectator view. Polls /api/spectate every few seconds
// and renders the latest tick snapshot (top ladder + crown clocks). No auth, no
// per-viewer recomputation: every spectator reads the same one indexed row.

import { useEffect, useState } from "react";
import Link from "next/link";
import { HOLD_CLOCKS, POPULATION_FLOORS } from "@/lib/constants";

const MS_PER_HOUR = 3_600_000;
const POLL_MS = 5_000;

interface CrownHold {
  holderId?: string;
  name?: string;
  cumMs: number;
  streakMs: number;
}
interface Snapshot {
  empty?: boolean;
  eraNumber: number;
  eraName: string;
  tick: number;
  capturedAt: string;
  ladder: { id: string; name: string; race: string; score: number; pop: number; clanId?: string }[];
  crown: { overlord: CrownHold; clan: CrownHold; winner?: { kind: string; name: string } };
}

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

function Clock({ heldMs, targetHours }: { heldMs: number; targetHours: number }) {
  const heldHours = heldMs / MS_PER_HOUR;
  const pct = Math.max(0, Math.min(100, (heldHours / targetHours) * 100));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-block", width: 120, height: 8, background: "rgba(0,0,0,.15)", borderRadius: 4, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${pct}%`, background: pct >= 100 ? "var(--gold, #d4af37)" : "var(--red, #7c2d12)" }} />
      </span>
      <small>
        {heldHours.toFixed(1)} / {targetHours}h
      </small>
    </span>
  );
}

export default function SpectatePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/spectate", { cache: "no-store" });
        const data = (await res.json()) as Snapshot;
        if (alive) {
          setSnap(data);
          setError(null);
        }
      } catch {
        if (alive) setError("Could not reach the realm.");
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000); // live-animate the streak
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (error && !snap) return <Shell>{error}</Shell>;
  if (!snap) return <Shell>Peering into the realm…</Shell>;
  if (snap.empty) {
    return (
      <Shell>
        No live snapshot yet. Spectating requires the world to be publishing snapshots
        (Supabase configured on the server). <Link href="/login">Enter the game →</Link>
      </Shell>
    );
  }

  // Live-animate a clock only for the reigning holder (ladder #1 still matches).
  const capturedMs = new Date(snap.capturedAt).getTime();
  const leaderId = snap.ladder[0]?.id;
  const liveExtra = (h: CrownHold, stillLeads: boolean) => (stillLeads && h.holderId ? Math.max(0, now - capturedMs) : 0);
  const o = snap.crown.overlord;
  const oLeads = !!o.holderId && o.holderId === leaderId;
  const oExtra = liveExtra(o, oLeads);
  const c = snap.crown.clan;

  const ago = Math.max(0, Math.round((now - capturedMs) / 1000));

  return (
    <Shell>
      {snap.crown.winner && (
        <div style={{ padding: 12, marginBottom: 16, background: "var(--gold, #d4af37)", color: "#3a2a00", borderRadius: 6, fontWeight: 700 }}>
          🏆 {snap.crown.winner.name} has won {snap.eraName} ({snap.crown.winner.kind}). The age is sealed.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0, fontFamily: "Georgia, serif" }}>🔭 {snap.eraName}</h1>
        <span style={{ opacity: 0.6, fontSize: 13 }}>
          turn {fmt(snap.tick)} · updated {ago}s ago · live
        </span>
      </div>

      <section style={{ margin: "16px 0", padding: 14, border: "1px solid var(--border-light, #cbb894)", borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>👑 The Race to the Throne</h3>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Grand Overlord {o.name ? `— ${o.name}` : "— (frozen, no eligible #1)"}</div>
            <div style={{ marginTop: 4, fontSize: 14 }}>
              Total <Clock heldMs={o.cumMs + oExtra} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />{" "}
              · Streak <Clock heldMs={o.streakMs + oExtra} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Clan {c.name ? `— ${c.name}` : "— (none eligible)"}</div>
            <div style={{ marginTop: 4, fontSize: 14 }}>
              Total <Clock heldMs={c.cumMs} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />{" "}
              · Streak <Clock heldMs={c.streakMs} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, opacity: 0.7, margin: "8px 0 0" }}>
          Hold #1 for {HOLD_CLOCKS.CUMULATIVE_HOURS}h total and {HOLD_CLOCKS.STREAK_HOURS}h unbroken, above{" "}
          {fmt(POPULATION_FLOORS.GRAND_OVERLORD)} population, to win the age.
        </p>
      </section>

      <h3>The Ladder</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border-light, #cbb894)" }}>
              <th style={{ padding: "6px 10px" }}>#</th>
              <th style={{ padding: "6px 10px" }}>Empire</th>
              <th style={{ padding: "6px 10px" }}>Race</th>
              <th style={{ padding: "6px 10px", textAlign: "right" }}>Score</th>
              <th style={{ padding: "6px 10px", textAlign: "right" }}>Population</th>
            </tr>
          </thead>
          <tbody>
            {snap.ladder.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: "1px solid rgba(0,0,0,.08)", background: i === 0 ? "rgba(212,175,55,.15)" : undefined }}>
                <td style={{ padding: "6px 10px" }}>{i === 0 ? "👑" : i + 1}</td>
                <td style={{ padding: "6px 10px", fontWeight: i === 0 ? 700 : 400 }}>{p.name}</td>
                <td style={{ padding: "6px 10px", textTransform: "capitalize" }}>{p.race}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(p.score)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(p.pop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 18px", lineHeight: 1.5 }}>
      {children}
      <p style={{ marginTop: 24, fontSize: 13, opacity: 0.6 }}>
        <Link href="/login">⚔ Found your own empire →</Link>
      </p>
    </main>
  );
}
