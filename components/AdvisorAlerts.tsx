import Link from "next/link";
import { Art } from "@/components/Art";
import { Glyph, glyphs } from "@/components/Glyph";
import { advisor, advisorHref, type AdvisorKey } from "@/lib/constants/advisors";
import {
  buildingIntegrity,
  civilians,
  level,
  military,
  popPerDay,
  theWallName,
  totalPopulation,
  vacantHousing,
  type Player,
} from "@/lib/engine";
import type { BuildingId } from "@/lib/constants/buildings";

const STORE_NAMES: { id: BuildingId; name: string }[] = [
  { id: "counting_house", name: "Counting House" },
  { id: "granary", name: "Granary" },
  { id: "timberyard", name: "Timberyard" },
  { id: "masons_yard", name: "Mason's Yard" },
  { id: "ironhold", name: "Ironhold" },
];

/**
 * The critical banners atop every page — each one is a councillor raising the
 * alarm from the empire's real numbers. Every banner links through to that
 * advisor (for the full counsel) and to the Field Manual (for the how), so the
 * red pill is a doorway, not a dead end. Ordered most-urgent first.
 *
 * An alert names its councillor by KEY, never by a written-out name: the name,
 * the portrait and the "Ask …" link all come from lib/constants/advisors, so a
 * banner cannot drift from the Council Chamber the way it used to (the housing
 * banner said "Steward Maren", the Chamber said "The Steward", and the portrait
 * beside it was whatever race you had picked).
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
    /** Who is speaking — supplies the name, the portrait and the "Ask …" link. */
    advisor: AdvisorKey;
    /** A topic glyph, badged onto the portrait: what the alarm is ABOUT. */
    icon: string;
    /** The alarm itself. The councillor's name is prefixed on render. */
    headline: string;
    body: React.ReactNode;
    /** Actions that fix it. The "Ask …" and Field Manual links are appended. */
    ctas: Cta[];
    manual: string;
  };
  const alerts: Alert[] = [];

  // 1 · Starvation — the empire is frozen (Treasurer Poll).
  if (p.starving) {
    alerts.push({
      key: "starving",
      variant: "danger",
      advisor: "economic",
      icon: "☠",
      headline: "the granaries are empty — the empire is frozen",
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
      ],
      manual: "/guide#grow",
    });
  }

  // 2 · Population about to scatter (General Vosk).
  if (!p.starving && totalPopulation(p) >= 500 && mil < scatterLine) {
    alerts.push({
      key: "scatter",
      variant: "warn",
      advisor: "military",
      icon: "🏃",
      headline: "your people are about to scatter",
      body: (
        <>
          Only <b>{mil}</b> soldiers guard <b>{civ}</b> civilians — below the <b>{scatterLine}</b>{" "}
          needed to hold the 30% line. At the next dawn, unprotected peasants will walk away for
          good, and lost population drags your ranking down hard. Raise more troops above the line
          before then.
        </>
      ),
      ctas: [
        { href: "/troops", label: "⚔ Raise troops", primary: true },
      ],
      manual: "/guide#battle",
    });
  }

  // 3 · Walls badly breached (Marshal Aldric).
  if (!p.starving && wallLvl > 0 && p.wallIntegrity < 0.6) {
    alerts.push({
      key: "walls",
      variant: "warn",
      advisor: "defensive",
      icon: "🧱",
      headline: "the walls are breached",
      body: (
        <>
          {theWallName(p)} is battered to <b>{Math.round(p.wallIntegrity * 100)}%</b> — its defence
          bonus is gutted and the rubble frightens off up to half your daily settlers. A repair costs
          only half the damage in materials; send the masons before the next assault.
        </>
      ),
      ctas: [
        { href: "/buildings", label: "🧱 Repair the walls", primary: true },
      ],
      manual: "/guide#defense",
    });
  }

  // 4 · Housing can't fit the dawn's settlers — arrivals above the vacant beds
  //     are LOST, not queued (Steward Maren). arrived = min(perDay, vacant).
  const perDay = popPerDay(p);
  const vacant = vacantHousing(p);
  if (!p.starving && vacant < perDay) {
    const turnedAway = perDay - vacant;
    alerts.push({
      key: "housing",
      variant: "warn",
      advisor: "population",
      icon: "🏠",
      headline: "there are no beds for the dawn's settlers",
      body: (
        <>
          <b>{perDay}</b> settlers will arrive at dawn but only <b>{vacant}</b> bed
          {vacant === 1 ? "" : "s"} stand{vacant === 1 ? "s" : ""} empty — the other{" "}
          <b>{turnedAway}</b> will find no roof and walk on, <b>lost for good</b> (arrivals are never
          queued). Every Hearthstead houses 10; raise them ahead of the crowd.
        </>
      ),
      ctas: [
        { href: "/buildings#housing", label: "🏠 Raise Hearthsteads", primary: true },
      ],
      manual: "/guide#grow",
    });
  }

  // 5 · Storehouses bombarded — cracked vaults shelter less and spill goods
  //     back into the open (Treasurer Poll).
  const brokenStores = STORE_NAMES.filter(({ id }) => level(p, id) > 0 && buildingIntegrity(p, id) < 0.999);
  if (!p.starving && brokenStores.length > 0) {
    alerts.push({
      key: "stores",
      variant: "warn",
      advisor: "economic",
      icon: "🔥",
      headline: "your storehouses are breached",
      body: (
        <>
          {brokenStores.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ", " : ""}
              <b>{s.name}</b> ({Math.round(buildingIntegrity(p, s.id) * 100)}%)
            </span>
          ))}{" "}
          {brokenStores.length === 1 ? "is" : "are"} cracked — each shelters only its capacity ×
          integrity, so the overflow has spilled back into the open where raiders and spies can take
          it. Repair the stores to seal your gold and goods away again.
        </>
      ),
      ctas: [
        { href: "/buildings", label: "🔧 Repair the storehouses", primary: true },
      ],
      manual: "/guide#defense",
    });
  }

  if (alerts.length === 0) return null;

  return (
    <>
      {alerts.map((a) => {
        const who = advisor(a.advisor);
        return (
          <div key={a.key} className={`alert alert-${a.variant}`} role="alert">
            {/* The councillor's own face, in your people — with the topic glyph
                badged on it, so a banner says WHO and WHAT before it is read. */}
            <span className="alert-icon" style={{ ["--accent" as string]: who.accent }}>
              <Art path={`advisors/${a.advisor}`} race={p.race} size={44} title={who.name} />
              <span className="alert-icon-badge" aria-hidden>
                {glyphs(a.icon)}
              </span>
            </span>
            <div>
              <div className="alert-title">
                <span className="alert-who">{who.name}</span>
                {": "}
                {a.headline}
              </div>
              <div className="alert-body">{a.body}</div>
              <div className="alert-actions">
                {a.ctas.map((c) => (
                  <Link key={c.href} className={c.primary ? "alert-cta" : "alert-cta alert-cta-ghost"} href={c.href}>
                    {glyphs(c.label)}
                  </Link>
                ))}
                <Link className="alert-cta alert-cta-ghost" href={advisorHref(a.advisor)}>
                  Ask {who.name} →
                </Link>
                <Link className="alert-cta alert-cta-ghost" href={a.manual}>
                  <Glyph char="📜" /> Field Manual
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
