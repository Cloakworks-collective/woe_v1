import { Btn } from "@/components/Btn";
import Link from "next/link";
import { MagicKeyPanel } from "@/components/MagicKeyPanel";
import { Art } from "@/components/Art";
import { BuildingArt } from "@/components/BuildingArt";
import { Census } from "@/components/Census";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { HealthBar } from "@/components/HealthBar";
import { Info } from "@/components/Info";
import { LearnLink } from "@/components/LearnLink";
import { Meter } from "@/components/Meter";
import { Panel } from "@/components/Panel";
import { ResIcon } from "@/components/ResIcon";
import { CollegiumCall } from "@/components/CollegiumCall";
import { RegentCharges } from "@/components/RegentCharges";
import { ResearchView } from "@/components/ResearchView";
import { SettlementView } from "@/components/SettlementView";
import { StatTile } from "@/components/StatTile";
import { StatTip } from "@/components/StatTip";
import { TiredArt } from "@/components/TiredArt";
import { LocalTime } from "@/components/LocalTime";
import { RecruitHourPicker } from "@/components/RecruitHourPicker";
import { TaxAndRates } from "@/components/TaxAndRates";
import { VacationGate } from "@/components/VacationGate";
import { VictoryTracker } from "@/components/VictoryTracker";
import {
  ACTION_GUIDE,
  ACTION_INFO,
  CIVILIAN_BUILDINGS,
  HOUSING_PER_HEARTHSTEAD,
  POP_GROWTH,
  MILITARY_BUILDINGS,
  RACES,
  RACE_NAMES,
  SIEGE_GEAR,
  GUILD_BONUS_PER_LEVEL,
  STAMINA,
  STORAGE_BUILDING,
  VACATION_DAYS_PER_ERA,
  VACATION_TICKS_PER_ERA,
  VACATION_TAX_FACTOR,
  VACATION_PRODUCTION_FACTOR,
  VACATION_RESEARCH_FACTOR,
  VACATION_REATTACK_COOLDOWN_TICKS,
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
  SCORE,
  TICKS_PER_HOUR,
  TURN_MINUTES,
  TURNS_PER_DAY,
  WAR_FOUNDRY_LADDER,
  EXPERIENCE,
} from "@/lib/constants";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  crewGear,
  foodUpkeepPerTurn,
  level,
  shelterCapacity,
  military,
  popPerDay,
  productionRates,
  rankingBreakdown,
  rankingScore,
  settlementTitle,
  structureIntegrity,
  taxIncomePerTurn,
  totalPopulation,
  unbankedGold,
  unstored,
  vacantHousing,
  vacationAwayTicks,
  wallManning,
  growthBreakdown,
  guardRatio,
  type GameEvent,
  type Resource,
  veterancyBonus,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const metadata = { title: "Command" };

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const GEAR_KEYS = ["ropes", "ladders", "rams", "ballistae", "trebuchets"] as const;
const WEAPON_NAME: Record<(typeof GEAR_KEYS)[number], string> = Object.fromEntries(
  WAR_FOUNDRY_LADDER.filter((s) => s.gearKey).map((s) => [s.gearKey!, s.name]),
) as Record<(typeof GEAR_KEYS)[number], string>;
const RES_LABELS: { key: Resource; label: string; icon: string }[] = [
  { key: "food", label: "Food", icon: "🍞" },
  { key: "wood", label: "Wood", icon: "🪵" },
  { key: "stone", label: "Stone", icon: "🪨" },
  { key: "ore", label: "Ore", icon: "⚒️" },
];

