"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, publicActor, staffActor } from "@/core";
import { forForm, rememberStaffLanguage, type FormState } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function accept(token: string, _state: FormState, formData: FormData): Promise<FormState> {
  return forForm(async () => {
    const password = String(formData.get("password") ?? "");
    const { contact, userId } = await acceptInvitation(publicActor, { token, password });
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ ...contact, password });
    if (error) throw error;
    await rememberStaffLanguage(staffActor(userId));
    redirect("/manage");
  });
}
