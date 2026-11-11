import { createClient } from "@supabase/supabase-js";

/** Signs in through Supabase Auth the way the sign-in screen does, and returns the user id. */
export async function signInWithPassword(
  credentials: { email: string; password: string } | { phone: string; password: string },
): Promise<string> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw error;
  return data.user.id;
}
