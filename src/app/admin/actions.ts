"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBrand, inviteOwner } from "@/core";
import { forForm, requireAdmin, siteUrl, type FormState } from "@/lib/session";

export async function addBrand(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  return forForm(async () => {
    const brand = await createBrand(actor, { name: String(formData.get("name") ?? "") });
    redirect(`/admin/brands/${brand.id}`);
  });
}

export async function inviteBrandOwner(brandId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  return forForm(async () => {
    const invitation = await inviteOwner(actor, {
      brandId,
      name: String(formData.get("name") ?? ""),
      contact: String(formData.get("contact") ?? ""),
    });
    revalidatePath(`/admin/brands/${brandId}`);
    return {
      done: { key: "invitationReady" },
      link: new URL(`/invite/${invitation.token}`, await siteUrl()).toString(),
    };
  });
}
