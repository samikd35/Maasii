"use server";

import { joinWaiter, publicActor } from "@/core";
import { forForm, openWaiterWorkspace, type FormState } from "@/lib/session";

export async function join(token: string, _state: FormState, formData: FormData): Promise<FormState> {
  return forForm(async () => openWaiterWorkspace(await joinWaiter(publicActor, {
    token,
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    pin: String(formData.get("pin") ?? ""),
  })));
}
