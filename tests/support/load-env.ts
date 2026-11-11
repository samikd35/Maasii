import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));

if (!existsSync(envFile)) {
  throw new Error(
    "No .env.local found. Start this worktree's Supabase stack with `pnpm db:start` (it writes .env.local).",
  );
}
process.loadEnvFile(envFile);
