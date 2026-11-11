"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { lockWaiter, setWaiterPushSubscription, unlockWaiter } from "@/core";
import { forForm, getSessionActor, setWaiterUnlockToken, waiterUnlockToken, type FormState } from "@/lib/session";

export async function unlock(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await getSessionActor();
  if (!actor) redirect("/staff");
  const state = await forForm(async () => {
    const { unlockToken } = await unlockWaiter(actor, { pin: String(formData.get("pin") ?? "") });
    await setWaiterUnlockToken(unlockToken);
    const table = z.uuid().safeParse(formData.get("tableId"));
    redirect(table.success ? `/staff/tables/${table.data}` : "/staff");
  });
  if (state?.error === "waiterRejoin") redirect("/staff");
  return state;
}

export async function lock() {
  const actor = await getSessionActor();
  if (actor) await lockWaiter(actor);
  await setWaiterUnlockToken("");
  redirect("/staff");
}

export async function allowNotifications(subscription: unknown): Promise<boolean> {
  const actor = await getSessionActor();
  if (!actor || !process.env.MAASII_VAPID_PUBLIC_KEY) return false;
  const result = await forForm(async () => {
    await setWaiterPushSubscription(actor, { subscription, unlockToken: await waiterUnlockToken() });
  });
  return !result?.error;
}
