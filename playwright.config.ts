import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { generateVAPIDKeys } from "web-push";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.MAASII_VAPID_PUBLIC_KEY && !process.env.MAASII_VAPID_PRIVATE_KEY) {
  const { publicKey, privateKey } = generateVAPIDKeys();
  process.env.MAASII_VAPID_PUBLIC_KEY = publicKey;
  process.env.MAASII_VAPID_PRIVATE_KEY = privateKey;
  process.env.MAASII_VAPID_SUBJECT ??= "mailto:maasii-test@example.invalid";
}

// Each worktree gets its own stable port (4000-4999) so parallel worktrees never share a server.
const defaultPort = 4000 + (parseInt(createHash("sha1").update(process.cwd()).digest("hex").slice(0, 6), 16) % 1000);
const port = Number(process.env.E2E_PORT ?? defaultPort);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    locale: "en-US",
    timezoneId: "Africa/Addis_Ababa",
  },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
    { name: "webkit", testMatch: ["web-reliability.spec.ts", "guest-homepage.spec.ts"], use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // A production build: the page-weight budget only means something with compression and no dev overlay.
    command: `pnpm build && node --import ./e2e/support/server-clock.mjs node_modules/next/dist/bin/next start -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 240_000,
  },
});
