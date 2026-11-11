import type { NextConfig } from "next";

// cacheComponents stays off: every Maasii page is per-request (menus change on publish,
// sessions and live data later), and next-intl only supports it with a [locale] segment.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
