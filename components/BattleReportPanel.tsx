import type { ReactNode } from "react";
import { Panel } from "@/components/Panel";
import { BOMBARD_INTENSITY } from "@/lib/constants";
import type { BattleForces, BattleReport, TroopCounts, UnitLosses } from "@/lib/engine";

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
  sortie: { icon: "castle", name: "The sortie", blurb: "The defender rode out rather than hold the wall — cavalry gain everything in the open. Three clashes: the besieger's footmen draw off riders, then their own horse, and only what neither can occupy reaches the engines." },
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

/**
 * Who marched — the muster roll, before any of the dead are counted.
 *
 * Without this the losses are unreadable: 853 fallen is a rout or a scratch
 * depending on whether five thousand came or nine hundred, and the report gave
 * the reader no way to tell which.
 *
 * `full` is a raid or an assault, where the whole host turns out. A BOMBARD
 * passes false: no soldier is present, so listing footmen and cavalry would be
 * describing an army that stayed at home.
 */
function ForcesTable({
  a,
  d,
  aName,
  dName,
  full,
  siege,
}: {
  a: BattleForces;
  d: BattleForces;
  aName: string;
  dName: string;
  full: boolean;
  /** Is masonry in play at all? A RAID is open field — no wall, no engines, no
   *  emplaced works — so those rows are not "none", they are not applicable,
   *  and printing them as empty invites the reader to wonder what went wrong. */
  siege: boolean;
}) {
  const tiers = (t: TroopCounts) => t.light + t.medium + t.heavy;
  const spread = (t: TroopCounts) => `${t.light} / ${t.medium} / ${t.heavy}`;
  // Raw ids read badly on a muster roll — "22 counter engine", "14 fire pots"
  // for a thing that is a stand of them.
  const ENGINE_NAME: Record<string, string> = {
    counter_engine: "Counter-Engines",
    billhooks: "bill-hook parties",
    forkpoles: "fork-pole crews",
    fire_pots: "fire-pot stands",
    boiling_oil: "cauldrons of oil",
    hoardings: "spans of hoarding",
    siege_towers: "siege towers",
    ropes: "grapple teams",
    ladders: "ladder parties",
    rams: "battering rams",
  };
  /**
   * Engines as a LIST, one per line.
   *
   * Joined with commas this was "30 battering rams, 40 grapple teams, 30 ladder
   * parties, 24 ballistae, 40 trebuchets, 18 siege towers" — a wall of text in
   * a table cell, wrapping mid-phrase, with no way to compare one side's train
   * against the other's without reading both end to end.
   */
  const engineList = (g: BattleForces["gear"] | BattleForces["counters"]) => {
    const rows = Object.entries(g).filter(([, n]) => (n ?? 0) > 0);
    if (rows.length === 0) return <span className="br-none">none</span>;
    return (
      <ul className="br-engines">
        {rows.map(([k, n]) => (
          <li key={k}>
            <b>{fmt(n ?? 0)}</b> {ENGINE_NAME[k] ?? pretty(k)}
          </li>
        ))}
      </ul>
    );
  };

  const ARMS = [
    { label: "Footmen", icon: "army", reg: "footmen", merc: "mercFootmen" },
    { label: "Archers", icon: "target", reg: "archers", merc: "mercArchers" },
    { label: "Cavalry", icon: "horse", reg: "cavalry", merc: "mercCavalry" },
  ] as const;

  return (
    <div className="tbl-scroll">
      <table className="tbl br-forces">
        <thead>
          <tr>
            <th>Who marched</th>
            <th className="num">{aName}</th>
            <th className="num">{dName}</th>
          </tr>
        </thead>
        <tbody>
          {full &&
            ARMS.map((arm) => (
              <tr key={arm.reg}>
                <td>
                  <Ico name={arm.icon} size={18} />
                  {arm.label}
                  <span className="br-sub"> — light / medium / heavy</span>
                </td>
                {[a, d].map((side, i) => (
                  <td className="num" key={i}>
                    <b>{fmt(tiers(side[arm.reg]))}</b>
                    <span className="br-forces-spread">{spread(side[arm.reg])}</span>
                    {tiers(side[arm.merc]) > 0 && (
                      <span className="br-forces-merc">
                        +{fmt(tiers(side[arm.merc]))} hired ({spread(side[arm.merc])})
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          {siege && (
          <tr>
            <td>
              <Ico name="wrench" size={18} />
              Engineers
            </td>
            <td className="num">{fmt(a.engineers)}</td>
            <td className="num">{fmt(d.engineers)}</td>
          </tr>
          )}
          {/* Two rows, not one cell with both crammed in. The train you bring
              and the works you have emplaced are different kinds of thing, and
              the defender fields both. */}
          {siege && (
          <>
          <tr>
            <td>
              <Ico name="siege" size={18} />
              Siege train
              <span className="br-sub"> — crewed and in the field</span>
            </td>
            <td className="br-forces-list">{engineList(a.gear)}</td>
            <td className="br-forces-list">{engineList(d.gear)}</td>
          </tr>
          <tr>
            <td>
              <Ico name="clan" size={18} />
              Defensive works
              <span className="br-sub"> — emplaced on the wall</span>
            </td>
            <td className="br-forces-list">{engineList(a.counters)}</td>
            <td className="br-forces-list">{engineList(d.counters)}</td>
          </tr>
          <tr>
            <td>
              <Ico name="brick" size={18} />
              Wall
            </td>
            <td className="num">
              {a.wallLevel > 0 ? `Level ${a.wallLevel} · ${Math.round(a.wallIntegrity * 100)}%` : "—"}
            </td>
            <td className="num">
              {d.wallLevel > 0 ? `Level ${d.wallLevel} · ${Math.round(d.wallIntegrity * 100)}%` : "none"}
            </td>
          </tr>
          </>
          )}
          <tr>
            <td>
              <Ico name="fire" size={18} />
              Stamina &amp; veterancy
            </td>
            <td className="num">
              {a.stamina}% · +{(a.veterancy * 100).toFixed(1)}%
            </td>
            <td className="num">
              {d.stamina}% · +{(d.veterancy * 100).toFixed(1)}%
            </td>
          </tr>
        </tbody>
      </table>
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
  /** Did soldiers actually meet? Read off the CASUALTIES, never off optional
   *  report fields — the verdict blurb must not lie about a battle it can see. */
  const linesMet =
    report.attackerLosses.footmen + report.attackerLosses.archers + report.attackerLosses.cavalry +
    report.attackerLosses.mercenaries + report.defenderLosses.footmen + report.defenderLosses.archers +
    report.defenderLosses.cavalry + report.defenderLosses.mercenaries > 0;
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

  /**
   * What this MODE actually involves. The four attacks are different events and
   * a report that shows every section for all of them is three-quarters
   * padding: a bombard has no soldiers, so a butcher's bill of footmen and a
   * "nothing came home" spoils note are both describing things that were never
   * on the table.
   */
  const isBombard = report.mode === "bombard";
  const hasTroops = !isBombard;
  const hasWalls = report.mode !== "raid";
  const canLoot = report.mode === "raid" || report.mode === "siege";

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
        ) : linesMet ? (
          // Troops fought but the worth ledger is missing (an older report, or
          // a stripped index entry) — say nothing rather than the WRONG thing.
          // This branch used to print "No lines met" above a butcher's bill
          // full of dead footmen.
          null
        ) : (
          <p className="br-why">
            No lines met: engines fired on stone and on each other, and no ground changed hands.
          </p>
        )}
      </div>

      {/* ── 2 · Who marched ──────────────────────────────────────────────── */}
      {report.forces && (
        <>
          <H icon="banner">The muster roll</H>
          <p className="br-note">
            What each side brought to the field, before a blow was struck.
            {hasTroops &&
              " Sellswords are listed beside the rank they screen — the shield only covers its own arm and its own tier."}
            {!hasWalls && " A raid is open field: no walls, no engines, no emplaced works."}
          </p>
          <ForcesTable
            a={report.forces.attacker}
            d={report.forces.defender}
            aName={A}
            dName={D}
            full={hasTroops}
            siege={hasWalls}
          />
        </>
      )}

      {/* ── 3 · The figures at a glance ──────────────────────────────────── */}
      {/* Four numbers before any prose. Without this the reader has to mine
          three paragraphs for "did I lose people, and did I get paid". */}
      <div className="br-tiles">
        {isBombard ? (
          <>
            {/* An artillery exchange is measured in stone and crews, not in
                regulars — there are none present to lose. */}
            <Tile
              icon="brick"
              label="Their wall"
              value={report.wallIntegrityDamage > 0 ? `−${pct(report.wallIntegrityDamage)}` : "untouched"}
              sub="integrity lost this barrage"
              tone={report.wallIntegrityDamage > 0 ? "good" : undefined}
            />
            <Tile
              icon="siege"
              label="Engines you lost"
              value={fmt(Object.values(report.siegeGearLost).reduce((n, v) => n + (v ?? 0), 0))}
              sub="wrecked outright, not repairable"
              tone={Object.values(report.siegeGearLost).some((v) => (v ?? 0) > 0) ? "bad" : undefined}
            />
            <Tile
              icon="target"
              label="Their battery broken"
              value={fmt(Object.values(report.siegeCountersLost ?? {}).reduce((n, v) => n + (v ?? 0), 0))}
              sub={report.batterySilenced ? "and the rest fell silent" : "Counter-Engines wrecked"}
              tone={report.batterySilenced ? "good" : undefined}
            />
            <Tile
              icon="wrench"
              label="Engineers lost"
              value={`${fmt(report.attackerLosses.engineers)} / ${fmt(report.defenderLosses.engineers)}`}
              sub="yours / theirs, cut down at their posts"
              tone={report.attackerLosses.engineers > 0 ? "bad" : undefined}
            />
          </>
        ) : (
          <>
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
            {hasWalls ? (
              <Tile
                icon="brick"
                label="Their wall"
                value={report.wallIntegrityDamage > 0 ? `−${pct(report.wallIntegrityDamage)}` : "untouched"}
                sub={report.batterySilenced ? "their battery is silenced" : "integrity lost"}
                tone={report.wallIntegrityDamage > 0 ? "good" : undefined}
              />
            ) : (
              <Tile
                icon="fire"
                label="Stamina spent"
                value={`−${report.staminaLoss.attacker}`}
                sub={`they spent −${report.staminaLoss.defender}`}
              />
            )}
          </>
        )}
      </div>

      {/* ── 4 · What it cost ─────────────────────────────────────────────── */}
      <H icon="skull">{isBombard ? "What the barrage cost" : "The butcher\u2019s bill"}</H>
      <p className="br-note">
        {isBombard ? (
          <>
            No soldier was within a mile of this. The only people who can die in an artillery
            exchange are the <b>engineers at the machines</b> — and they die only once a battery has
            three times the guns of what it is shooting at.
          </>
        ) : (
          <>
            <b>Regulars are population.</b> They carry your veterancy, count toward your score, and
            cannot be re-bought. Sellswords die first — at their own arm <i>and</i> their own rank —
            and cost only gold.
          </>
        )}
      </p>
      {hasTroops && (
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
      )}
      <ul className="br-facts">
        {isBombard && (
          <Fact icon="wrench">
            Engineers cut down at their posts: <b>{fmt(report.attackerLosses.engineers)}</b> ({A}) ·{" "}
            <b>{fmt(report.defenderLosses.engineers)}</b> ({D}).
            {report.attackerLosses.engineers + report.defenderLosses.engineers === 0 &&
              " Neither battery ever had the three-to-one advantage that puts crews at risk."}
          </Fact>
        )}
        {(report.woundedRecovered ?? 0) > 0 && (
          <Fact icon="heart">
            <b>{fmt(report.woundedRecovered ?? 0)} of the fallen</b> were carried off the field
            alive by {D}&rsquo;s surgeons — their own soldiers first, then the hired. They fell; the
            field hospital is what happened next.
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

      {/* ── 5 · What was taken ───────────────────────────────────────────── */}
      {/* A bombard has no spoils section at all — it is not a mode that can
          take anything, so "nothing came home" would be answering a question
          nobody asked. Revenge keeps its section, because it DOES strip the
          fallen even though it carries no loot. */}
      {!isBombard && (
        <>
      <H icon="coin">The spoils</H>
      {hauled === 0 ? (
        <p className="br-note">
          Nothing came home.{" "}
          {canLoot
            ? "The field was lost, and the loser hauls nothing."
            : "A revenge carries no loot by design — its payment is dead regulars, and what it strips off them."}
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
        </>
      )}

      {/* ── 6 · What was broken ──────────────────────────────────────────── */}
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

      {/* ── 7 · How the assault was shaped ───────────────────────────────── */}
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

      {/* ── 8 · The telling ──────────────────────────────────────────────── */}
      <H icon="scroll">How it went, beat by beat</H>
      <p className="br-note">
        {isBombard
          ? `One barrage, landing with ${BOMBARD_INTENSITY}× the weight of a single throw. Trebuchets against the Counter-Engines and the masonry, and nothing else — no soldier is present to fight.`
          : "One exchange, down a fixed order of battle. There are no rounds — you come back tomorrow."}
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
