"use server";

import { redirect } from "next/navigation";
import { joinWaiter, publicActor } from "@/core";
import { forForm, rememberStaffLanguage, setWaiterUnlockToken, type FormState } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function join(token: string, _state: FormState, formData: FormData): Promise<FormState> {
  return forForm(async () => {
    const { actor, session, unlockToken } = await joinWaiter(publicActor, {
      token,
      name: String(formData.get("name") ?? ""),
      pin: String(formData.get("pin") ?? ""),
    });
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.setSession(session);
    if (error?.code === "session_not_found") return { error: "waiterRejoin" };
    if (error) throw error;
    await rememberStaffLanguage(actor);
    await setWaiterUnlockToken(unlockToken);
    redirect("/staff");
  });
}
