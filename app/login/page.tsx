import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { NameField } from "@/components/NameField";
import { RACES, RACE_NAMES } from "@/lib/constants";
import type { Race, RaceModifiers } from "@/lib/constants/races";
import { createEmpire, enterWithToken } from "@/app/actions";
import { devOpenAdmin } from "@/lib/server/admin";
import { currentPlayerId } from "@/lib/server/auth";
import { getWorld } from "@/lib/server/world";

export const dynamic = "force-dynamic";

// The six peoples, as a muster line. Tone = the race's heraldic tincture,
// held muted so the six read as one banner-hall, not a rainbow. Boon is honest
// to the race modifiers in lib/constants/races.ts.
const CHAMPIONS: { race: Race; tone: string; boon: string }[] = [
  { race: "human", tone: "#8a2d2a", boon: "Plenty & spycraft" },
  { race: "elf", tone: "#3f6130", boon: "Archers & the greenwood" },
  { race: "orc", tone: "#9a4a1e", boon: "The cavalry horde" },
  { race: "troll", tone: "#59636e", boon: "Stone & siege engines" },
  { race: "dwarf", tone: "#8a6a2f", boon: "The iron wall" },
  { race: "gnoll", tone: "#a98526", boon: "Jackal spymasters" },
];

// The ledger of gifts & burdens — every race modifier as a % against an
// unmodified 1.0 (lib/constants/races.ts; balanced by equal-cost army power,
// not sum-zero). For costs, lower is the gift.
const BONUS_ROWS: { label: string; get: (m: RaceModifiers) => number; goodWhenLow?: boolean }[] = [
  { label: "Food", get: (m) => m.production.food },
  { label: "Wood", get: (m) => m.production.wood },
  { label: "Stone", get: (m) => m.production.stone },
  { label: "Ore", get: (m) => m.production.ore },
  { label: "Defence", get: (m) => m.defence },
  { label: "Walls", get: (m) => m.walls },
  { label: "Footmen", get: (m) => m.units.footman },
  { label: "Archers", get: (m) => m.units.archer },
  { label: "Cavalry", get: (m) => m.units.cavalry },
  { label: "Siege", get: (m) => m.siege },
  { label: "Spying", get: (m) => m.spy },
  { label: "Scouting", get: (m) => m.scout },
];

