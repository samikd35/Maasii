import type { NextRequest } from "next/server";
import { getVenueLink, MaasiiError, staffActor } from "@/core";
import { signedInUserId, siteUrl } from "@/lib/session";

/** The Venue Link's QR image as a PNG. With `?download=1` the browser saves it as a file. */
export async function GET(request: NextRequest, ctx: RouteContext<"/manage/venues/[venueId]/qr">) {
  const userId = await signedInUserId();
  if (!userId) return new Response("Sign in first.", { status: 401 });

  try {
    const { venueId } = await ctx.params;
    const link = await getVenueLink(staffActor(userId), { venueId, siteUrl: await siteUrl() });
    const headers: Record<string, string> = { "content-type": "image/png", "cache-control": "private, no-store" };
    if (request.nextUrl.searchParams.has("download")) {
      headers["content-disposition"] = `attachment; filename="${link.qrFileName}"`;
    }
    return new Response(Buffer.from(link.qrPng), { headers });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response("Not found.", { status: 404 });
    throw error;
  }
}
