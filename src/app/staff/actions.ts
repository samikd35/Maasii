"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { lockWaiter, setWaiterPushSubscription, signInWaiter, unlockWaiter } from "@/core";
import { orderPushConfig } from "@/lib/order-push-config";
import { forForm, getSessionActor, openWaiterWorkspace, setWaiterUnlockToken, waiterUnlockToken, type FormState } from "@/lib/session";

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  const table = z.uuid().safeParse(formData.get("tableId"));
  return forForm(async () => openWaiterWorkspace(await signInWaiter({
    phone: String(formData.get("phone") ?? ""),
    pin: String(formData.get("pin") ?? ""),
  }), table.success ? `/staff/tables/${table.data}` : "/staff"));
}

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
  const push = orderPushConfig();
  if (!actor || !push) return false;
  const result = await forForm(async () => {
    await setWaiterPushSubscription(actor, { subscription, unlockToken: await waiterUnlockToken() }, { waiterIds: push.waiterIds });
  });
  return !result?.error;
}
