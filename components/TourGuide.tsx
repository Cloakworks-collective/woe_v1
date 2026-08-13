"use client";

// The steward's spotlight — a one-time guided orientation for a new regent.
// Auto-runs once on the first visit, walking the realm across several screens:
// it navigates to each hall, cuts a lit hole (with a brass ring) over the thing
// worth seeing, dims the rest, and clamps its counsel fully on-screen.
//
// It ENDS ON THE FIRST CHARGES, and hands the regent straight into the first
// one. A tour that ends on the Field Manual ends by asking someone to go and
// read; the charges are the thing that actually gets an empire built, and the
// last click of the tour should be the first move of the game.
//
// Purely additive: every page is server-rendered and fully usable, so if the
// tour never runs, nothing is lost. Lives in the game layout so its progress
// survives the page-to-page navigation.
//
// Selectors are the fragile part — they name DOM that other work moves. A step
// whose target has vanished now SKIPS ITSELF rather than showing a dimmed page
// with no spotlight, which is how `.res-group .res:last-child` sat dead for
// weeks without anyone noticing. In dev it also complains to the console.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { finishTour } from "@/app/actions";
import { EXAM_LENGTH, EXAM_PASS_MARK, EXAM_REWARD } from "@/lib/constants";

type Step = { path: string; sel: string | null; title: string; text: string };

const STEPS: Step[] = [
  {
    path: "/",
    sel: null,
    title: "Welcome, Regent",
    text: "This is your seat of power. You rule under a 72-hour shield — no rival may strike while it holds. Let your steward walk you through the realm; it takes a minute, and ends with your first orders.",
  },
  {
    path: "/",
    sel: ".vt",
    title: "The Race to the Throne",
    text: "Hold the first rank in the land long enough and the age is named for you, forever. Watch the balance of power turn here.",
  },
  {
    path: "/",
    // Was `.res-group .res:last-child`, which matched nothing — the bar grew a
    // trailing chip and the spotlight quietly went dark. Addressed by what the
    // element IS, not where it sits.
    sel: '.res[data-res="turns"]',
    title: "Turns — the sand in the glass",
    text: "Marching and striking spend action turns; they refill as the game ticks. A patient regent is never left disarmed.",
  },
  {
    path: "/",
    sel: ".res-group",
    title: "Your coffers",
    text: "Gold, food, wood, stone, and ore. Food is life above all — let it reach zero and the whole realm freezes until it eats.",
  },
  {
    path: "/",
    sel: ".census",
    title: "Your people",
    text: "Every soul, counted: idle peasants, the workers at their trades, and the host under arms. Idle hands produce nothing — put them to work.",
  },
  {
    path: "/",
    sel: ".nav",
    title: "The halls of the realm",
    text: "Every chamber lives here. Take Action strikes at another empire; The Realm is your economy; Your Forces is what you raise at home. Let us walk a few.",
  },
  {
    path: "/buildings",
    sel: ".tabs",
    title: "The Buildings hall",
    text: "Raise and upgrade every building here — producers and storehouses under Civilian, barracks and walls under Military. Buildings open the jobs your people fill.",
  },
  {
    path: "/train",
    sel: ".card-grid",
    title: "The Assignment Hall",
    text: "Assign idle peasants to a trade — or recall them with a click. Below, muster spies and scouts; footmen, archers, and cavalry are raised in The Army.",
  },
  {
    path: "/research",
    sel: ".rtree",
    title: "The Collegium",
    text: "Your scholars master one field at a time. Choose an identity — the economist, the warlord, or the spymaster. Crop Rotation is a fine first study.",
  },
  {
    path: "/market",
    sel: ".tbl",
    title: "The Grand Bazaar",
    text: "Buy what you lack and sell your surplus. Coin is plentiful in this age and goods are not, so the Bazaar is where most of your building materials will come from.",
  },
  {
    path: "/rankings",
    sel: ".tbl",
    title: "The ladder — every empire in the age",
    text: "The whole world is here. Attack, Spy and Scout each have their own button on every row, and the sidebar's Take Action opens this same ladder at your own rank. Fight rivals near your own weight for the best spoils.",
  },
  {
    // Placed second-to-last on purpose. It is worth arriving at having seen
    // the realm, but it must not be the finale — the tour has to END on the
    // step that hands the regent something to actually do.
    path: "/",
    sel: null,
    title: "One more thing — the Collegium pays",
    text: `Under Guides above sits The Examination: ${EXAM_LENGTH} questions on how the realm actually works. Every answer is explained the moment you give it, so a wrong one teaches you as much as a right one — and reaching ${EXAM_PASS_MARK} of ${EXAM_LENGTH} endows your treasury with ${EXAM_REWARD.gold.toLocaleString("en-US")} gold and ${EXAM_REWARD.resources.toLocaleString("en-US")} of every resource. Miss the mark and you may sit it again as often as you like. It is offered once an age.`,
  },
  {
    // The finale, and the only step with something to DO. Back at the seat of
    // power, on the checklist that turns a village into an empire.
    path: "/",
    sel: "#regent-charges",
    title: "Your First Charges",
    text: "Your council's step-by-step course: build this, assign that, then study the next. Each one is sealed the moment it's met and pays a gift to your treasury. Follow them in order and the empire builds itself.",
  },
];

