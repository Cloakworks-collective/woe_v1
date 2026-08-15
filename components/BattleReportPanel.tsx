import type { ReactNode } from "react";
import { Panel } from "@/components/Panel";
import type { BattleReport, UnitLosses } from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pretty = (s: string) => s.replace(/_/g, " ");

/**
 * The full account of a single battle.
 *
 * Written as a DOCUMENT with an argument, not a dump of figures. It reads in
 * ONE column at full width: the two-column version squeezed 13px type into half
 * a page and turned every section into a grey slab. And it is paced by icons —
 * a plate on every heading and every fact — because the alternative is four
 * hundred words of unbroken prose nobody reads twice.
 *
 * The order answers the questions a reader actually has, in the order they have
 * them: who won and why → the figures at a glance → what it cost me → what I
 * took → what I broke → what happened, beat by beat.
 */

/**
 * What each phase IS, said once, so the log is readable by someone who has not
 * memorised the order of battle.
 *
 * `icon` names a plate in /art/ui/icons — the same PixelLab kit the sidebar and
 * the advisors draw from. Emoji were the placeholder and they were wrong twice
 * over: an OS emoji renders in full colour at whatever resolution the platform
 * likes, so it reads as a sticker on a game drawn at 32px, and it looks
 * different on every machine.
 */
const PHASE: Record<string, { icon: string; name: string; blurb: string }> = {
  prelude: { icon: "banner", name: "Before the blow", blurb: "Terms, refusals, and anything settled before a sword was drawn." },
  "counter-duel": { icon: "siege", name: "The engine duel", blurb: "Their emplaced counters and your siege train shoot at each other. Nothing here touches a soldier." },
  walls: { icon: "brick", name: "The walls", blurb: "Rams on the gate, trebuchets on the masonry. The wall must fall below half before the gate crews join the assault." },
  archers: { icon: "target", name: "Archers", blurb: "Volleys first, spread across the whole enemy line — the one phase that hits every arm at once." },
  cavalry: { icon: "horse", name: "The charge", blurb: "Horse ride down horse, then footmen, then archers. Engineers are never a target for a charge." },
  footmen: { icon: "army", name: "The lines meet", blurb: "The melee. Ram crews drop the beams and join in once the gate has given." },
  sortie: { icon: "castle", name: "The sortie", blurb: "The defender rode out rather than hold the wall — cavalry gain everything in the open." },
  aftermath: { icon: "skull", name: "Aftermath", blurb: "The field is counted: who held it, what was stripped from the dead, and who the surgeons saved." },
};
const PHASE_ORDER = ["prelude", "counter-duel", "walls", "archers", "cavalry", "footmen", "sortie", "aftermath"];

/** A plate from the pixel kit. */
function Ico({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <img
      src={`/art/ui/icons/${name}.png`}
      alt=""
      width={size}
      height={size}
      className="br-ico"
      style={{ width: size, height: size }}
    />
  );
}

/** A section heading with its plate. */
function H({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h4 className="br-h">
      <Ico name={icon} size={24} />
      {children}
    </h4>
  );
}

/**
 * One fact, on its own line, with a plate.
 *
 * Every statement in this report gets one. Bullets alone gave a flat grey list
 * with nothing for the eye to catch on; the plate down the left creates a
 * rhythm you can skim, and says what KIND of fact it is before you read a word.
 */
function Fact({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="br-fact">
      <Ico name={icon} size={20} />
      <span>{children}</span>
    </li>
  );
}

/** A headline number, big enough to read from across the room. */
function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className={`br-tile${tone ? ` is-${tone}` : ""}`}>
      <Ico name={icon} size={28} />
      <div className="br-tile-body">
        <div className="br-tile-label">{label}</div>
        <div className="br-tile-value">{value}</div>
        {sub && <div className="br-tile-sub">{sub}</div>}
      </div>
    </div>
  );
}

/** One side of the verdict bar. */
function LossBar({ name, share, won }: { name: string; share: number; won: boolean }) {
  return (
    <div className={`br-side${won ? " is-victor" : ""}`}>
      <div className="br-side-head">
        <b>{name}</b>
        <span className="br-side-pct">gave up {pct(share)}</span>
      </div>
      <span className="br-track">
        {/* Scaled against 50%, not 100%: a battle is decided long before either
            host loses half of what it brought, so a bar drawn to 100% renders
            every real fight as two near-empty slivers. */}
        <i style={{ width: `${Math.min(100, share * 200)}%` }} />
      </span>
      {won && (
        <span className="br-crown">
          <Ico name="medal" size={15} /> carried the field
        </span>
      )}
    </div>
  );
}

