import { changeGuestTable, getGuestPendingOrders, getGuestReviewForm, getGuestVisit, getOrderService, MaasiiError, publicActor, sendOrder } from "@/core";
import { guestSession } from "@/lib/supabase/guest-session";

export async function GET(_request: Request, { params }: RouteContext<"/v/[token]/orders">) {
  const { token: venueLinkToken } = await params;
  try {
    const service = await getOrderService(publicActor, { venueLinkToken });
    const { supabase, actor, expiresAt } = await guestSession();
    if (!actor) return Response.json({ ...service, orders: [], visit: null, live: null }, { headers: { "Cache-Control": "private, no-store" } });

    const [currentVisit, pending, { data }] = await Promise.all([
      getGuestVisit(actor, { venueLinkToken }),
      getGuestPendingOrders(actor, { venueLinkToken }),
      supabase.auth.getSession(),
    ]);
    const live = data.session ? {
      topic: `guest-orders:${actor.userId}`,
      accessToken: data.session.access_token,
      expiresAt,
    } : null;
    const { orders, ...visit } = currentVisit ?? { orders: [] };
    const review = currentVisit?.closedAt && currentVisit.bill ? await getGuestReviewForm(actor, { venueLinkToken }) : null;
    return Response.json({ ...service, orders: [...orders, ...pending], visit: currentVisit ? visit : null, review, live }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response(null, { status: 404 });
    throw error;
  }
}

// Complete the anonymous sign-in first. A lost acknowledgement after Send can then be retried
// with both the same Auth cookie and the same request ID.
export async function PUT() {
  const { supabase, actor } = await guestSession();
  if (!actor) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return new Response(null, { status: error.status === 429 ? 429 : 503 });
  }
  return new Response(null, { status: 204 });
}

export async function POST(request: Request, { params }: RouteContext<"/v/[token]/orders">) {
  const { actor } = await guestSession();
  if (!actor) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  const { token: venueLinkToken } = await params;
  try {
    const order = await sendOrder(actor, { ...body, venueLinkToken });
    return Response.json(order, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MaasiiError) return Response.json({ reason: error.reason }, { status: 409 });
    throw error;
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/v/[token]/orders">) {
  const { actor } = await guestSession();
  if (!actor) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  const { token: venueLinkToken } = await params;
  try {
    await changeGuestTable(actor, { venueLinkToken, tableId: body?.tableId });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MaasiiError) return Response.json({ reason: error.reason }, { status: 409 });
    throw error;
  }
}
