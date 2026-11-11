"use server";

import { redirect } from "next/navigation";
import { parseStaffContact } from "@/core";
import { forForm, type FormState } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function signIn(_state: FormState, formData: FormData): Promise<FormState> {
  return forForm(async () => {
    const contact = parseStaffContact(String(formData.get("contact") ?? ""));
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.signInWithPassword({ ...contact, password: String(formData.get("password") ?? "") });
    if (error) return { error: "That email, phone or password is not right." };
    redirect("/manage");
  });
}
