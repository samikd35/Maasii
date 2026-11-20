import { confirmPayment, getBillPaymentStatus, MaasiiError, prepareBill, reopenBill, type PaymentConfirmation } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";

function receipt({ method, receiptAmountSantim, billTotalSantim, differenceSantim }: PaymentConfirmation) {
  return { method: { kind: method.kind, provider: method.provider }, receiptAmountSantim, billTotalSantim, differenceSantim };
}

function billError(error: unknown) {
  if (!(error instanceof MaasiiError)) throw error;
  return Response.json({ reason: error.reason }, { status: error.code === "not_allowed" ? 403 : 409 });
}

export async function GET(request: Request) {
  const actor = await getSessionActor();
  if (!actor) return new Response(null, { status: 403 });
  const params = new URL(request.url).searchParams;
  try {
    const result = await getBillPaymentStatus(actor, {
      venueId: params.get("venueId") ?? "", visitId: params.get("visitId") ?? "", unlockToken: await waiterUnlockToken(),
    });
    const body = result.status === "recorded" ? { status: result.status, confirmation: receipt(result.confirmation) } : result;
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return billError(error);
  }
}

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
      case "confirm": {
        const confirmation = await confirmPayment(actor, {
          ...target, paymentOptionId: body.paymentOptionId, receiptAmountSantim: body.receiptAmountSantim, billSnapshot: body.billSnapshot,
        });
        return Response.json(receipt(confirmation), { headers: { "Cache-Control": "private, no-store" } });
      }
      default:
        return new Response(null, { status: 400 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return billError(error);
  }
}
