import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the staff session cookie. This is the only place a session is refreshed: refreshing in
// two places can trip refresh-token reuse detection, which looks like random sign-outs.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  await supabase.auth.getClaims();
  return response;
}

// Guests browsing a Venue Link have no session, so the guest menu skips this round trip.
export const config = {
  matcher: ["/manage/:path*", "/admin/:path*", "/sign-in", "/invite/:path*"],
};
