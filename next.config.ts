import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
