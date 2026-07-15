import { redirect } from "next/navigation";
import { Panel } from "@/components/Panel";
import { Flash } from "@/components/Flash";
import { NameField } from "@/components/NameField";
import { RACES, RACE_NAMES } from "@/lib/constants";
import type { Race } from "@/lib/constants/races";
import { createEmpire, enterEmpire, enterWithToken } from "@/app/actions";
import { currentPlayerId } from "@/lib/server/auth";
import { getWorld } from "@/lib/server/world";

const RACE_BLURB: Record<Race, string> = {
  human: "Okay at everything",
  elf: "Archers & wood",
  orc: "The cavalry horde",
  troll: "Stone & siege",
  dwarf: "The iron wall",
  gnoll: "Jackal spymasters",
};

export const dynamic = "force-dynamic";

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

  const devList = !process.env.CRON_SECRET; // open empire list is a dev convenience only
  const humans = devList ? Object.values(world.players).filter((p) => !p.isBot) : [];

  return (
    <div className="frame" style={{ maxWidth: 720, flexDirection: "column" }}>
      <div style={{ textAlign: "center", margin: "18px 0 6px" }}>
        <div style={{ font: "bold 34px Georgia", color: "var(--heading)", letterSpacing: 2 }}>
          ⚔ WAR OF EMPIRES ⚔
        </div>
        <div style={{ font: "italic 14px Georgia", color: "var(--ink-soft)" }}>
          {world.meta.eraName} — turn {world.meta.tickNumber.toLocaleString()}
        </div>
      </div>
      <Flash err={err} />
      <Panel title="Found a New Empire — pick a race, pick a name, play">
        <form action={createEmpire}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
            {(Object.keys(RACES) as Race[]).map((r, i) => (
              <label
                key={r}
                style={{
                  border: "2px solid var(--border)",
                  background: "var(--panel-alt)",
                  padding: "6px 10px",
                  textAlign: "center",
                  cursor: "pointer",
                  width: 96,
                }}
              >
                <input type="radio" name="race" value={r} defaultChecked={i === 0} />
                <div>
                  <img
                    src={`/art/races/${r}.png`}
                    width={76}
                    height={76}
                    alt={RACE_NAMES[r]}
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
                <b style={{ fontSize: 12.5 }}>{RACE_NAMES[r]}</b>
                <div style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>{RACE_BLURB[r]}</div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <NameField />
            <button className="btn">Raise the banner</button>
          </div>
        </form>
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--ink-soft)", textAlign: "center" }}>
          No account, no email — the empire is yours the moment you click. You begin with 5,000
          gold, 1,000 of each resource, 100 souls (20 of them footmen), and a 72-hour shield.
        </p>
      </Panel>

      <Panel title="Return to the Throne">
        <form action={enterWithToken} style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <input
            name="token"
            placeholder="woe_… realm token"
            aria-label="Realm token"
            size={30}
            style={{ padding: "4px 8px", border: "1px solid var(--border)", background: "var(--input-bg)", font: "13.5px monospace" }}
          />
          <button className="btn">Enter</button>
        </form>
        <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-soft)", textAlign: "center" }}>
          Your realm token is shown in the Command View (and by <code>woe token</code> in the
          terminal client). Same empire everywhere — browser and CLI.
        </p>
        {humans.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px dashed var(--border-light)", paddingTop: 6, textAlign: "center" }}>
            {humans.map((p) => (
              <form key={p.id} action={enterEmpire} style={{ display: "inline-block", margin: 4 }}>
                <input type="hidden" name="playerId" value={p.id} />
                <button className="btn">{p.name} ({RACE_NAMES[p.race]})</button>
              </form>
            ))}
            <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--ink-soft)" }}>
              ⚙ Dev only — this open list disappears in production (CRON_SECRET set).
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
