import { MaasiiError, submitGuestReview } from "@/core";
import { guestSession } from "@/lib/supabase/guest-session";

export async function POST(request: Request, { params }: RouteContext<"/v/[token]/reviews">) {
  const { actor } = await guestSession();
  if (!actor) return new Response(null, { status: 401 });
  const { token: venueLinkToken } = await params;
  try {
    const body = await request.json().catch(() => null);
    await submitGuestReview(actor, { ...body, venueLinkToken });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response(null, { status: error.code === "not_allowed" ? 403 : 400 });
    throw error;
  }
}
