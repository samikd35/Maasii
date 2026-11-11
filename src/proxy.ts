import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AREA_HEADER, areaOf } from "@/i18n/config";

export async function proxy(request: NextRequest) {
  const area = areaOf(request.nextUrl.pathname);
  const forwardRequest = () => {
    const headers = new Headers(request.headers);
    headers.set(AREA_HEADER, area);
    return NextResponse.next({ request: { headers } });
  };

  let response = forwardRequest();
  if (area === "guest") return response;

  // Refresh the staff session here so Server Components receive the updated cookies.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forwardRequest();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/|brands/|favicon.ico).*)"],
};
