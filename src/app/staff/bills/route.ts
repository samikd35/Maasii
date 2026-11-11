import { confirmPayment, MaasiiError, prepareBill, reopenBill } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";

export async function POST(request: Request) {
  const actor = await getSessionActor();
  const unlockToken = await waiterUnlockToken();
  if (!actor) return new Response(null, { status: 403 });
  const body = await request.json().catch(() => null);
  const target = { venueId: body?.venueId, visitId: body?.visitId, unlockToken };
  try {
    switch (body?.action) {
      case "prepare":
        await prepareBill(actor, target);
        break;
      case "reopen":
        await reopenBill(actor, target);
        break;
      case "confirm":
        await confirmPayment(actor, { ...target, paymentOptionId: body.paymentOptionId, receiptAmountSantim: body.receiptAmountSantim });
        break;
      default:
        return new Response(null, { status: 400 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MaasiiError) return new Response(null, { status: error.code === "not_allowed" ? 403 : 409 });
    throw error;
  }
}
