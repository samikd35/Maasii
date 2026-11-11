import { NextResponse, type NextRequest } from "next/server";
import { AREA_HEADER, areaOf } from "@/i18n/config";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(AREA_HEADER, areaOf(request.nextUrl.pathname));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|brands/|favicon.ico).*)"],
};
