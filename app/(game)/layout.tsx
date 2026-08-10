import { AdvisorAlerts } from "@/components/AdvisorAlerts";
import { EventToasts, type ToastItem } from "@/components/EventToasts";
import { FlashProvider } from "@/components/FlashProvider";
import { MobileNav } from "@/components/MobileNav";
import { ResourceBar } from "@/components/ResourceBar";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { TipNudge } from "@/components/TipNudge";
import { TourGuide } from "@/components/TourGuide";
import { eventLine, eventTone } from "@/components/eventLine";
import { isOnboardingActive } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const GLYPH_TONES = new Set(["war", "shadow", "danger", "growth", "trade", "clan", "info"]);

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { world, player } = await getGame();

  // D14 — the six most recent tidings, ready to toast the ones the reader
  // hasn't seen yet (the client decides which, from its last-seen tick).
  const toasts: ToastItem[] = (world.inbox[player.id] ?? []).slice(0, 6).map((it) => {
    const tone = eventTone(it.event);
    return { tick: it.tick, tone, glyph: GLYPH_TONES.has(tone) ? `/art/tones/${tone}.png` : null, line: eventLine(it.event) };
  });

  return (
    <FlashProvider>
      <ResourceBar player={player} meta={world.meta} />
      <EventToasts playerId={player.id} items={toasts} />
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
        </div>
        <main className="content">{children}</main>
      </div>
      <div className="footer">
        One turn every 10 minutes · settlers arrive at dawn · the ladder is the world
      </div>
      <TipNudge />
      <TourGuide active={isOnboardingActive(player) && !player.onboarding?.toured} />
    </FlashProvider>
  );
}
