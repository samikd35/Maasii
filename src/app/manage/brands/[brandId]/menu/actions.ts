"use server";

import { revalidatePath } from "next/cache";
import {
  uploadDishVideo, getMenuDraft, importMenuPhotos, publishMenuDraft, reviewBrandMenuDraft, saveMenuDraft, suggestMenuTranslations, uploadDishPhoto, type MenuDraftContent,
} from "@/core";
import { forForm, requireStaff } from "@/lib/session";

export async function persistMenuDraft(
  brandId: string,
  revision: string | null,
  menu: MenuDraftContent,
  publish: boolean,
  impactStamp?: string,
) {
  const actor = await requireStaff();
  const input = { brandId, revision, menu };
  const result = await forForm(async () => {
    if (publish) {
      if (!impactStamp) return { error: "menuVenueImpactChanged" };
      await publishMenuDraft(actor, { brandId, revision, impactStamp });
    }
    else await saveMenuDraft(actor, input);
  });
  if (result?.error) return { error: result.error };
  revalidatePath(`/manage/brands/${brandId}`, "page");
  return { draft: await getMenuDraft(actor, { brandId }) };
}

export async function reviewBrandPublish(brandId: string, revision: string | null) {
  const actor = await requireStaff();
  let impact: Awaited<ReturnType<typeof reviewBrandMenuDraft>> | undefined;
  const result = await forForm(async () => { impact = await reviewBrandMenuDraft(actor, { brandId, revision }); });
  return { impact, error: result?.error };
}

export async function prepareDishPhoto(brandId: string, form: FormData) {
  const actor = await requireStaff();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return { error: "invalidBrandArtwork" as const };
  let photoUrl: string | undefined;
  const result = await forForm(async () => { photoUrl = await uploadDishPhoto(actor, { brandId, photo }); });
  return { photoUrl, error: result?.error };
}

export async function requestMenuAssistance(
  brandId: string,
  revision: string | null,
  menu: MenuDraftContent,
  request: FormData | { sectionId: string; dishId?: string },
) {
  const actor = await requireStaff();
  const input = { brandId, revision, menu };
  const result = await forForm(async () => {
    if (request instanceof FormData) {
      const photos = request.getAll("photos");
      if (!photos.every((photo) => photo instanceof File)) return { error: "menuAiPhotos" };
      await importMenuPhotos(actor, { ...input, photos });
    } else {
      await suggestMenuTranslations(actor, { ...input, sectionId: request?.sectionId, dishId: request?.dishId });
    }
  });
  if (result?.error) return { error: result.error };
  return { draft: await getMenuDraft(actor, { brandId }) };
}

export async function prepareDishVideo(brandId: string, form: FormData) {
  const actor = await requireStaff();
  const video = form.get("video");
  if (!(video instanceof File)) return { error: "invalidDishVideo" as const };
  let videoAssetId: string | undefined;
  const result = await forForm(async () => { videoAssetId = (await uploadDishVideo(actor, { brandId, video })).id; });
  return { videoAssetId, error: result?.error };
}
