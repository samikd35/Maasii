import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// cacheComponents stays off: every Maasii page is per-request (menus change on publish,
// sessions and live data later), and next-intl only supports it with a [locale] segment.
const nextConfig: NextConfig = {
  // Two 4 MiB branding images plus multipart headers.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Compile ICU messages at build time so the guest's phone does not download the parser.
export default createNextIntlPlugin({
  experimental: { messages: { path: "./messages", format: "json", locales: "infer", precompile: true } },
})(nextConfig);
