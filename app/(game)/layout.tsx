import { AdvisorAlerts } from "@/components/AdvisorAlerts";
import { MobileNav } from "@/components/MobileNav";
import { ResourceBar } from "@/components/ResourceBar";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { TourGuide } from "@/components/TourGuide";
import { isOnboardingActive } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { devAdvance } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { world, player } = await getGame();
  const devTools = !process.env.CRON_SECRET;

  return (
    <>
      <ResourceBar player={player} meta={world.meta} />
      <TopNav premium={!!player.premium} />
      <MobileNav premium={!!player.premium} />
      <AdvisorAlerts player={player} />
      {world.meta.winner && (
        <div className="alert alert-win" role="status">
          <span className="alert-icon">👑</span>
          <div>
            <div className="alert-title">The era is won by {world.meta.winner.name}!</div>
            <div className="alert-body">
              The final ladder is frozen and archived. The next era will bear their name — and opens
              with a 5-day peace while everyone rebuilds.
            </div>
          </div>
        </div>
      )}
      <div className="frame">
        <div className="nav-col">
          <SideNav />
          {devTools && (
            <div className="dev-clock">
              <div className="dev-clock-head">⚙ DEV CLOCK</div>
              <form action={devAdvance} style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <button className="btn" name="ticks" value="1" title="Advance one 10-minute turn">
                  +1 turn
                </button>
                <button className="btn" name="ticks" value="144" title="Advance a full day">
                  +1 day
                </button>
              </form>
              <div className="dev-clock-note">
                Testing only — in production the world ticks itself every 10 minutes and these
                controls disappear.
              </div>
            </div>
          )}
        </div>
        <main className="content">{children}</main>
      </div>
      <div className="footer">
        One turn every 10 minutes · settlers arrive at dawn · the ladder is the world
      </div>
      <TourGuide active={isOnboardingActive(player) && !player.onboarding?.toured} />
    </>
  );
}
