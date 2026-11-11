import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the publishable key and no stored session, for checking a password on the
 * server. Screens that keep a session use the cookie-based client in `server.ts` instead.
 */
export function createPublicAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase URL or publishable key missing. Run `pnpm db:env` to write .env.local.");
  }
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
