import sharp from "sharp";
import { expect, test } from "vitest";
import { getMenuDraft, getPublishedMenu, publicActor, publishMenuDraft, saveMenuDraft, uploadDishPhoto } from "@/core";
import { scenario } from "../support/scenario";

test("only the Owner can upload a resized Dish photo and guests see it on publish", async () => {
  const s = await scenario().manager("Hana").publishedMenu().build();
  const actor = s.owner.actor;
  const input = { brandId: s.brand.id };
  const image = await sharp({
    create: { width: 1440, height: 1200, channels: 3, background: "#eb6728" },
  }).png().toBuffer();
  const photo = new File([new Uint8Array(image)], "breakfast.png", { type: "image/png" });
  await expect(uploadDishPhoto(s.managers.Hana.actor, { ...input, photo })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(uploadDishPhoto(actor, {
    ...input, photo: new File(["not an image"], "fake.png", { type: "image/png" }),
  })).rejects.toMatchObject({ reason: "invalidBrandArtwork" });

  const photoUrl = await uploadDishPhoto(actor, { ...input, photo });
  const uploaded = await fetch(photoUrl);
  expect(uploaded.ok).toBe(true);
  expect(uploaded.headers.get("content-type")).toBe("image/webp");
  const bytes = Buffer.from(await uploaded.arrayBuffer());
  expect(bytes.length).toBeLessThan(image.length);
  await expect(sharp(bytes).metadata()).resolves.toMatchObject({ format: "webp", width: 960, height: 800 });

  const draft = await getMenuDraft(actor, input);
  draft.menu.sections[0].dishes[0].photoUrl = photoUrl;
  const revision = await saveMenuDraft(actor, { ...input, revision: draft.revision, menu: draft.menu });
  const guestPhoto = async () => (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))?.sections[0].dishes[0].photoUrl;
  expect(await guestPhoto()).toBeNull();
  await publishMenuDraft(actor, { ...input, revision });
  expect(await guestPhoto()).toBe(photoUrl);
});
