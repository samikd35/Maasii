import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AREA_HEADER, areaOf } from "@/i18n/config";
import { secureCookies } from "@/lib/secure-cookies";

export async function proxy(request: NextRequest) {
  const area = areaOf(request.nextUrl.pathname);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const reportUrl = process.env.MAASII_CSP_REPORT_URL;
  // Scope the policy to executable content; Brand themes use inline style attributes,
  // and Menu photos and Supabase connections may be hosted on another origin.
  const csp = `script-src 'nonce-${nonce}' 'strict-dynamic' 'report-sample'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'${reportUrl ? "; report-to csp" : ""}`;
  const forwardRequest = () => {
    const headers = new Headers(request.headers);
    headers.set(AREA_HEADER, area);
    // Next reads the request policy and nonces its own streaming and bootstrap scripts.
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    if (reportUrl) response.headers.set("Reporting-Endpoints", `csp="${reportUrl}"`);
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    if (secureCookies(request.headers)) response.headers.set("Strict-Transport-Security", "max-age=300");
    return response;
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
        sameSite: "lax",
        secure: secureCookies(request.headers),
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
