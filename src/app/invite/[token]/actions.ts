"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, publicActor } from "@/core";
import { forForm, type FormState } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function accept(token: string, _state: FormState, formData: FormData): Promise<FormState> {
  return forForm(async () => {
    const password = String(formData.get("password") ?? "");
    const { contact } = await acceptInvitation(publicActor, { token, password });
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ ...contact, password });
    if (error) throw error;
    redirect("/manage");
  });
}
