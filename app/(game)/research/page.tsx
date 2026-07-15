import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { Info } from "@/components/Info";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import {
  MAX_FIELD_LEVEL,
  RESEARCH_FIELDS,
  RESEARCH_GUIDE,
  RESEARCH_INFO,
  collegiumRequired,
  rpCost,
} from "@/lib/constants";
import type { ResearchField, ResearchFieldMeta } from "@/lib/constants/research";
import { level, researchLevel, researchLevelEffect, researchRate, type Player } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

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

// A 5-segment level track: owned levels solid, the next actionable, gated locked.
function PipTrack({ lvl, collegium }: { lvl: number; collegium: number }) {
  return (
    <span className="rpips" aria-label={`Level ${lvl} of ${MAX_FIELD_LEVEL}`}>
      {Array.from({ length: MAX_FIELD_LEVEL }, (_, i) => {
        const n = i + 1;
        const need = collegiumRequired(n);
        const owned = n <= lvl;
        const isNext = n === lvl + 1;
        const gated = collegium < need;
        const cls = owned
          ? "owned"
          : isNext && !gated
            ? "next"
            : gated
              ? "gated"
              : "future";
        const title = owned
          ? `Level ${n} — earned`
          : gated
            ? `Level ${n} — locked until Collegium level ${need}`
            : `Level ${n}`;
        return (
          <span key={n} className={`rpip ${cls}`} title={title}>
            {gated && !owned ? "🔒" : n}
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

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">Research, specialisation &amp; score</LearnLink>

      {/* ── The trunk: the Collegium and its tier ladder ─────────────────── */}
      <Panel
        title={`The Collegium — level ${collegium} · ${p.workers.researchers} scholars · +${fmt(rate)} research points / turn`}
      >
        <p style={{ fontSize: 13.5, marginBottom: 8 }}>
          Every field grows through five levels, but the <b>Collegium gates how far you can climb</b>{" "}
          — each higher tier of research needs a taller library. Scholars study one field at a time
          (progress is saved when you switch), so you can never master everything. Choose an
          identity: the economist, the warlord, or the spymaster.
        </p>
        <div className="rtier-ladder">
          {Array.from({ length: MAX_FIELD_LEVEL }, (_, i) => {
            const fieldLvl = i + 1;
            const need = collegiumRequired(fieldLvl);
            const unlocked = collegium >= need;
            return (
              <div key={fieldLvl} className={`rtier ${unlocked ? "on" : "off"}`}>
                <div className="rtier-lvl">{unlocked ? "✓" : "🔒"} Field lvl {fieldLvl}</div>
                <div className="rtier-need">needs Collegium {need}</div>
              </div>
            );
          })}
        </div>
        {rate === 0 && (
          <p style={{ fontSize: 13.5, color: "var(--warn)", fontWeight: 700, marginTop: 8 }}>
            No scholars at work — assign researchers on the Workers page (they need Collegium slots).
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
                const nextCost = maxed ? null : rpCost(lvl + 1);
                const gateNeed = collegiumRequired(lvl + 1);
                const gateOk = maxed || collegium >= gateNeed;
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
                        <PipTrack lvl={lvl} collegium={collegium} />
                      </div>
                    </div>

                    <p className="rnode-effect">{researchLevelEffect(fid, lvl)}</p>

                    {maxed ? (
                      <b className="rnode-mastered">★ Mastered — 100% of its power.</b>
                    ) : (
                      <>
                        <div className="rnode-progress">
                          <div className="bar">
                            <i style={{ width: `${Math.min(100, (banked / nextCost!) * 100)}%` }} />
                          </div>
                          <div className="rnode-cost">
                            {fmt(banked)} / {fmt(nextCost!)} pts → level {lvl + 1}
                            {!gateOk && (
                              <span className="rnode-gate"> · 🔒 needs Collegium {gateNeed}</span>
                            )}
                          </div>
                        </div>
                        <div className="rnode-actions">
                          {isActive ? (
                            <b className="rnode-laboring">⚗ The scholars labor here.</b>
                          ) : (
                            <CmdForm name="setResearch" path="/research">
                              <input type="hidden" name="field" value={fid} />
                              <button className="btn" disabled={!gateOk} title={gateOk ? undefined : `Raise the Collegium to level ${gateNeed} first`}>
                                Study this
                              </button>
                            </CmdForm>
                          )}
                          {p.premium && (
                            <CmdForm name="queueResearch" path="/research">
                              <input type="hidden" name="field" value={fid} />
                              <button className="btn" title="Queue a level for the Steward">
                                🪶{queuedLevels(p, fid) > 0 ? ` +${queuedLevels(p, fid)}` : ""}
                              </button>
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
