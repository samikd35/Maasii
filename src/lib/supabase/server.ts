import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

/**
 * Supabase client bound to this request's session cookies, for signing staff in and out and reading
 * who is signed in. Create one per request. Data reads and writes go through the Maasii core.
 */
export async function createSessionClient({ guest = false } = {}) {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: {
      ...(guest && { name: "mx_guest_session", path: "/v" }),
      httpOnly: true,
      secure: (await headers()).get("x-forwarded-proto") === "https",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes the session.
        }
      },
    },
  });
}
