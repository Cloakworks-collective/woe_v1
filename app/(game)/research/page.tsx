import { Btn } from "@/components/Btn";
import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { Info } from "@/components/Info";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ResearchStatus } from "@/components/ResearchStatus";
import {
  MAX_FIELD_LEVEL,
  RESEARCH_FIELDS,
  RESEARCH_GUIDE,
  RESEARCH_INFO,
  researchOrdinalCost,
} from "@/lib/constants";
import type { ResearchField, ResearchFieldMeta } from "@/lib/constants/research";
import {
  level,
  researchLevel,
  researchLevelEffect,
  researchRate,
  totalResearchLevels,
  type Player,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

// 1 turn = 10 minutes. Turn a turn-count into a "~N turns (~Xh Ym)" ETA label.
function etaLabel(turns: number): string {
  if (!Number.isFinite(turns) || turns <= 0) return "—";
  const mins = turns * 10;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const time = h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return `~${fmt(turns)} turn${turns === 1 ? "" : "s"} (${time})`;
}

const META: Record<ResearchField, ResearchFieldMeta> = Object.fromEntries(
  RESEARCH_FIELDS.map((f) => [f.id, f]),
) as Record<ResearchField, ResearchFieldMeta>;

// The three disciplines the ten fields fall into — the branches of the tree.
const DISCIPLINES: { key: string; name: string; blurb: string; fields: ResearchField[] }[] = [
  {
    key: "economy",
    name: "⚒ Economy",
    blurb: "Feed, enrich, and grow the realm",
    fields: ["crop_rotation", "forestry", "masonry", "deep_smelting", "statecraft"],
  },
  {
    key: "war",
    name: "⚔ War",
    blurb: "Sharpen the army for battle",
    fields: ["art_of_war", "shieldcraft", "siegecraft"],
  },
  {
    key: "shadow",
    name: "🗡 Shadow",
    blurb: "Spies & scouts — power, not prestige",
    fields: ["tradecraft", "pathfinding"],
  },
];

const queuedLevels = (p: Player, field: ResearchField) =>
  (p.researchQueue ?? []).filter((e) => e.field === field).length;

// A 5-segment level track: owned levels solid, the next actionable, the rest
// future. Nothing is ever locked — every level is researchable at any time; the
// Collegium only sets how fast (spec/empire.md).
function PipTrack({ fid, lvl }: { fid: ResearchField; lvl: number }) {
  return (
    <span className="rpips" aria-label={`Level ${lvl} of ${MAX_FIELD_LEVEL}`}>
      {Array.from({ length: MAX_FIELD_LEVEL }, (_, i) => {
        const n = i + 1;
        const owned = n <= lvl;
        const isNext = n === lvl + 1;
        const cls = owned ? "owned" : isNext ? "next" : "future";
        return (
          <span
            key={n}
            className={`rpip ${cls}`}
            title={`Level ${n}${owned ? " (earned)" : ""} — ${researchLevelEffect(fid, n)}`}
          >
            {n}
          </span>
        );
      })}
    </span>
  );
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { player: p } = await getGame();
  const collegium = level(p, "collegium");
  const rate = researchRate(p);
  const active = p.research.activeField;
  // Research cost is global + progressive: your next level (in ANY field) is the
  // (totalDone + 1)-th research you undertake, and each is dearer than the last.
  const totalDone = totalResearchLevels(p);
  const nextOrdinal = totalDone + 1;
  const nextCost = researchOrdinalCost(nextOrdinal);
  const ordinalSuffix = (n: number) => {
    const t = n % 100;
    if (t >= 11 && t <= 13) return "th";
    return ["th", "st", "nd", "rd"][n % 10] ?? "th";
  };

  // Headline status: laboring on a field, idle-but-ready, or no scholars at all.
  const scholars = p.workers.researchers;
  const activeLvl = active ? researchLevel(p, active) : 0;
  const activeMaxed = active ? activeLvl >= MAX_FIELD_LEVEL : false;
  const activeBanked = active ? (p.research.banked[active] ?? 0) : 0;
  const activeEtaTurns = active && rate > 0 && !activeMaxed ? Math.ceil((nextCost - activeBanked) / rate) : 0;
  const status: ResearchStatus =
    rate === 0
      ? { state: "silent" }
      : active && !activeMaxed
        ? {
            state: "active",
            fid: active,
            name: META[active].name,
            level: activeLvl,
            percent: Math.min(100, Math.round((activeBanked / nextCost) * 100)),
            eta: etaLabel(activeEtaTurns),
            rate,
            scholars,
          }
        : { state: "idle", scholars };

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">Research, specialisation &amp; score</LearnLink>
      <ResearchStatus {...status} />

      {/* ── The trunk: the Collegium (sets the SPEED, never the ceiling) ──── */}
      <Panel
        title={`The Collegium — level ${collegium} · ${p.workers.researchers} scholars · +${fmt(rate)} research points / turn`}
      >
        <p style={{ fontSize: 14.5, marginBottom: 8 }}>
          <b>Every field is researchable at any time</b> — the Collegium sets only the <b>speed</b>,
          not the ceiling: a small library still learns anything, it just crawls. Scholars are{" "}
          <b>unlimited</b>, and each Collegium level lifts how much research every one of them makes
          (50/turn at L1 up to 500 at L10). But research grows <b>progressively dearer</b> — each
          level you earn, in any field, makes the next cost more — so the{" "}
          <b>order you research in is the strategy</b>.
          Scholars study one field at a time, and <b>switching abandons half</b> the progress banked
          toward the current field&apos;s next level.
        </p>
        <div className="rnext-banner">
          <span>
            📈 Your next level (any field) is your <b>{nextOrdinal}{ordinalSuffix(nextOrdinal)}</b>{" "}
            research — it costs <b>{fmt(nextCost)}</b> research points
            {rate > 0 ? (
              <>
                {" "}· <span style={{ color: "var(--green-dark)", fontWeight: 700 }}>
                  ⏳ {etaLabel(Math.ceil(nextCost / rate))} from empty
                </span>
              </>
            ) : null}
            . The one after: <b>{fmt(researchOrdinalCost(nextOrdinal + 1))}</b>.
          </span>
        </div>
        {rate === 0 && (
          <p style={{ fontSize: 14.5, color: "var(--warn)", fontWeight: 700, marginTop: 8 }}>
            No scholars at work — assign researchers on the Workers page (raise the Collegium to make
            each one faster).
          </p>
        )}
      </Panel>

      {/* ── The branches: disciplines → field nodes ──────────────────────── */}
      <div className="rtree">
        <div className="rtree-branches">
          {DISCIPLINES.map((d) => (
            <div className="rtree-branch" key={d.key}>
              <div className="rtree-branch-head">
                <div className="rtree-branch-name">{d.name}</div>
                <div className="rtree-branch-blurb">{d.blurb}</div>
              </div>
              {d.fields.map((fid) => {
                const f = META[fid];
                const lvl = researchLevel(p, fid);
                const banked = p.research.banked[fid] ?? 0;
                const maxed = lvl >= MAX_FIELD_LEVEL;
                // Cost is global (the next level, whatever the field, is your
                // nextOrdinal-th research) — every field shows the same next cost.
                const cost = maxed ? null : nextCost;
                const isActive = active === fid;
                return (
                  <section className={`rnode${isActive ? " active" : ""}`} key={fid}>
                    <div className="rnode-top">
                      <div className="rnode-emblem">
                        <Art path={`research/${fid}`} size={76} title={f.name} />
                      </div>
                      <div className="rnode-headings">
                        <div className="rnode-name">
                          <Info
                            tip={RESEARCH_INFO[fid].tip}
                            title={RESEARCH_INFO[fid].title}
                            guide={RESEARCH_GUIDE[fid]}
                          >
                            {f.name}
                          </Info>
                          {!f.ranked && <span className="rnode-shadow-tag">shadow</span>}
                        </div>
                        <PipTrack fid={fid} lvl={lvl} />
                      </div>
                    </div>

                    <p className="rnode-effect">{researchLevelEffect(fid, lvl)}</p>

                    {maxed ? (
                      <b className="rnode-mastered">★ Mastered — 100% of its power.</b>
                    ) : (
                      <>
                        <div className="rnode-progress">
                          <div className={`bar${isActive ? " good" : ""}`}>
                            <i style={{ width: `${Math.min(100, Math.round((banked / cost!) * 100))}%` }} />
                          </div>
                          <div className="rnode-cost">
                            <b>{Math.min(100, Math.round((banked / cost!) * 100))}%</b> ·{" "}
                            {fmt(banked)} / {fmt(cost!)} pts → level {lvl + 1}{" "}
                            <span style={{ color: "var(--ink-soft)" }}>(your {nextOrdinal}{ordinalSuffix(nextOrdinal)} research)</span>
                          </div>
                          {isActive && (
                            <div className="rnode-eta">
                              {rate > 0 ? (
                                <>⏳ {etaLabel(Math.ceil((cost! - banked) / rate))} to level {lvl + 1}</>
                              ) : (
                                <span style={{ color: "var(--warn)" }}>
                                  ⚠ no scholars at work — assign researchers on the Workers page
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="rnode-actions">
                          {isActive ? (
                            <b className="rnode-laboring">⚗ The scholars labor here.</b>
                          ) : (
                            <CmdForm name="setResearch" path="/research">
                              <input type="hidden" name="field" value={fid} />
                              {active && active !== fid ? (
                                <ReqTip
                                  heading={`Switch scholars to ${f.name}`}
                                  body={`Redirect your scholars here. Points already banked toward ${f.name} are kept — but you forfeit half of ${META[active].name}'s progress toward its next level.`}
                                  note="Switching back later costs half again; study one field to the level you need before moving on."
                                >
                                  <Btn className="btn">Switch here</Btn>
                                </ReqTip>
                              ) : (
                                <ReqTip
                                  heading={`Study ${f.name}`}
                                  body="Set your scholars to work this field — they bank research points toward its next level every turn. No gold cost; progress comes from your researchers."
                                >
                                  <Btn className="btn">Study this</Btn>
                                </ReqTip>
                              )}
                            </CmdForm>
                          )}
                          {p.premium && (
                            <CmdForm name="queueResearch" path="/research">
                              <input type="hidden" name="field" value={fid} />
                              <Btn className="btn" title="Queue a level for the Steward">
                                🪶{queuedLevels(p, fid) > 0 ? ` +${queuedLevels(p, fid)}` : ""}
                              </Btn>
                            </CmdForm>
                          )}
                        </div>
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
