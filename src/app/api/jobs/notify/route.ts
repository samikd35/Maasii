import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { generateRequestDetails } from "web-push";
import { consumeOrderNotificationWake, sendOrderNotifications, systemActor } from "@/core";
import { orderPushConfig } from "@/lib/order-push-config";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !await consumeOrderNotificationWake(systemActor, authorization.slice(7))) {
    return new Response(null, { status: 401 });
  }
  const vapidDetails = orderPushConfig();
  if (!vapidDetails) {
    return new Response(null, { status: 503 });
  }

  await sendOrderNotifications(systemActor, async (notice) => {
    const t = await getTranslations({ locale: notice.language, namespace: "StaffOrders" });
    const tag = `${notice.reason === "bill-reminder" ? "bill" : "order"}-${notice.orderId}`;
    const push = generateRequestDetails(notice.subscription, JSON.stringify({
      title: t("table", { number: notice.tableNumber }),
      body: t(notice.reason === "bill-reminder" ? "billReminder" : notice.reason === "new" ? "newOrder" : "escalatedOrder"),
      tag,
      url: `/staff/tables/${notice.tableId}`,
    }), {
      TTL: 120,
      urgency: "high",
      topic: createHash("sha256").update(tag).digest("base64url").slice(0, 32),
      vapidDetails,
    });
    const response = await fetch(push.endpoint, {
      method: push.method,
      headers: push.headers as Record<string, string>,
      body: push.body ? Uint8Array.from(push.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) return "expired";
    return response.ok ? "sent" : "retry";
  });
  return new Response(null, { status: 204 });
}
