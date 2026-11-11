"use server";

import { getMenuDraft, publishMenuDraft, saveMenuDraft, uploadDishPhoto, type MenuDraftContent } from "@/core";
import { forForm, requireStaff } from "@/lib/session";

export async function persistMenuDraft(
  brandId: string,
  revision: string | null,
  menu: MenuDraftContent,
  publish: boolean,
) {
  const actor = await requireStaff();
  const input = { brandId, revision, menu };
  const result = await forForm(async () => {
    if (publish) await publishMenuDraft(actor, input);
    else await saveMenuDraft(actor, input);
  });
  if (result?.error) return { error: result.error };
  return { draft: await getMenuDraft(actor, { brandId }) };
}

export async function prepareDishPhoto(brandId: string, form: FormData) {
  const actor = await requireStaff();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return { error: "invalidBrandArtwork" as const };
  let photoUrl: string | undefined;
  const result = await forForm(async () => { photoUrl = await uploadDishPhoto(actor, { brandId, photo }); });
  return { photoUrl, error: result?.error };
}
