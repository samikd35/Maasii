import { acceptOrder, getMyTableOrders, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function GET() {
  const actor = await getSessionActor();
  if (!actor) return new Response(null, { status: 403 });
  try {
    const { topic, ...feed } = await getMyTableOrders(actor, { unlockToken: await waiterUnlockToken() });
    const { data } = await (await createSessionClient()).auth.getSession();
    const live = data.session ? { topic, accessToken: data.session.access_token, expiresAt: data.session.expires_at ?? 0 } : null;
    return Response.json({ ...feed, live }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response(null, { status: 403 });
    throw error;
  }
}

export async function POST(request: Request) {
  const actor = await getSessionActor();
  if (!actor) return new Response(null, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const order = await acceptOrder(actor, { orderId: body?.orderId, unlockToken: await waiterUnlockToken() });
    return Response.json(order, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) {
      return new Response(null, { status: error.code === "not_allowed" ? 403 : 409 });
    }
    throw error;
  }
}