export function BattleReportPanel({ report }: { report: BattleReport }) {
  const won = report.victor === "attacker";
  const share = report.healthLostShare;
  const A = report.attackerName;
  const D = report.defenderName;

  const headline =
    report.victor === "none"
      ? "An artillery duel — no victor, only rubble."
      : report.yielded
        ? `${D} lays down arms without a fight.`
        : won
          ? `${A} carries the field.`
          : `${D} holds the field.`;

  /**
   * Regulars each side LOST — summed from its own ledger.
   *
   * NOT `report.regularsKilled`, which counts the opposite thing:
   * `regularsKilled.attacker` is regulars killed BY the attacker, i.e. the
   * DEFENDER's dead. Reading it as "the attacker's losses" showed each side the
   * other's casualties in the row headed by their own name — the numbers looked
   * plausible, which is what made it hard to spot.
   */
  const regularsLost = (l: UnitLosses) => l.footmen + l.archers + l.cavalry + l.engineers;

  const goods = (["food", "wood", "stone", "ore"] as const).filter(
    (k) => report.loot.resources[k] > 0,
  );
  const goodsTotal = goods.reduce((n, k) => n + report.loot.resources[k], 0);
  const salvageTotal = (report.salvage?.gold ?? 0) + (report.salvage?.ore ?? 0);
  const hauled = report.loot.gold + goodsTotal + salvageTotal;
  const esc = report.escalade;
  const escTotal = (esc?.grappled ?? 0) + (esc?.laddered ?? 0) + (esc?.towered ?? 0);
  const gearLost = Object.entries(report.siegeGearLost).filter(([, v]) => (v ?? 0) > 0);
  const countersLost = Object.entries(report.siegeCountersLost ?? {}).filter(([, v]) => (v ?? 0) > 0);
  const buildings = report.buildingDamage ?? [];
  const nothingBroken =
    gearLost.length === 0 &&
    countersLost.length === 0 &&
    report.wallIntegrityDamage === 0 &&
    buildings.length === 0;

  const byPhase = PHASE_ORDER.map((p) => ({
    key: p,
    meta: PHASE[p],
    lines: report.log.filter((l) => l.phase === p),
  })).filter((g) => g.lines.length > 0);

  const LOSS_ROWS = [
    { label: "Footmen", key: "footmen", icon: "army", regular: true },
    { label: "Archers", key: "archers", icon: "target", regular: true },
    { label: "Cavalry", key: "cavalry", icon: "horse", regular: true },
    { label: "Engineers", key: "engineers", icon: "wrench", regular: true },
    { label: "Sellswords", key: "mercenaries", icon: "coin", regular: false },
  ] as const;

  return (
    <Panel title={`Battle Report — ${report.mode} on ${D}`}>
      {/* ── 1 · The verdict, and its working ─────────────────────────────── */}
      <div className={`br-verdict tone-${report.victor === "none" ? "none" : won ? "win" : "loss"}`}>
        <div className="br-headline">
          {report.victor === "none" ? (
            <Ico name="blast" size={30} />
          ) : (
            // The attacker took the field, or the walls held. Two outcomes, two
            // plates — read from across the room before a word of it.
            <Ico name={won ? "trophy" : "castle"} size={30} />
          )}
          {headline}
        </div>
        {report.yielded ? (
          <p className="br-why">
            They were too badly outmatched — or too spent — to face you. The stores are taken and
            their regulars live: a yield saves the soldiers, never the storehouses.
          </p>
        ) : share ? (
          <>
            <p className="br-why">
              A battle is won by <b>whoever gave up the smaller share of the health they marched in
              with</b> — not by who is left standing, and not by raw damage. A tie goes to the
              defender, who already holds the ground.
            </p>
            <div className="br-bars">
              <LossBar name={A} share={share.attacker} won={won} />
              <LossBar name={D} share={share.defender} won={!won && report.victor !== "none"} />
            </div>
          </>
        ) : (
          <p className="br-why">
            No lines met: engines fired on stone and on each other, and no ground changed hands.
          </p>
        )}
      </div>

      {/* ── 2 · The figures at a glance ──────────────────────────────────── */}
      {/* Four numbers before any prose. Without this the reader has to mine
          three paragraphs for "did I lose people, and did I get paid". */}
      <div className="br-tiles">
        <Tile
          icon="skull"
          label="Your regulars lost"
          value={fmt(regularsLost(report.attackerLosses))}
          sub="real population, gone for good"
          tone={regularsLost(report.attackerLosses) > 0 ? "bad" : undefined}
        />
        <Tile
          icon="target"
          label="Theirs cut down"
          value={fmt(regularsLost(report.defenderLosses))}
          sub={`plus ${fmt(report.defenderLosses.mercenaries)} hired`}
          tone={regularsLost(report.defenderLosses) > 0 ? "good" : undefined}
        />
        <Tile
          icon="coin"
          label="Carried home"
          value={fmt(hauled)}
          sub={salvageTotal > 0 ? `${fmt(salvageTotal)} of it off the dead` : "loot and salvage"}
          tone={hauled > 0 ? "good" : undefined}
        />
        <Tile
          icon="brick"
          label="Their wall"
          value={report.wallIntegrityDamage > 0 ? `−${pct(report.wallIntegrityDamage)}` : "untouched"}
          sub={report.batterySilenced ? "their battery is silenced" : "integrity lost"}
          tone={report.wallIntegrityDamage > 0 ? "good" : undefined}
        />
      </div>

      {/* ── 3 · What it cost ─────────────────────────────────────────────── */}
      <H icon="skull">The butcher&rsquo;s bill</H>
      <p className="br-note">
        <b>Regulars are population.</b> They carry your veterancy, count toward your score, and
        cannot be re-bought. Sellswords die first — at their own arm <i>and</i> their own rank — and
        cost only gold.
      </p>
      <div className="tbl-scroll">
        <table className="tbl br-losses">
          <thead>
            <tr>
              <th>Fallen</th>
              <th className="num">{A}</th>
              <th className="num">{D}</th>
            </tr>
          </thead>
          <tbody>
            {LOSS_ROWS.map((r) => (
              <tr key={r.key} className={r.regular ? undefined : "br-merc-row"}>
                <td>
                  <Ico name={r.icon} size={18} />
                  {r.label}
                </td>
                <td className="num">{fmt(report.attackerLosses[r.key])}</td>
                <td className="num">{fmt(report.defenderLosses[r.key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <b>Regulars lost</b>
                <span className="br-sub"> — real population</span>
              </td>
              <td className="num br-reg">{fmt(regularsLost(report.attackerLosses))}</td>
              <td className="num br-reg">{fmt(regularsLost(report.defenderLosses))}</td>
            </tr>
            <tr className="br-merc-row">
              <td>All told, with the hired</td>
              <td className="num">
                {fmt(regularsLost(report.attackerLosses) + report.attackerLosses.mercenaries)}
              </td>
              <td className="num">
                {fmt(regularsLost(report.defenderLosses) + report.defenderLosses.mercenaries)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="br-facts">
        {(report.mercsRecovered ?? 0) > 0 && (
          <Fact icon="heart">
            <b>{fmt(report.mercsRecovered ?? 0)} sellswords</b> were carried off the field alive by{" "}
            {D}&rsquo;s surgeons. They fell — the field hospital is what happened next.
          </Fact>
        )}
        {report.civiliansDisplaced > 0 && (
          <Fact icon="houses">
            <b>{fmt(report.civiliansDisplaced)} civilians</b> fled the sacking. People leave a town
            that is stormed, quite apart from any scattering at the next dawn.
          </Fact>
        )}
        <Fact icon="fire">
          Stamina spent: <b>−{report.staminaLoss.attacker}</b> ({A}) ·{" "}
          <b>−{report.staminaLoss.defender}</b> ({D}). Drain scales with the damage you dealt, so
          swinging hard tires an army and holding a line does not.
        </Fact>
        <Fact icon="medal">
          Experience:{" "}
          <b style={{ color: report.experienceChange.attacker < 0 ? "var(--warn)" : undefined }}>
            {report.experienceChange.attacker >= 0 ? "+" : "−"}
            {fmt(Math.abs(report.experienceChange.attacker))}
          </b>{" "}
          ({A}) · <b>+{fmt(report.experienceChange.defender)}</b> ({D}).
          {report.experienceChange.attacker < 0 &&
            " A negative award means the matchup was bullying — far beneath your weight."}
        </Fact>
        {report.siegeExperienceChange && (
          <Fact icon="wrench">
            Siege experience: <b>+{fmt(report.siegeExperienceChange.attacker)}</b> ({A}) ·{" "}
            <b>+{fmt(report.siegeExperienceChange.defender)}</b> ({D}) — the engineers keep their own
            ledger, separate from the battle line&rsquo;s.
          </Fact>
        )}
      </ul>

      {/* ── 4 · What was taken ───────────────────────────────────────────── */}
      <H icon="coin">The spoils</H>
      {hauled === 0 ? (
        <p className="br-note">
          Nothing came home.{" "}
          {report.mode === "revenge"
            ? "A revenge carries no loot by design — its payment is dead regulars."
            : report.mode === "bombard"
              ? "A bombard takes nothing: the two sides never meet."
              : "The field was lost, and the loser hauls nothing."}
        </p>
      ) : (
        <ul className="br-facts">
          {report.loot.gold > 0 && (
            <Fact icon="coin">
              <b>{fmt(report.loot.gold)} gold</b> plundered — only what was sitting outside the
              Counting House.
            </Fact>
          )}
          {goodsTotal > 0 && (
            <Fact icon="caravan">
              Goods carried off:{" "}
              <b>{goods.map((k) => `${fmt(report.loot.resources[k])} ${k}`).join(" · ")}</b> —
              everything above what their storehouses shelter.
            </Fact>
          )}
          {salvageTotal > 0 && (
            <Fact icon="skull">
              <b>Stripped from the fallen</b> — {fmt(report.salvage!.gold)} gold and{" "}
              {fmt(report.salvage!.ore)} ore off the dead of <i>both</i> sides. This comes off bodies
              rather than out of storehouses, so it is on top of the haul, is never halved by a
              surrender, and a revenge that plunders nothing still earns it.
            </Fact>
          )}
        </ul>
      )}

      {/* ── 5 · What was broken ──────────────────────────────────────────── */}
      <H icon="blast">What was broken</H>
      {nothingBroken ? (
        <p className="br-note">No stone cracked and no engine wrecked.</p>
      ) : (
        <ul className="br-facts">
          {report.wallIntegrityDamage > 0 && (
            <Fact icon="brick">
              Their wall lost <b>{pct(report.wallIntegrityDamage)}</b> of its integrity. A
              wall&rsquo;s health is quadratic in its level, so bringing a tall one down is a
              campaign rather than an afternoon.
            </Fact>
          )}
          {buildings.length > 0 && (
            <Fact icon="houses">
              Town buildings cracked:{" "}
              <b>
                {buildings
                  .map((b) => `${pretty(b.building)} −${Math.round(b.integrityLost * 100)}%`)
                  .join(", ")}
              </b>{" "}
              — fire only spills onto the town once the wall is breached.
            </Fact>
          )}
          {gearLost.length > 0 && (
            <Fact icon="siege">
              {A} lost <b>{gearLost.map(([t, v]) => `${v} ${pretty(t)}`).join(", ")}</b> — wrecked
              outright, not repairable.
            </Fact>
          )}
          {countersLost.length > 0 && (
            <Fact icon="clan">
              {D} lost <b>{countersLost.map(([t, v]) => `${v} ${pretty(t)}`).join(", ")}</b> of their
              battery.
            </Fact>
          )}
          {report.batterySilenced && (
            <Fact icon="lock">
              <b>Their battery fell silent.</b> Ground below a quarter of its health, the crews stand
              down for good — and stay down until somebody pays to mend them.
            </Fact>
          )}
        </ul>
      )}

      {/* ── 6 · How the assault was shaped ───────────────────────────────── */}
      {(escTotal > 0 || report.sortied) && (
        <>
          <H icon="castle">Shape of the assault</H>
          <ul className="br-facts">
            {escTotal > 0 && (
              <Fact icon="build">
                <b>{fmt(escTotal)} troops came over the wall</b>
                {esc && (
                  <>
                    {" "}
                    — {fmt(esc.grappled)} by grapple, {fmt(esc.laddered)} by ladder,{" "}
                    {fmt(esc.towered)} by tower
                  </>
                )}
                . Each way over faces a lesser wall than the one below it, and a damaged team carries
                proportionally fewer.
              </Fact>
            )}
            {report.sortied && (
              <Fact icon="horse">
                <b>{D} rode out</b> rather than hold the wall — cavalry gain nothing behind stone and
                everything in the open.
              </Fact>
            )}
          </ul>
        </>
      )}

      {/* ── 7 · The telling ──────────────────────────────────────────────── */}
      <H icon="scroll">How it went, beat by beat</H>
      <p className="br-note">
        One exchange, down a fixed order of battle. There are no rounds — you come back tomorrow.
      </p>
      <div className="br-log">
        {byPhase.map((g) => (
          <section className="br-phase" key={g.key}>
            <div className="br-phase-head">
              <Ico name={g.meta.icon} size={22} />
              <b>{g.meta.name}</b>
              <span className="br-phase-blurb">{g.meta.blurb}</span>
            </div>
            <ul className="br-beats">
              {g.lines.map((l, i) => {
                const reg = (l.attackerRegulars ?? 0) + (l.defenderRegulars ?? 0);
                return (
                  <li key={i} className={`br-beat tone-${l.tone ?? "neutral"}`}>
                    {l.text}
                    {reg > 0 && (
                      <span className="br-beat-reg">
                        {l.attackerRegulars ? `${fmt(l.attackerRegulars)} of ${A}'s regulars fall` : ""}
                        {l.attackerRegulars && l.defenderRegulars ? " · " : ""}
                        {l.defenderRegulars ? `${fmt(l.defenderRegulars)} of ${D}'s regulars fall` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}
