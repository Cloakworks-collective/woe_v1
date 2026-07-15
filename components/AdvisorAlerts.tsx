import Link from "next/link";
import { civilians, level, military, totalPopulation, wallName, type Player } from "@/lib/engine";

/**
 * The critical banners atop every page — each one is a councillor raising the
 * alarm from the empire's real numbers. Every banner links through to that
 * advisor (for the full counsel) and to the Field Manual (for the how), so the
 * red pill is a doorway, not a dead end. Ordered most-urgent first.
 */
export function AdvisorAlerts({ player: p }: { player: Player }) {
  const civ = civilians(p);
  const mil = military(p);
  const scatterLine = Math.ceil(0.3 * civ);
  const wallLvl = level(p, "walls");

  type Cta = { href: string; label: string; primary?: boolean };
  type Alert = {
    key: string;
    variant: "danger" | "warn";
    icon: string;
    title: string;
    body: React.ReactNode;
    ctas: Cta[];
  };
  const alerts: Alert[] = [];

  // 1 · Starvation — the empire is frozen (Treasurer Poll).
  if (p.starving) {
    alerts.push({
      key: "starving",
      variant: "danger",
      icon: "☠",
      title: "Treasurer Poll: the granaries are empty — the empire is frozen",
      body: (
        <>
          Food hit zero, so production, research, tax income, growth, and attacks are all suspended
          until your people eat — and upkeep is taken <i>before</i> each harvest, so one farmer&apos;s
          tick won&apos;t save you. Buy food now, or assign more farmers.
        </>
      ),
      ctas: [
        { href: "/market", label: "⚖ Buy food at the Bazaar", primary: true },
        { href: "/train", label: "👥 Assign farmers", primary: true },
        { href: "/advisors#economic", label: "Ask Treasurer Poll →" },
        { href: "/guide#grow", label: "📜 Field Manual" },
      ],
    });
  }

  // 2 · Population about to scatter (General Vosk).
  if (!p.starving && totalPopulation(p) >= 500 && mil < scatterLine) {
    alerts.push({
      key: "scatter",
      variant: "warn",
      icon: "🏃",
      title: "General Vosk: your people are about to scatter",
      body: (
        <>
          Only <b>{mil}</b> soldiers guard <b>{civ}</b> civilians — below the <b>{scatterLine}</b>{" "}
          needed to hold the 30% line. At the next dawn, unprotected peasants will walk away for
          good, and lost population drags your ranking down hard. Train warriors back above the line
          before then.
        </>
      ),
      ctas: [
        { href: "/train", label: "⚔ Train warriors", primary: true },
        { href: "/advisors#military", label: "Ask General Vosk →" },
        { href: "/guide#battle", label: "📜 Field Manual" },
      ],
    });
  }

  // 3 · Walls badly breached (Marshal Aldric).
  if (!p.starving && wallLvl > 0 && p.wallIntegrity < 0.6) {
    alerts.push({
      key: "walls",
      variant: "warn",
      icon: "🧱",
      title: "Marshal Aldric: the walls are breached",
      body: (
        <>
          The {wallName(p)} is battered to <b>{Math.round(p.wallIntegrity * 100)}%</b> — its defence
          bonus is gutted and the rubble frightens off up to half your daily settlers. A repair costs
          only half the damage in materials; send the masons before the next assault.
        </>
      ),
      ctas: [
        { href: "/buildings", label: "🧱 Repair the walls", primary: true },
        { href: "/advisors#defensive", label: "Ask Marshal Aldric →" },
        { href: "/guide#defense", label: "📜 Field Manual" },
      ],
    });
  }

  if (alerts.length === 0) return null;

  return (
    <>
      {alerts.map((a) => (
        <div key={a.key} className={`alert alert-${a.variant}`} role="alert">
          <span className="alert-icon">{a.icon}</span>
          <div>
            <div className="alert-title">{a.title}</div>
            <div className="alert-body">{a.body}</div>
            <div className="alert-actions">
              {a.ctas.map((c) => (
                <Link key={c.href} className={c.primary ? "alert-cta" : "alert-cta alert-cta-ghost"} href={c.href}>
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
