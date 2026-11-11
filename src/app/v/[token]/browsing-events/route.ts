import { publicActor, recordBrowsingEvent } from "@/core";

export async function POST(request: Request, { params }: RouteContext<"/v/[token]/browsing-events">) {
  if (request.headers.get("content-type") === "application/json") {
    try {
      const { token } = await params;
      await recordBrowsingEvent(publicActor, { venueLinkToken: token, event: await request.json() });
    } catch {
      // Browsing events are best effort.
    }
  }
  return new Response(null, { status: 204 });
}
