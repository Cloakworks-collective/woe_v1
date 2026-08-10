"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Make deep links actually land.
 *
 * The advisors send you to one exact control — `/buildings#b-hearthstead`,
 * `/train#w-farmers`. The browser handles that on a full page load, but these
 * are <Link>s, and on a client navigation the App Router restores scroll before
 * the target exists: the page renders on the server, arrives a frame later, and
 * by then nobody is looking for the anchor any more. The link "worked" and you
 * were at the top of the page.
 *
 * So: after every navigation, if the URL carries a hash, find it and scroll —
 * retrying for a few frames because the target may still be streaming in.
 */
export function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    let frames = 0;
    let raf = 0;
    const look = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      // ~1s of frames. If it never appears the link was stale; do nothing
      // rather than jump the reader somewhere arbitrary.
      if (frames++ < 60) raf = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