export default async function CommandView({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const rates = productionRates(p);
  const foodNet = rates.food - foodUpkeepPerTurn(p);
  // The Counting House & storehouses as one model. Every "Bank" is bank-all: it
  // stores the most the vault can take (min of loose stock and remaining room).
  // A bombarded store shelters less (capacity × integrity) and its overflow
  // spills back out into the open — raidable again — which we surface per row.
  type Holding = {
    key: "gold" | Resource;
    label: string;
    icon: React.ReactNode;
    loose: number;
    vaulted: number;
    fullCap: number; // capacity at full health
    integrity: number; // 0.5–1.0; <1 = bombarded
    protectedCap: number; // fullCap × integrity — what's actually sheltered
    spilled: number; // vaulted beyond the shelter — spilled back into the open
    exposed: number; // loose + spilled — what raiders/spies can take
    bankMax: number; // how much a Bank-all would move in (fills the shelter)
    full: boolean; // shelter is topped out
  };
  const makeHolding = (key: "gold" | Resource, label: string, icon: React.ReactNode): Holding => {
    const building = STORAGE_BUILDING[key];
    const loose = key === "gold" ? p.gold : p.resources[key];
    const vaulted = key === "gold" ? p.bankedGold : bankedRes(p)[key];
    const fullCap = shelterCapacity(p, building);
    const integrity = buildingIntegrity(p, building);
    const protectedCap = Math.floor(fullCap * integrity);
    const spilled = Math.max(0, vaulted - protectedCap);
    const exposed = key === "gold" ? unbankedGold(p) : unstored(p, key);
    const bankMax = Math.max(0, Math.min(loose, protectedCap - vaulted));
    return {
      key,
      label,
      icon,
      loose,
      vaulted,
      fullCap,
      integrity,
      protectedCap,
      spilled,
      exposed,
      bankMax,
      full: vaulted >= protectedCap,
    };
  };
  const holdings: Holding[] = [
    makeHolding("gold", "Gold", <ResIcon kind="gold" size={20} />),
    ...RES_LABELS.map(({ key, label, icon }) => makeHolding(key, label, icon)),
  ];
  const nextFoundryStep = WAR_FOUNDRY_LADDER.find((s) => s.level === level(p, "war_foundry") + 1);
  // Siege: having an engine and having it MANNED are different — an uncrewed
  // engine can't fire. Compute what's actually fielded.
  const crewed = crewGear(p.army.siegeGear, p.army.siegeEngineers);
  const enginesBuilt = GEAR_KEYS.reduce((s, k) => s + p.army.siegeGear[k], 0);
  const enginesManned = GEAR_KEYS.reduce((s, k) => s + crewed[k], 0);
  const enginesUnmanned = enginesBuilt - enginesManned;
  const engineersBusy = GEAR_KEYS.reduce((s, k) => s + crewed[k] * SIEGE_GEAR[k].crew, 0);
  const engineersIdleCount = Math.max(0, p.army.siegeEngineers - engineersBusy);
  const revengeOpen = p.recentAttackers.filter(
    (a) => world.meta.tickNumber - a.tick <= 108 && !p.revengeUsed.includes(a.playerId),
  );
  // Vacation allowance (spec/combat.md): 20 days per era, spent as you use it.
  const vacationDaysLeft = Math.max(0, VACATION_DAYS_PER_ERA - (p.vacationTicksUsed ?? 0) / TURNS_PER_DAY);
  const vacationBudgetSpent = (p.vacationTicksUsed ?? 0) >= VACATION_TICKS_PER_ERA;
  const away = p.onVacation || p.vacationQueued;
  // The briefing the confirm dialog reads from. Food is projected at VACATION
  // rates, not current ones — the whole question the departing ruler is asking
  // is "will my granary hold while I am gone", and answering it with today's
  // full-strength harvest would be a lie by a factor of five.
  const vacationFoodNet = p.onVacation
    ? rates.food - foodUpkeepPerTurn(p)
    : Math.floor(rates.food * VACATION_PRODUCTION_FACTOR) - foodUpkeepPerTurn(p);
  const awayHours = vacationAwayTicks(p, world.meta.tickNumber) / TICKS_PER_HOUR;
  // The bridge between realm ticks and real instants. The realm's day boundary
  // is an accident of when the world was seeded, so "turn 84" tells a player
  // nothing about whether they will be awake for it — everything the dawn
  // controls show is anchored through here and rendered in the reader's clock.
  const lastTickAtMs = new Date(world.meta.lastTickAt).getTime();
  const tickToMs = (tick: number) =>
    lastTickAtMs + (tick - world.meta.tickNumber) * TURN_MINUTES * 60_000;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clocks">The crown race — ranking &amp; starting the clocks</LearnLink>
      <RegentCharges player={p} />
      <CollegiumCall player={p} />
      <VictoryTracker world={world} me={p} />
      {(() => {
        // Anything cracked by bombardment, surfaced where the ruler actually looks.
        const NAME = new Map<string, string>([
          ...CIVILIAN_BUILDINGS.map((b) => [b.id, b.name] as [string, string]),
          ...MILITARY_BUILDINGS.map((b) => [b.id, b.name] as [string, string]),
          ["hearthstead", "Hearthstead"],
          ["walls", "The Walls"],
        ]);
        const damaged: { id: string; integrity: number }[] = [
          ...(p.wallIntegrity < 1 ? [{ id: "walls", integrity: p.wallIntegrity }] : []),
          ...Object.entries(p.buildingIntegrity ?? {})
            .filter(([, integ]) => (integ as number) < 1)
            .map(([id, integ]) => ({ id, integrity: integ as number })),
        ].sort((a, b) => a.integrity - b.integrity);
        if (damaged.length === 0) return null;
        return (
          <div className="damage-strip" role="status">
            <span className="damage-strip-icon" aria-hidden="true">🔨</span>
            <div className="damage-strip-body">
              <b>
                {damaged.length} structure{damaged.length === 1 ? "" : "s"} cracked by bombardment
              </b>{" "}
              — a wrecked store shelters less, a producer yields less, cracked walls slow recruitment.
              <span className="damage-strip-bars">
                {damaged.slice(0, 4).map((d) => (
                  <span key={d.id} className="damage-strip-item">
                    <HealthBar integrity={d.integrity} label={NAME.get(d.id) ?? d.id} />
                    <span>{NAME.get(d.id) ?? d.id}</span>
                  </span>
                ))}
                {damaged.length > 4 && <span className="damage-strip-item">+{damaged.length - 4} more</span>}
              </span>
            </div>
            <Link className="btn" href="/buildings">
              🔨 Repair
            </Link>
          </div>
        );
      })()}
      <Panel title={`The ${settlementTitle(p)} of ${p.name} — ${RACE_NAMES[p.race]}`}>
        <div className="throne">
          <span className="throne-portrait">
            <Art path={`races/${p.race}`} size={230} title={RACE_NAMES[p.race]} />
            <span className="cap">{RACE_NAMES[p.race]}</span>
          </span>
          <div className="throne-body">
            <div className="stat-grid">
              {/* How the ladder reached that number, in the player's own
                  figures — and, as importantly, what it leaves out. A real
                  bubble rather than a native title: this is a nine-row table
                  and the browser's own tooltip would render it as a grey blob
                  a second after you gave up hovering. */}
              <StatTip
                heading="🏆 How the ladder counts you"
                total={fmt(rankingScore(p))}
                rows={rankingBreakdown(p).map((part) => ({
                  label: part.label,
                  detail: part.detail,
                  value: `+${fmt(part.points)}`,
                }))}
                note={
                  <>
                    Only what a besieger outside your gate could see. <b>Not counted</b>: gold, food
                    and goods, housing and civilian buildings, your offensive siege train, and your
                    spies.
                  </>
                }
              >
                <StatTile icon="🏆" label="Ranking score" value={fmt(rankingScore(p))} />
              </StatTip>
              <StatTile
                icon="👥"
                label="Population"
                value={fmt(totalPopulation(p))}
                sub={`${fmt(civilians(p))} civ · ${fmt(military(p))} at arms`}
              />
              <StatTile
                icon={p.onVacation ? "🏖" : p.vacationQueued ? "⏳" : p.starving ? "☠" : revengeOpen.length ? "⚔️" : "🛡️"}
                label="Status"
                value={
                  p.onVacation
                    ? "On vacation"
                    : p.vacationQueued
                      ? "Vacation queued"
                      : p.starving
                        ? "Starving"
                        : revengeOpen.length
                          ? `${revengeOpen.length} revenge open`
                          : "At large"
                }
                tone={p.starving ? "bad" : away || revengeOpen.length ? "warn" : "good"}
              />
            </div>
            {/* Its own class, not `stat-grid`. The two grids were both
                auto-fit/minmax, so at most widths the three tiles above and the
                two meters below resolved to DIFFERENT column widths and nothing
                lined up — and the veterancy meter's two-part readout wrapped
                its head to a second line, dropping its bar below stamina's.
                Fixed columns here, and the tracks bottom-align. */}
            <div className="throne-meters">
              <Meter
                icon="🔥"
                label="Stamina"
                value={p.army.stamina}
                max={STAMINA.MAX}
                display={`${p.army.stamina} / ${STAMINA.MAX}`}
              />
              {/* Veterancy has no ceiling, so the bar tracks progress to the
                  NEXT +2% rather than to a maximum — a meter pinned full at
                  100% would claim a limit that does not exist, and the default
                  tone would paint a green army's honest +0.4% in alarm red. */}
              <Meter
                icon="🎖️"
                label="Veterancy"
                value={p.army.experiencePoints % EXPERIENCE.POINTS_PER_STEP}
                max={EXPERIENCE.POINTS_PER_STEP}
                tone="good"
                display={
                  <>
                    +{(veterancyBonus(p.army.experiencePoints) * 100).toFixed(1)}%
                    <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>
                      {" · "}
                      {Math.round(
                        EXPERIENCE.POINTS_PER_STEP -
                          (p.army.experiencePoints % EXPERIENCE.POINTS_PER_STEP),
                      ).toLocaleString("en-US")}{" "}
                      to next
                    </span>
                  </>
                }
              />
            </div>
            <div className="throne-flag">
              <VacationGate
                onVacation={p.onVacation}
                queued={Boolean(p.vacationQueued)}
                budgetSpent={vacationBudgetSpent}
                daysLeft={vacationDaysLeft}
                daysPerEra={VACATION_DAYS_PER_ERA}
                taxPct={Math.round(VACATION_TAX_FACTOR * 100)}
                productionPct={Math.round(VACATION_PRODUCTION_FACTOR * 100)}
                researchPct={Math.round(VACATION_RESEARCH_FACTOR * 100)}
                settlersPerDay={popPerDay(p)}
                vacantBeds={vacantHousing(p)}
                foodNetPerTurn={vacationFoodNet}
                foodStock={p.resources.food + bankedRes(p).food}
                reattackHours={VACATION_REATTACK_COOLDOWN_TICKS / TICKS_PER_HOUR}
                awayHours={awayHours}
                shieldMinHours={VACATION_RETURN_SHIELD_MIN_TICKS / TICKS_PER_HOUR}
                shieldHours={VACATION_RETURN_SHIELD_TICKS / TICKS_PER_HOUR}
              />
              <span style={p.onVacation ? { color: "var(--warn)" } : undefined}>
                {p.onVacation
                  ? `Away ${awayHours.toFixed(1)}h · ${vacationDaysLeft.toFixed(1)} of ${VACATION_DAYS_PER_ERA} vacation-days left`
                  : p.vacationQueued
                    ? "Queued — begins when revenge windows close"
                    : vacationBudgetSpent
                      ? "No vacation-days left this era"
                      : `${vacationDaysLeft.toFixed(1)} of ${VACATION_DAYS_PER_ERA} vacation-days left this era`}
              </span>
              <Info tip={ACTION_INFO.vacation} guide={ACTION_GUIDE.vacation} />
            </div>
          </div>
        </div>
      </Panel>

      <div className="panel-row">
        <Panel title="Tax &amp; Production — the realm's pulse">
          {/* The dial and every figure it governs share one piece of state, so
              the trade-off moves as you drag rather than after a reload. */}
          <TaxAndRates player={p} />
        </Panel>

        {/* Settlers, on their own. This used to sit under the tax dial inside a
            single "Growth" panel, which read as though production and
            population were one system — they are not, and a ruler looking for
            why their town had stopped filling had to scroll past the tax slider
            to find out. The four terms, when the next lot arrive, and where
            they will sleep: one panel, one question. */}
        <Panel title="Settlers — how your people multiply" guide="/guide#grow">
          <div className="growth-breakdown">
            {(() => {
              const g = growthBreakdown(p);
              const parts: { label: string; value: number; max: number; hint: string }[] = [
                { label: "Base", value: g.base, max: POP_GROWTH.BASE, hint: "Everyone gets this, always." },
                {
                  label: "Safety",
                  value: g.safety,
                  max: 10,
                  hint: `Guard-to-civilian ratio ${(guardRatio(p) * 100).toFixed(0)}% — +4 at 20%, +8 at 25%, +10 at 30%. Sellswords count.`,
                },
                {
                  label: "Prosperity",
                  value: g.prosperity,
                  max: POP_GROWTH.PROSPERITY_MAX,
                  hint: "+1 per level of Grange, Sawyer's Mill, Mason's Quarry and Deepvein Mine. Storage does not count — a full granary is not a job.",
                },
                {
                  label: "Walls",
                  value: g.walls,
                  max: POP_GROWTH.WALLS_PER_LEVEL * 10,
                  // The manning fraction is the part people are surprised by, so
                  // it leads — and it says how many regulars would fix it.
                  hint: `+${POP_GROWTH.WALLS_PER_LEVEL} per wall level, scaled by integrity (${Math.round(p.wallIntegrity * 100)}%) AND by how much of the wall is held: ${Math.round(wallManning(p) * 100)}% manned — ${fmt(military(p))} regulars of the ${fmt(level(p, "walls") * SCORE.WALL_TROOPS_PER_LEVEL)} that walls this high want. Rubble reassures nobody, and neither does an empty parapet.`,
                },
              ];
              return (
                <>
                  {parts.map((part) => (
                    <span
                      key={part.label}
                      className={`growth-part${part.value === 0 ? " is-zero" : ""}${part.value >= part.max ? " is-max" : ""}`}
                      title={part.hint}
                    >
                      <b>{part.label}</b> +{part.value}
                      <i>/{part.max}</i>
                    </span>
                  ))}
                  <span className="growth-total" title={`Clamped to ${POP_GROWTH.MIN}–${POP_GROWTH.MAX}/day, then capped by vacant beds.`}>
                    = <b>{g.total}</b>/day
                  </span>
                </>
              );
            })()}
          </div>

          {/* Your dawn. Everyone plays from a different timezone, so the hour
              recruitment lands is yours to choose — ONCE an era, and never in a
              way that pays out twice inside a day (see setRecruitHour). */}
          <div className="dawn-row">
            <span className="dawn-when">
              🌅 Next settlers{" "}
              <b>
                <LocalTime
                  atMs={
                    tickToMs(
                      p.nextRecruitAtTick ??
                        world.meta.tickNumber +
                          (TURNS_PER_DAY - (world.meta.tickNumber % TURNS_PER_DAY)),
                    )
                  }
                />
              </b>
            </span>
            {p.recruitHourChanged ? (
              <span className="dawn-locked">
                Your dawn is set for this era.{" "}
                <Info tip="The hour may be moved once an age. It resets when the next era opens." />
              </span>
            ) : (
              <RecruitHourPicker
                currentTick={world.meta.tickNumber}
                lastTickAtMs={lastTickAtMs}
                turnMinutes={TURN_MINUTES}
                turnsPerDay={TURNS_PER_DAY}
                lastRecruitAtTick={p.lastRecruitAtTick}
              />
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <Meter
              icon="🏠"
              label="Housing"
              value={civilians(p)}
              max={level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD}
              display={`${fmt(civilians(p))} / ${fmt(level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD)} beds`}
              tone={vacantHousing(p) === 0 ? "warn" : "good"}
            />
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, marginBottom: 0 }}>
            More civilian building levels bring settlers faster; raise <Link href="/buildings">Hearthsteads</Link> to house them.
          </p>
        </Panel>
      </div>

      {/* Its own row. It is a four-column ledger and it was being squeezed into
          half the page beside the growth panel. */}
      <Panel title="The Counting House — the realm's bank">
          {/* FOUR columns, not five. "Loose" and "Exposed" were the same number
              in every ordinary game: exposed is loose PLUS whatever a bombarded
              vault has spilled, and nothing spills while your stores stand. So
              the ledger carried a duplicate column that only diverged after a
              bombardment — and paid for it by overflowing on narrow screens.
              One column now, named for the thing that matters (what a raider
              takes), with the spill called out inline on the rare turn it is
              not just the loose pile. */}
          <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">
                  <Info tip="Everything a raider carries off or a spy burns: your loose stock, plus anything a bombarded vault has spilled back into the open. Store it to shelter it.">
                    Exposed
                  </Info>
                </th>
                <th className="num">
                  <Info tip="Sheltered in the vault — safe from raiders and spies while the store stands. A bombarded store shelters less (capacity × its integrity) and any overflow spills back into the open.">
                    Vaulted / shelter
                  </Info>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const damaged = h.integrity < 1;
                return (
                  <tr key={h.key}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {h.icon} {h.label}
                      </span>
                    </td>
                    <td className="num" style={h.exposed > 0 ? { color: "var(--neg)" } : undefined}>
                      {fmt(h.exposed)}
                      {h.spilled > 0 && (
                        <span
                          title="Overflow from the bombarded vault — back in the open and raidable until the store is repaired."
                          style={{ display: "block", fontSize: 11, color: "var(--red)" }}
                        >
                          incl. {fmt(h.spilled)} spilled
                        </span>
                      )}
                    </td>
                    <td className="num" style={h.key === "gold" ? { color: "var(--coin)" } : undefined}>
                      {fmt(h.vaulted)}{" "}
                      <span style={{ color: "var(--ink-soft)" }}>/ {fmt(h.protectedCap)}</span>
                      {h.full && h.protectedCap > 0 && !damaged && (
                        <span
                          title="This vault is full — no more can be sheltered."
                          style={{ marginLeft: 6, color: "var(--green)", fontWeight: 700, fontSize: 11.5 }}
                        >
                          FULL
                        </span>
                      )}
                      {damaged && (
                        <Link
                          href="/buildings"
                          className="store-dmg"
                          title={`Bombarded — the store is at ${Math.round(h.integrity * 100)}% integrity, so it shelters only ${fmt(h.protectedCap)} of its ${fmt(h.fullCap)} capacity. Click to repair on the Buildings page.`}
                        >
                          <span className="store-dmg-tag">🔥 repair</span>
                          <HealthBar integrity={h.integrity} label={`${h.label} store`} />
                        </Link>
                      )}
                    </td>
                    {/* Shown to EVERYONE, Charter or not. The Steward banks on
                        the tick; between ticks a ruler may want it sheltered
                        NOW — loot just landed, a sale just cleared, a siege is
                        coming — and waiting up to ten minutes for the automation
                        is not a choice anybody would make. The button is simply
                        idle when there is nothing loose to move. */}
                    <td>
                      <CmdForm name={h.key === "gold" ? "bank" : "bankRes"} path="/">
                          {h.key !== "gold" && <input type="hidden" name="what" value={h.key} />}
                          <input type="hidden" name="amount" value={h.bankMax} />
                          <Btn
                            className="btn"
                            style={{ padding: "3px 10px", fontSize: 13 }}
                            disabled={h.bankMax <= 0}
                            title={
                              h.bankMax > 0
                                ? `Shelter ${fmt(h.bankMax)} ${h.label} in the vault`
                                : h.loose <= 0
                                  ? `No loose ${h.label} to store`
                                  : "The shelter is already full"
                            }
                          >
                            Store all
                        </Btn>
                      </CmdForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
            {p.premium ? (
              <>
                🪶 <b>The Steward shelters your gold and goods automatically</b> each turn, up to
                capacity — a Royal Charter privilege. <b>Store all</b> still works by hand when you
                would rather not wait for the next turn — after a sale, after loot lands, or with a
                siege coming.
              </>
            ) : (
              <>
                <b>Store all</b> shelters the most each vault can hold — safe from raiders and spies.
                The granary always feeds your people first. Holders of the{" "}
                <Link href="/premium">Royal Charter</Link> have the Steward shelter everything
                automatically. <Info tip={ACTION_INFO.bank} guide={ACTION_GUIDE.bank} />
              </>
            )}{" "}
            A bombarded store shelters less and spills its overflow — repair it on the{" "}
            <Link href="/buildings">Buildings</Link> page. Raise storage buildings for deeper vaults.
          </p>
      </Panel>

      <Panel title="Your Settlement — hall by hall">
        <SettlementView player={p} />
      </Panel>

      <Panel title="The People — your census">
        <Census player={p} />
      </Panel>

      <Panel title="The Collegium — your research">
        <ResearchView player={p} />
      </Panel>

      <div className="panel-row">
        <Panel title={`The Siege Train — ${enginesManned} of ${enginesBuilt} engines manned`}>
          <div className="stat-grid">
            <StatTile
              icon={<TiredArt path="units/engineer" stamina={p.army.stamina} size={46} title="Siege engineers" race={p.race} />}
              label="Engineer crews"
              value={fmt(p.army.siegeEngineers)}
              sub={`${fmt(engineersBusy)} manning · ${fmt(engineersIdleCount)} idle`}
              tone={enginesUnmanned > 0 ? "warn" : undefined}
            />
            <StatTile
              icon={<BuildingArt id="war_foundry" level={level(p, "war_foundry")} size={46} title="Engine Yard" integrity={structureIntegrity(p, "war_foundry")} />}
              label="Engine Yard"
              value={`level ${level(p, "war_foundry")} / 10`}
              sub={nextFoundryStep ? `next: ${nextFoundryStep.name}` : "the full ladder is forged"}
            />
            {GEAR_KEYS.map((key) => {
              const built = p.army.siegeGear[key];
              const manned = crewed[key];
              return (
                <StatTile
                  key={key}
                  icon={<Art path={`siege/${key}`} size={46} title={WEAPON_NAME[key]} />}
                  label={WEAPON_NAME[key]}
                  value={
                    <>
                      {fmt(manned)}
                      <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}> / {fmt(built)}</span>
                    </>
                  }
                  sub={built === 0 ? `none built · crew ${SIEGE_GEAR[key].crew}` : `manned / built · crew ${SIEGE_GEAR[key].crew}`}
                  tone={built > 0 && manned < built ? "warn" : built > 0 ? "good" : undefined}
                />
              );
            })}
          </div>
          {enginesUnmanned > 0 ? (
            <p className="siege-warn" style={{ marginTop: 8 }}>
              ⚠ <b>{enginesUnmanned}</b> of your <b>{enginesBuilt}</b> engines stand <b>unmanned</b> —
              they can&apos;t fire without crews.{" "}
              <Link href="/siege">🔧 Train engineers at the Siege Works →</Link>
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
              {RACES[p.race].siege !== 1 && (
                <>
                  {RACE_NAMES[p.race]} work engines at{" "}
                  <b>×{RACES[p.race].siege.toFixed(2).replace(/0$/, "")}</b> force.{" "}
                </>
              )}
              <Link href="/siege">To the Siege Works →</Link>
            </p>
          )}
        </Panel>

        <Panel title="The Shadow Work — spies & scouts">
          <div className="stat-grid">
            <StatTile
              icon={<Art path="units/spy" size={46} title="Spies" race={p.race} />}
              label="Spies"
              value={fmt(p.army.spies)}
              sub={`unlimited — Guild L${level(p, "shadow_guild")} missions +${Math.round(level(p, "shadow_guild") * GUILD_BONUS_PER_LEVEL * 100)}%`}
            />
            <StatTile
              icon={<Art path="units/scout" size={46} title="Scouts" race={p.race} />}
              label="Scouts"
              value={fmt(p.army.scouts)}
              sub={`the only thing standing between your storehouses and their spies`}
            />
            <StatTile
              icon={<BuildingArt id="shadow_guild" level={level(p, "shadow_guild")} size={46} title="Shadow Guild" integrity={structureIntegrity(p, "shadow_guild")} />}
              label="Shadow Guild"
              value={`level ${level(p, "shadow_guild")}`}
              sub="steal ledgers, sabotage, torch stores"
            />
            <StatTile
              icon={<BuildingArt id="rangers_lodge" level={level(p, "rangers_lodge")} size={46} title="Ranger's Lodge" integrity={structureIntegrity(p, "rangers_lodge")} />}
              label="Ranger's Lodge"
              value={`level ${level(p, "rangers_lodge")}`}
              sub="recon rivals; catch their spies"
            />
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, marginBottom: 0 }}>
            {RACES[p.race].spy !== 1 && (
              <>
                {RACE_NAMES[p.race]} run missions at <b>×{RACES[p.race].spy.toFixed(2).replace(/0$/, "")}</b>{" "}
                effect.{" "}
              </>
            )}
            Train them at the <Link href="/train">Levy</Link>; loose them from the{" "}
            <Link href="/rankings">Rankings</Link>.
          </p>
        </Panel>
      </div>

      {revengeOpen.length > 0 && (
        <Panel title="⚔ Revenge windows open">
          <p style={{ margin: 0, fontSize: 14.5 }}>
            You may strike back at:{" "}
            {revengeOpen.map((r) => world.players[r.playerId]?.name ?? "?").join(", ")} —{" "}
            <Link href="/rankings">to the ladder</Link>.
          </p>
        </Panel>
      )}

      <MagicKeyPanel />
    </>
  );
}
