import Link from "next/link";
import { Art } from "@/components/Art";
import { Glyph, glyphs } from "@/components/Glyph";
import { advisorFor, advisorHref, type AdvisorKey } from "@/lib/constants/advisors";
import {
  buildingIntegrity,
  civilians,
  level,
  military,
  popPerDay,
  theWallName,
  totalPopulation,
  troopTotal,
  vacantHousing,
  type Player,
} from "@/lib/engine";
import type { BuildingId } from "@/lib/constants/buildings";
import { HOUSING_PER_HEARTHSTEAD, MERCENARIES } from "@/lib/constants";

const STORE_NAMES: { id: BuildingId; name: string }[] = [
  { id: "counting_house", name: "Counting House" },
  { id: "granary", name: "Granary" },
  { id: "timberyard", name: "Timberyard" },
  { id: "masons_yard", name: "Mason's Yard" },
  { id: "ironhold", name: "Ironhold" },
];

/** The works whose OUTPUT a bombard cuts — each is "× integrity" somewhere in
 *  the engine, so a cracked one quietly earns less every single tick. */
const WORKS: { id: BuildingId; name: string; costs: string }[] = [
  { id: "grange", name: "Grange", costs: "food from your farmers" },
  { id: "sawyers_mill", name: "Sawyer's Mill", costs: "timber from your lumberjacks" },
  { id: "masons_quarry", name: "Mason's Quarry", costs: "stone from your quarrymen" },
  { id: "deepvein_mine", name: "Deepvein Mine", costs: "ore from your miners" },
  { id: "collegium", name: "Collegium", costs: "research from your scholars" },
  { id: "market_square", name: "Market Square", costs: "the load every caravan carries" },
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
        { href: "/market#buy-food", label: "⚖ Buy food at the Bazaar", primary: true },
        { href: "/train#w-farmers", label: "👥 Assign farmers", primary: true },
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
        { href: "/troops#train", label: "⚔ Raise troops", primary: true },
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
        { href: "/buildings?tab=military#b-walls", label: "🧱 Repair the walls", primary: true },
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
        { href: "/buildings#b-hearthstead", label: "🏠 Raise Hearthsteads", primary: true },
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
        { href: `/buildings#b-${brokenStores[0].id}`, label: "🔧 Repair the storehouses", primary: true },
      ],
      manual: "/guide#defense",
    });
  }

  // 5b · Roofs bombarded. Distinct from the storehouse alert because the loss
  //      is INVISIBLE: no goods spill, no population drops, no number on the
  //      dashboard moves. A shelled Hearthstead simply stops accepting settlers
  //      and a shelled Muster Hall stops accepting recruits, and a regent can
  //      go days wondering why growth has stalled. This is the only place the
  //      game says so out loud.
  const brokenRoofs = ([
    { id: "hearthstead" as BuildingId, name: "Hearthsteads", loses: "beds for new settlers" },
    { id: "muster_hall" as BuildingId, name: "Muster Halls", loses: "bunks for new troops" },
  ]).filter(({ id }) => level(p, id) > 0 && buildingIntegrity(p, id) < 0.999);
  if (!p.starving && brokenRoofs.length > 0) {
    alerts.push({
      key: "roofs",
      variant: "warn",
      advisor: "population",
      icon: "🏚️",
      headline: "your roofs are burning",
      body: (
        <>
          {brokenRoofs.map((r, i) => (
            <span key={r.id}>
              {i > 0 ? ", " : ""}
              <b>{r.name}</b> ({Math.round(buildingIntegrity(p, r.id) * 100)}%)
            </span>
          ))}{" "}
          {brokenRoofs.length === 1 ? "stands" : "stand"} in ruins. <b>Nobody has been driven out</b>
          {" "}— every peasant and every soldier you had is still here. What you have lost is{" "}
          {brokenRoofs.map((r) => r.loses).join(" and ")}, so your empire cannot grow by a single
          head until the roofs are mended.
          <br />
          <i>
            While you were away this cost you nothing — burnt housing does not count against your
            settlers until you are back to answer it, so a barrage at three in the morning is not
            a reason to lose sleep. You are back now, so from this moment it counts. Mend them.
          </i>
        </>
      ),
      ctas: [
        { href: `/buildings#b-${brokenRoofs[0].id}`, label: "🔧 Mend the roofs", primary: true },
      ],
      manual: "/guide#grow",
    });
  }

  // 5c · Works bombarded — output cut at the source.
  //
  //      The third of the three damage alerts, and the one that bleeds
  //      hardest over time: a cracked producer earns less EVERY TICK, so a
  //      barrage nobody repairs is a permanent tax on the empire. Grouped
  //      into one banner because a bombard rarely hits just one.
  const brokenWorks = WORKS.filter(
    ({ id }) => level(p, id) > 0 && buildingIntegrity(p, id) < 0.999,
  );
  if (!p.starving && brokenWorks.length > 0) {
    alerts.push({
      key: "works",
      variant: "warn",
      advisor: "economic",
      icon: "⚒️",
      headline: "your works are cracked and earning less",
      body: (
        <>
          {brokenWorks.map((w, i) => (
            <span key={w.id}>
              {i > 0 ? ", " : ""}
              <b>{w.name}</b> ({Math.round(buildingIntegrity(p, w.id) * 100)}%)
            </span>
          ))}{" "}
          {brokenWorks.length === 1 ? "is" : "are"} damaged, and every one of them pays out{" "}
          <b>× its integrity</b> — you are losing{" "}
          {brokenWorks.map((w) => w.costs).join(", ")} on <i>every single tick</i>, not once.
          Nothing else in the game compounds like an unrepaired workshop: mend them first.
        </>
      ),
      ctas: [
        { href: `/buildings#b-${brokenWorks[0].id}`, label: "🔧 Repair the works", primary: true },
      ],
      manual: "/guide#defense",
    });
  }

  // 6 · Idle hands (the Steward of the people). Last, because it is an
  //     OPPORTUNITY rather than a threat — nothing is being lost this turn, it
  //     simply isn't being gained.
  //
  //     This used to be a banner that only existed on /train, which is the one
  //     page you were already on to fix it. Idle peasants are the single most
  //     common thing a new regent overlooks, and the alert is worth nothing if
  //     it only speaks in the room where you had already gone to listen.
  //
  //     The threshold keeps it from nagging: ten idle (a Hearthstead's worth)
  //     is enough to matter, and a small empire whose whole population is idle
  //     is told regardless of how small it is.
  const idle = p.idlePeasants;
  if (!p.starving && idle > 0 && (idle >= HOUSING_PER_HEARTHSTEAD || idle === civ)) {
    alerts.push({
      key: "idle",
      variant: "warn",
      advisor: "population",
      icon: "👥",
      headline: `${idle} idle peasant${idle === 1 ? "" : "s"} await your word`,
      body: (
        <>
          Idle hands produce nothing — no gold, no goods, no research. Put them to a trade (farmers
          feed the realm first, then split the rest across your producers), or raise them into
          soldiers. Assignment is <b>free and reversible</b>, so there is no reason to leave a
          single one standing about.
        </>
      ),
      ctas: [
        { href: "/train#workers", label: "👥 Assign them to a trade", primary: true },
        { href: "/troops#train", label: "⚔ Raise them as soldiers" },
      ],
      manual: "/guide#grow",
    });
  }

  // · Scholars studying NOTHING. The sharpest of the wasted-work alarms,
  //   because the loss is total and silent: with no active field the tick banks
  //   no points at all (see processTurnTick), so every scholar's turn is thrown
  //   away rather than merely misdirected. An idle peasant costs you what they
  //   might have made; an unassigned scholar costs you what they DID make.
  const scholars = p.workers.researchers;
  if (!p.starving && scholars > 0 && !p.research?.activeField) {
    alerts.push({
      key: "no-research",
      variant: "danger",
      advisor: "economic",
      icon: "🎓",
      headline: `${scholars} scholar${scholars === 1 ? " is" : "s are"} studying nothing`,
      body: (
        <>
          Your Collegium is manned and <b>every point it makes is being thrown away</b> — with no
          field chosen the turn banks nothing at all, so this is not slow progress, it is no
          progress. Pick any field and the work starts landing on the very next turn; you can
          change your mind later for a small loss.
        </>
      ),
      ctas: [
        { href: "/research", label: "🎓 Choose a field to study", primary: true },
        { href: "/train#w-researchers", label: "👥 Recall the scholars instead" },
      ],
      manual: "/guide#grow",
    });
  }

  // · A BARE arm — regulars with no hired blades in front of them. Sellswords
  //   take the first CASUALTY_SPLIT.MERC_SHARE of every blow aimed at their own
  //   arm, so an arm without them puts real population in the front rank. Dead
  //   regulars cost veterancy, ranking and people; a dead sellsword costs gold.
  const BARE_ARMS = [
    { key: "footmen", label: "footmen", arm: "footman" },
    { key: "archers", label: "archers", arm: "archer" },
    { key: "cavalry", label: "cavalry", arm: "cavalry" },
  ] as const;
  const bare = BARE_ARMS.filter(
    (a) => troopTotal(p.army[a.key]) > 0 && troopTotal(p.army.mercenaries[a.key]) === 0,
  );
  const thin = BARE_ARMS.filter((a) => {
    const regs = troopTotal(p.army[a.key]);
    const hired = troopTotal(p.army.mercenaries[a.key]);
    if (regs === 0 || hired === 0) return false;
    // Well short of the cap — the screen exists but will not last a battle.
    return hired < Math.floor(regs * MERCENARIES.CAP_RATIO) / 3;
  });
  if (!p.starving && (bare.length > 0 || thin.length > 0)) {
    const naked = bare.length > 0;
    const arms = (naked ? bare : thin).map((a) => a.label).join(", ");
    alerts.push({
      key: "bare-arms",
      variant: naked ? "danger" : "warn",
      advisor: "military",
      icon: "🛡",
      headline: naked
        ? `your ${arms} stand bare — no hired blades in front of them`
        : `your ${arms} are thinly screened`,
      body: (
        <>
          Sellswords take the <b>first 70%</b> of every blow aimed at their own arm, and{" "}
          {naked ? <>your {arms} have none</> : <>you have barely any of that arm</>} — so those
          blows land on your <b>own people</b>. Regular dead are the one loss you never get back:
          they cost population, they drag your ranking down for days, and your veterancy dies with
          them. A hired blade costs only gold, and they may not outnumber a third of the regulars of
          their own arm, so hire to that line before the next raid.
        </>
      ),
      ctas: [
        { href: "/troops#mercenaries", label: "🛡 Hire a screen", primary: true },
        { href: "/research", label: "🎓 Free Companies — cheaper contracts" },
      ],
      manual: "/guide#regulars",
    });
  }

  if (alerts.length === 0) return null;

  return (
    <>
      {alerts.map((a) => {
        const who = advisorFor(a.advisor, p.race);
        return (
          <div key={a.key} className={`alert alert-${a.variant}`} role="alert">
            {/* The councillor's own face, in your people — with the topic glyph
                badged on it, so a banner says WHO and WHAT before it is read. */}
            <span className="alert-icon" style={{ ["--accent" as string]: who.accent }}>
              <Art path={`advisors/${a.advisor}`} race={p.race} size={44} title={who.fullName} />
              <span className="alert-icon-badge" aria-hidden>
                {glyphs(a.icon)}
              </span>
            </span>
            <div>
              <div className="alert-title">
                <span className="alert-who">{who.fullName}</span>
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
                  Ask {who.person} →
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
