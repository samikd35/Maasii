import { z } from "zod";

/** Server only: pass just the public key to the device setup screen. */
export function orderPushConfig() {
  const { MAASII_VAPID_PUBLIC_KEY: publicKey, MAASII_VAPID_PRIVATE_KEY: privateKey, MAASII_VAPID_SUBJECT: subject } = process.env;
  if (!publicKey || !privateKey || !subject) return;
  const scope = process.env.MAASII_LOCAL_PUSH_WAITER_IDS;
  if (scope === undefined) return { publicKey, privateKey, subject };

  const origin = z.url({ protocol: /^https?$/ }).safeParse(process.env.MAASII_SITE_URL);
  const waiterIds = z.array(z.uuid()).min(1).safeParse(scope.split(",").map((id) => id.trim().toLowerCase()));
  // A missing/invalid test scope must never turn into an unscoped send.
  if (!origin.success || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin.data).hostname)
      || !waiterIds.success) return;
  return { publicKey, privateKey, subject, waiterIds: waiterIds.data };
}