function BonusValue({ value, goodWhenLow }: { value: number; goodWhenLow?: boolean }) {
  const pct = Math.round((value - 1) * 100);
  if (pct === 0) return <b className="bonus-zero">0%</b>;
  const good = goodWhenLow ? pct < 0 : pct > 0;
  return <b className={good ? "bonus-good" : "bonus-bad"}>{pct > 0 ? `+${pct}%` : `${pct}%`}</b>;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  const world = await getWorld();

  // Already on a throne? Straight back to it — /login is for newcomers.
  const sessionId = await currentPlayerId();
  if (sessionId && world.players[sessionId] && !world.players[sessionId].banned && !err) {
    redirect("/");
  }

  // Entering an existing empire without its token is a debug power, so it lives
  // in the Crown Chamber now. Point there only while the chamber is unlocked.
  const devDoor = devOpenAdmin();
  const contending = Object.keys(world.players).length;

  return (
    <main className="mst-page">
      <div className="mst-grain" aria-hidden />
      <div className="mst-ticks" aria-hidden>
        <span className="mst-crop tl" />
        <span className="mst-crop tr" />
        <span className="mst-crop bl" />
        <span className="mst-crop br" />
        <span className="mst-guide-v" />
        <span className="mst-guide-h" />
      </div>

      {/* Heraldic sigil watermark — crossed swords beneath a crown. */}
      <svg className="mst-sigil" viewBox="0 0 260 210" fill="none" aria-hidden>
        {/* crown */}
        <path
          d="M96 60 L104 30 L120 50 L130 22 L140 50 L156 30 L164 60 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M96 60 H164" stroke="currentColor" strokeWidth="3" />
        <circle cx="104" cy="30" r="4" fill="currentColor" />
        <circle cx="130" cy="22" r="4.5" fill="currentColor" />
        <circle cx="156" cy="30" r="4" fill="currentColor" />
        {/* crossed swords */}
        <path d="M70 196 L182 78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M190 196 L78 78" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M168 66 L196 94" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M92 66 L64 94" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        {/* crossguards */}
        <path d="M150 108 L178 136" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M110 108 L82 136" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>

      <div className="mst-hero">
        {err && (
          <div className="mst-flash">
            <Flash err={err} />
          </div>
        )}

        <div className="mst-dateline">
          <span>{world.meta.eraName}</span>
          <i />
          <span>
            Turn <b>{world.meta.tickNumber.toLocaleString()}</b>
          </span>
          <i />
          <span>
            <b>{contending}</b> banners raised
          </span>
        </div>

        <h1 className="mst-title">
          WAR<span className="amp">of</span>EMPIRES
        </h1>
        <p className="mst-tagline">Raise a banner at first light. Race for the throne.</p>

        {/* The founding: race muster + charter, one form. */}
        <form action={createEmpire} style={{ display: "contents" }}>
          <fieldset className="mst-muster" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="mst-charter-eyebrow" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Choose your people
            </legend>
            {CHAMPIONS.map(({ race, tone, boon }, i) => (
              <label
                key={race}
                className="mst-champ"
                style={{ ["--tone" as string]: tone }}
              >
                <input type="radio" name="race" value={race} defaultChecked={i === 0} />
                <span className="mst-standard">
                  <span className="mst-pole" />
                  <span className="mst-pennant" />
                </span>
                <span className="mst-roundel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/art/races/${race}.png`} alt={RACE_NAMES[race]} />
                </span>
                <span className="mst-plate">{RACE_NAMES[race]}</span>
                <span className="mst-boon">{boon}</span>
              </label>
            ))}
          </fieldset>

          {/* Gifts & burdens of the chosen people — swaps with the radio via :has(). */}
          <div className="mst-boons">
            {CHAMPIONS.map(({ race }) => (
              <div key={race} className="mst-boonlist" data-race={race}>
                <h3>Gifts &amp; burdens of the {RACE_NAMES[race]}</h3>
                {BONUS_ROWS.map(({ label, get, goodWhenLow }) => (
                  <span key={label} className="bonus-row">
                    <span>{label}</span>
                    <BonusValue value={get(RACES[race])} goodWhenLow={goodWhenLow} />
                  </span>
                ))}
                {race === "human" && (
                  <span className="bonus-row" style={{ gridColumn: "1 / -1", justifyContent: "center" }}>
                    <i>The generalists — plenty in every field, spies without equal.</i>
                  </span>
                )}
              </div>
            ))}
          </div>

          <section className="mst-charter">
            <svg className="mst-seal" viewBox="0 0 64 64" aria-hidden>
              <circle cx="32" cy="32" r="27" fill="#7c1f16" />
              <circle cx="32" cy="32" r="27" fill="none" stroke="#3f0d08" strokeWidth="1.5" />
              <circle cx="32" cy="32" r="21" fill="none" stroke="#a83a2c" strokeWidth="1.5" strokeDasharray="2 3" />
              {/* embossed crown */}
              <path
                d="M22 38 L24 26 L28 33 L32 24 L36 33 L40 26 L42 38 Z"
                fill="#9c3125"
                stroke="#4a0f09"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M22 41 H42" stroke="#4a0f09" strokeWidth="2" strokeLinecap="round" />
              {/* wax drip */}
              <path d="M30 58 q2 6 4 0" fill="#7c1f16" />
            </svg>
            <div className="mst-charter-eyebrow">Found your empire</div>
            <div className="mst-charter-body">
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <NameField />
                <button className="mst-raise" type="submit">
                  Raise the banner
                </button>
              </div>
              <p className="mst-fineprint">
                No account, no email — the throne is yours the moment you click. You begin with
                5,000 gold, 1,000 of each resource, 100 souls, and a 72-hour shield.
              </p>
            </div>
          </section>
        </form>
      </div>

      <section className="mst-return">
        <h2>Already hold a throne?</h2>
        <form action={enterWithToken} className="mst-token">
          <input
            name="token"
            placeholder="woe_… realm token"
            aria-label="Realm token"
          />
          <button className="mst-throne-chip" type="submit">
            Enter
          </button>
        </form>
        <p style={{ marginTop: 7, fontSize: 13, color: "#7a5a2e" }}>
          Your realm token appears in the Command View (and via <code>woe token</code> in the
          terminal client) — the same empire in browser and CLI.
        </p>

        {devDoor && (
          <div className="mst-devlist">
            <div className="mst-devlist-head">⚙ Dev — the chamber is unlocked</div>
            <p style={{ fontSize: 13 }}>
              Enter any existing empire from the{" "}
              <a href="/admin">Crown Chamber&apos;s Ledger of Souls →</a>
            </p>
          </div>
        )}

        <p className="mst-colophon">
          One turn every ten minutes · settlers arrive at dawn · the ladder is the world.
          {" · "}
          <a href="/spectate">🔭 Watch the realm live →</a>
        </p>
      </section>
    </main>
  );
}
