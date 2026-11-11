import { acceptOrder, addWaiterOrder, correctWaiterOrderLine, declineOrder, getMyTableOrders, MaasiiError, undoOrderDecision } from "@/core";
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
    const target = { orderId: body?.orderId, unlockToken: await waiterUnlockToken() };
    let order;
    switch (body?.action) {
      case "accept":
        order = await acceptOrder(actor, { ...target, soldOutLineIndices: body.soldOutLineIndices });
        break;
      case "decline":
        order = await declineOrder(actor, target);
        break;
      case "undo":
        order = await undoOrderDecision(actor, { ...target, decisionId: body.decisionId });
        break;
      case "quickAdd":
        order = await addWaiterOrder(actor, { tableId: body.tableId, requestId: body.requestId, lines: body.lines, unlockToken: target.unlockToken });
        break;
      case "correct":
        await correctWaiterOrderLine(actor, { ...target, lineIndex: body.lineIndex, quantity: body.quantity, reason: body.reason });
        return new Response(null, { status: 204 });
      default:
        return new Response(null, { status: 400 });
    }
    return Response.json(order, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) {
      return Response.json({ reason: error.reason ?? error.code }, { status: error.code === "not_allowed" ? 403 : 409 });
    }
    throw error;
  }
}
