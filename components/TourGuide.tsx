"use client";

// The steward's spotlight — a one-time guided orientation for a new regent.
// Auto-runs once on the first visit, walking the realm across several screens:
// it navigates to each hall, cuts a lit hole (with a brass ring) over the thing
// worth seeing, dims the rest, and clamps its counsel fully on-screen. It ends
// at the Field Manual. Purely additive: every page is server-rendered and fully
// usable, so if the tour never runs, nothing is lost. Lives in the game layout
// so its progress survives the page-to-page navigation.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { finishTour } from "@/app/actions";

type Step = { path: string; sel: string | null; title: string; text: string };

const STEPS: Step[] = [
  {
    path: "/",
    sel: null,
    title: "Welcome, Regent",
    text: "This is your seat of power. You rule under a 72-hour shield — no rival may strike while it holds. Let your steward walk you through the realm.",
  },
  {
    path: "/",
    sel: ".vt",
    title: "The Race to the Throne",
    text: "Hold the first rank in the land long enough and the age is named for you, forever. Watch the balance of power turn here.",
  },
  {
    path: "/",
    sel: ".res-group .res:last-child",
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
    sel: "#regent-charges",
    title: "Your First Charges",
    text: "Your council's step-by-step course: build this, assign that, then study the next. Follow them in order and the empire builds itself.",
  },
  {
    path: "/",
    sel: ".nav",
    title: "The halls of the realm",
    text: "Every chamber lives here — buildings, workers, research and market above; your army, siege, war room and spies below. Let us walk a few.",
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
    text: "Assign idle peasants to a trade — or recall them with a click. Below, muster peasants into warriors, spies, and scouts.",
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
    text: "Buy what you lack and sell your surplus. Prices swing with the war economy — a shrewd merchant funds an army.",
  },
  {
    path: "/rankings",
    sel: ".tbl",
    title: "The war council",
    text: "The whole world is here. Open ⚔ Act on any empire to raid, siege, revenge, bombard, spy, or scout — no separate war room. Fight rivals near your own rank for the best spoils.",
  },
  {
    path: "/guide",
    sel: ".guide-toc",
    title: "The Field Manual",
    text: "This is the whole game in a few minutes — growth, battle, defence, and how the era is won. Read it now, and return anytime from the top menu. Good hunting, Regent.",
  },
];

const GAP = 12;
const M = 14;
const RING_PAD = 8;

type Box = { top: number; left: number; width: number; height: number } | null;

export function TourGuide({ active }: { active: boolean }) {
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
      } else if (tries++ < 30) {
        window.setTimeout(locate, 110);
      }
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
            Skip the tour
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button type="button" className="tour-btn" onClick={() => setI((n) => n - 1)}>
                Back
              </button>
            )}
            {last ? (
              <button type="button" className="tour-btn tour-btn-primary" onClick={end}>
                Ride forth
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
