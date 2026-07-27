// The headline of the Collegium: one glance tells you whether your scholars are
// bent over a book, standing idle awaiting orders, or absent entirely. Pure-CSS
// animation (aura, rising sparks, shimmer, drifting "z"s) — minimal words, and
// every state reads fully without motion (reduced-motion just stills it).

import Link from "next/link";
import { Art } from "@/components/Art";

export type ResearchStatus =
  | { state: "active"; fid: string; name: string; level: number; percent: number; eta: string; rate: number; scholars: number }
  | { state: "idle"; scholars: number }
  | { state: "silent" };

export function ResearchStatus(s: ResearchStatus) {
  if (s.state === "active") {
    return (
      <div className="rstat rstat-active" role="status">
        <div className="rstat-emblem rstat-studying">
          <span className="rstat-aura" aria-hidden />
          <Art path={`research/${s.fid}`} size={72} title={s.name} />
          <span className="rstat-spark k1" aria-hidden>✦</span>
          <span className="rstat-spark k2" aria-hidden>✦</span>
          <span className="rstat-spark k3" aria-hidden>✦</span>
        </div>
        <div className="rstat-main">
          <div className="rstat-kicker">⚗ Now researching</div>
          <div className="rstat-title">
            {s.name} <span className="rstat-lvl">Lv {s.level} → {s.level + 1}</span>
          </div>
          <div className="rstat-bar" aria-hidden>
            <i style={{ width: `${s.percent}%` }} />
          </div>
          <div className="rstat-meta">
            <b>{s.percent}%</b> · ⏳ {s.eta}
          </div>
        </div>
        <div className="rstat-side">
          <span className="rstat-chip">🎓 {s.scholars}</span>
          <span className="rstat-chip rstat-chip-rate">+{s.rate.toLocaleString("en-US")}/turn</span>
        </div>
      </div>
    );
  }

  if (s.state === "idle") {
    return (
      <div className="rstat rstat-idle" role="status">
        <div className="rstat-emblem rstat-ready">
          <span className="rstat-glow" aria-hidden />
          <span className="rstat-face" aria-hidden>🎓</span>
        </div>
        <div className="rstat-main">
          <div className="rstat-kicker">{s.scholars} {s.scholars === 1 ? "scholar stands" : "scholars stand"} ready</div>
          <div className="rstat-title">Choose a field to study</div>
          <div className="rstat-hint">
            pick one below <span className="rstat-arrow" aria-hidden>↓</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rstat rstat-silent" role="status">
      <div className="rstat-emblem rstat-sleeping">
        <span className="rstat-face" aria-hidden>📕</span>
        <span className="rstat-z z1" aria-hidden>z</span>
        <span className="rstat-z z2" aria-hidden>z</span>
        <span className="rstat-z z3" aria-hidden>z</span>
      </div>
      <div className="rstat-main">
        <div className="rstat-kicker">The Collegium sleeps</div>
        <div className="rstat-title">No scholars at work</div>
        <Link className="rstat-cta" href="/train#researchers">Assign scholars →</Link>
      </div>
    </div>
  );
}
