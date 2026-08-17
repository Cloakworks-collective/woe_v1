import { AdvisorAlerts } from "@/components/AdvisorAlerts";
import { EventToasts, type ToastItem } from "@/components/EventToasts";
import { FlashProvider } from "@/components/FlashProvider";
import { HashScroll } from "@/components/HashScroll";
import { MobileNav } from "@/components/MobileNav";
import { PopupLayer } from "@/components/PopupLayer";
import { ResourceBar, TopBar } from "@/components/ResourceBar";
import { SideNav } from "@/components/SideNav";
import { TopNav } from "@/components/TopNav";
import { TipNudge } from "@/components/TipNudge";
import { TourGuide } from "@/components/TourGuide";
import { eventLine, eventTone } from "@/components/eventLine";
import { chargeStatuses, examSealed, isOnboardingActive } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { impersonatedPlayerId } from "@/lib/server/admin";
import { adminReturnToSelf } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

const GLYPH_TONES = new Set(["war", "shadow", "danger", "growth", "trade", "clan", "info"]);

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const { world, player } = await getGame();
  // Wearing someone else's crown must never be a quiet state: from here every
  // button spends THEIR gold and marches THEIR army (see currentPlayerId).
  const worn = await impersonatedPlayerId();

  // D14 — the six most recent tidings, ready to toast the ones the reader
  // hasn't seen yet (the client decides which, from its last-seen tick).
  const toasts: ToastItem[] = (world.inbox[player.id] ?? []).slice(0, 6).map((it) => {
    const tone = eventTone(it.event);
    return { tick: it.tick, tone, glyph: GLYPH_TONES.has(tone) ? `/art/tones/${tone}.png` : null, line: eventLine(it.event) };
  });

  return (
    <FlashProvider>
      {/* Deep links from the advisors land ON their control — see HashScroll. */}
      <HashScroll />
      {/* One open popover at a time, and click-outside to dismiss — for every
          <details> popover in the app, not just the nav's own. */}
      <PopupLayer />
      {worn === player.id && (
        <div className="worn-crown" role="status">
          <span>
            👑 Crown console — you are acting as <b>{player.name}</b>
            {player.isBot ? " (a bot)" : ""}. Every command here is theirs.
          </span>
          <form action={adminReturnToSelf}>
            <button className="btn btn-no" type="submit">Return to your own throne</button>
          </form>
        </div>
      )}
      {/* TWO bars, not three. The realm's name, where you can go, and who you
          are all belong to the same question, so they share one row; below 860px
          .topnav hides and the burger takes its place inline. The holdings row
          sits underneath, closest to the page it describes. */}
      <TopBar player={player} meta={world.meta}>
        <TopNav premium={!!player.premium} exam={!examSealed(player)} />
        <MobileNav premium={!!player.premium} />
      </TopBar>
      <ResourceBar player={player} meta={world.meta} />
      <EventToasts playerId={player.id} items={toasts} />
      <AdvisorAlerts player={player} />
      {world.meta.winner && (
        <div className="alert alert-win" role="status">
          <span className="alert-icon">👑</span>
          <div>
            <div className="alert-title">The era is won by {world.meta.winner.name}!</div>
            <div className="alert-body">
              The world has stopped: no attacks, no building, no trade, and no turns are passing.
              The final ladder stands exactly as it was won. The next era will bear their name — and
              opens with a 5-day peace while everyone rebuilds.
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
      {/* The tour ends by handing the regent their first order, so it needs to
          know which one is next — resolved here, where the player already is,
          rather than fetched by the client. */}
      {/* Mounted CONDITIONALLY, not merely inactive: an unrendered client
          component's chunk is never fetched, so the tour's script rides only
          with the brand-new players it exists for instead of with every page
          of every veteran's session. */}
      {isOnboardingActive(player) && !player.onboarding?.toured && (
        <TourGuide
          active
          nextCharge={(() => {
            const next = chargeStatuses(player).find((c) => !c.complete);
            return next ? { title: next.title, href: next.href, cta: next.cta } : undefined;
          })()}
        />
      )}
    </FlashProvider>
  );
}
