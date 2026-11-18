import { getLiveFloor, MaasiiError } from "@/core";
import { getSessionActor } from "@/lib/session";

export async function GET(_request: Request, { params }: RouteContext<"/manage/venues/[venueId]/floor/live">) {
  const actor = await getSessionActor();
  if (!actor) return new Response(null, { status: 403 });
  try {
    return Response.json(await getLiveFloor(actor, await params), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response(null, { status: 403 });
    throw error;
  }
}
