"use server";

import { revalidatePath } from "next/cache";
import { updateBranding, updateBrandSocialLinks, type DisplayFont } from "@/core";
import { forForm, requireStaff, type FormState } from "@/lib/session";

export async function saveBranding(brandId: string, _state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireStaff();
  return forForm(async () => {
    const logo = form.get("logo");
    const cover = form.get("cover");
    if (typeof logo === "string" || typeof cover === "string") return { error: "invalidBrandArtwork" };

    await updateBranding(actor, {
      brandId,
      colour: String(form.get("colour") ?? ""),
      displayFont: String(form.get("displayFont") ?? "") as DisplayFont,
      logo: chosenFile(logo),
      cover: chosenFile(cover),
    });
    revalidatePath(`/manage/brands/${brandId}/branding`);
    return { done: { key: "brandingSaved" } };
  });
}

function chosenFile(file: File | null): File | undefined {
  // An untouched file input submits a nameless, zero-byte placeholder.
  return file && (file.name !== "" || file.size !== 0) ? file : undefined;
}

export async function saveSocialLinks(brandId: string, _state: FormState, form: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const names = form.getAll("socialName");
  const urls = form.getAll("socialUrl");
  if (names.length !== urls.length || !names.every((name) => typeof name === "string") || !urls.every((url) => typeof url === "string")) {
    return { error: "invalidSocialLinks" };
  }
  return forForm(async () => {
    await updateBrandSocialLinks(actor, { brandId, links: names.map((name, index) => ({ name, url: urls[index] })) });
    revalidatePath(`/manage/brands/${brandId}/branding`);
    return { done: { key: "socialLinksSaved" } };
  });
}
