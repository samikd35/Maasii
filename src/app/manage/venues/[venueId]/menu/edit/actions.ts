"use server";

import { getVenueMenuDraft, saveVenueMenu, uploadVenueDishPhoto, type MenuDraftContent } from "@/core";
import { forForm, requireStaff } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function persistVenueMenu(
  venueId: string, revision: string | null, menu: MenuDraftContent, publish: boolean, inherit: string[],
) {
  const actor = await requireStaff();
  if (revision === null) return { error: "menuDraftChanged" as const };
  const result = await forForm(() => saveVenueMenu(actor, { venueId, revision, menu, publish, inherit }));
  if (result?.error) return { error: result.error };
  if (publish) {
    revalidatePath(`/manage/venues/${venueId}/menu`);
    revalidatePath("/v/[token]", "layout");
  }
  return { draft: (await getVenueMenuDraft(actor, { venueId })).draft };
}

export async function prepareVenueDishPhoto(venueId: string, form: FormData) {
  const actor = await requireStaff();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return { error: "invalidBrandArtwork" as const };
  let photoUrl: string | undefined;
  const result = await forForm(async () => { photoUrl = await uploadVenueDishPhoto(actor, { venueId, photo }); });
  return { photoUrl, error: result?.error };
}
