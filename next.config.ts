import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Pixel art changes when the art PIPELINE runs, not when players play.
        // A day of browser cache plus a week of serve-stale keeps the ~500
        // sprites off the wire on every navigation, while still letting a
        // regenerated sprite (same filename, new pixels) appear within a day.
        // Deliberately NOT immutable for that reason.
        source: "/art/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
  experimental: {
    // Client router cache: reuse a visited page's payload for 30s on
    // back/forward and repeat navs instead of refetching the dynamic RSC.
    // The world only changes on the 10-minute tick, so brief staleness is fine.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