const GAP = 12;
const M = 14;
const RING_PAD = 8;

type Box = { top: number; left: number; width: number; height: number } | null;

export function TourGuide({
  active,
  nextCharge,
}: {
  active: boolean;
  /** The first unsealed charge, so the last click of the tour is the first move
   *  of the game rather than "close this and work out what to do". */
  nextCharge?: { title: string; href: string; cta: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box>(null);
  const [tip, setTip] = useState({ w: 360, h: 190 });
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const measure = useCallback(() => {
    const sel = STEPS[i].sel;
    const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [i]);

  useEffect(() => {
    if (!active || hidden || !mounted) return;
    const step = STEPS[i];

    // Walk to this step's hall first, if we aren't already there.
    if (pathname !== step.path) {
      setBox(null);
      router.push(step.path);
      return; // re-runs when pathname updates
    }
    if (!step.sel) {
      setBox(null);
      return;
    }

    // The target may not be painted yet (fresh navigation) — poll for it.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let tries = 0;
    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector(step.sel!) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        window.setTimeout(() => !cancelled && measure(), 260);
        return;
      }
      if (tries++ < 30) {
        window.setTimeout(locate, 110);
        return;
      }
      // Gone for good. Skipping beats showing a dimmed page with no spotlight
      // and counsel about something the regent cannot see — and it cannot loop,
      // because the step index only ever moves forward.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[tour] step ${i + 1} target not found: ${step.sel} on ${step.path}`);
      }
      if (i < STEPS.length - 1) setI((n) => n + 1);
    };
    locate();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, hidden, mounted, i, pathname, measure, router]);

  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip((t) => (Math.abs(t.w - r.width) > 1 || Math.abs(t.h - r.height) > 1 ? { w: r.width, h: r.height } : t));
  });

  if (!active || hidden || !mounted) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const end = () => {
    setHidden(true);
    void finishTour();
  };
  /** Finish, then walk them into the first charge. */
  const begin = () => {
    end();
    if (nextCharge) router.push(nextCharge.href);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top: number;
  let left: number;
  if (box) {
    const below = box.top + box.height + GAP;
    const above = box.top - GAP - tip.h;
    top = below + tip.h <= vh - M ? below : above >= M ? above : vh - tip.h - M;
    top = Math.max(M, Math.min(top, vh - tip.h - M));
    left = Math.max(M, Math.min(box.left + box.width / 2 - tip.w / 2, vw - tip.w - M));
  } else {
    top = Math.max(M, (vh - tip.h) / 2);
    left = Math.max(M, (vw - tip.w) / 2);
  }

  return (
    <div className="tour" role="dialog" aria-label="Guided tour of the realm">
      {box ? (
        <>
          <div className="tour-block" />
          <div
            className="tour-ring"
            style={{ top: box.top - RING_PAD, left: box.left - RING_PAD, width: box.width + RING_PAD * 2, height: box.height + RING_PAD * 2 }}
          />
        </>
      ) : (
        <div className="tour-scrim" />
      )}

      <div className="tour-tip" ref={tipRef} style={{ top, left }}>
        <div className="tour-step">
          <span className="tour-crest" aria-hidden>⚜</span> Step {i + 1} of {STEPS.length}
        </div>
        <div className="tour-title">{step.title}</div>
        <p className="tour-text">{step.text}</p>
        <div className="tour-controls">
          <button type="button" className="tour-skip" onClick={end}>
            {last ? "I'll find my own way" : "Skip the tour"}
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button type="button" className="tour-btn" onClick={() => setI((n) => n - 1)}>
                Back
              </button>
            )}
            {last ? (
              // The one button in the tour that does something. Named for the
              // actual charge, so it reads as an order rather than a dismissal.
              <button type="button" className="tour-btn tour-btn-primary" onClick={begin}>
                {nextCharge ? `Begin: ${nextCharge.title} →` : "Ride forth"}
              </button>
            ) : (
              <button type="button" className="tour-btn tour-btn-primary" onClick={() => setI((n) => n + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
