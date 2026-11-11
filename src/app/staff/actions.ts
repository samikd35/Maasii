"use server";

import { redirect } from "next/navigation";
import { lockWaiter, unlockWaiter } from "@/core";
import { forForm, getSessionActor, setWaiterUnlockToken, type FormState } from "@/lib/session";

export async function unlock(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await getSessionActor();
  if (!actor) redirect("/staff");
  const state = await forForm(async () => {
    const { unlockToken } = await unlockWaiter(actor, { pin: String(formData.get("pin") ?? "") });
    await setWaiterUnlockToken(unlockToken);
    redirect("/staff");
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
