import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret key, for Auth administration only (creating users and,
 * later, invitations and bans). Never use it to read data on behalf of a guest or staff member.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("Supabase URL or secret key missing. Run `pnpm db:env` to write .env.local.");
  }
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
