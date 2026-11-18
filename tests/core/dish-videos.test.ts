import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { getMenuDraft, getPublishedMenu, getVenueMenuDraft, saveVenueMenu, uploadVenueDishVideo, publicActor, publishMenuDraft, saveMenuDraft, uploadDishVideo } from "@/core";
import { scenario } from "../support/scenario";

test("validated serving clips require ownership and explicit publication", async () => {
  const s = await scenario().manager("Hana").publishedMenu().build();
  const video = new File([new Uint8Array(await readFile("tests/fixtures/serving.mp4"))], "serving.mp4", { type: "video/mp4" });
  const input = { brandId: s.brand.id, video };
  await expect(uploadDishVideo(s.managers.Hana.actor, input)).rejects.toMatchObject({ code: "not_allowed" });
  await expect(uploadDishVideo(s.owner.actor, { ...input, video: new File(["fake"], "fake.mp4", { type: "video/mp4" }) })).rejects.toMatchObject({ reason: "invalidDishVideo" });
  const asset = await uploadDishVideo(s.owner.actor, input);
  const draft = await getMenuDraft(s.owner.actor, input);
  draft.menu.sections[0].dishes[0].videoAssetId = asset.id;
  let revision = await saveMenuDraft(s.owner.actor, { ...input, revision: draft.revision, menu: draft.menu });
  await expect(publishMenuDraft(s.owner.actor, { ...input, revision })).rejects.toMatchObject({ reason: "menuDraftInvalid" });
  draft.menu.sections[0].dishes[0].photoUrl = "https://example.test/serving.webp";
  revision = await saveMenuDraft(s.owner.actor, { ...input, revision, menu: draft.menu });
  const guest = async () => (await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken }))!.sections[0].dishes[0];
  expect((await guest()).videoUrl).toBeNull();
  await publishMenuDraft(s.owner.actor, { ...input, revision });
  expect((await guest()).videoUrl).toContain(asset.id);
  const other = await scenario().publishedMenu().build();
  const foreign = await getMenuDraft(other.owner.actor, { brandId: other.brand.id });
  foreign.menu.sections[0].dishes[0].videoAssetId = asset.id;
  await expect(saveMenuDraft(other.owner.actor, { brandId: other.brand.id, revision: foreign.revision, menu: foreign.menu })).rejects.toMatchObject({ reason: "invalidDishVideo" });
});

test("serving clips reject duration, dimensions, audio, truncation and size violations", async () => {
  const s = await scenario().build();
  const valid = new Uint8Array(await readFile("tests/fixtures/serving.mp4"));
  const invalid = [valid.slice(0, -100), new Uint8Array(1024 * 1024 + 1)];
  for (const name of ["short", "long", "large", "audio"]) invalid.push(new Uint8Array(await readFile(`tests/fixtures/serving-${name}.mp4`)));
  for (const bytes of invalid) {
    await expect(uploadDishVideo(s.owner.actor, { brandId: s.brand.id, video: new File([bytes], "clip.mp4", { type: "video/mp4" }) })).rejects.toMatchObject({ reason: "invalidDishVideo" });
  }
});

test("Venue videos inherit, override and remove locally without crossing scope", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").publishedMenu().build();
  const video = new File([new Uint8Array(await readFile("tests/fixtures/serving.mp4"))], "serving.mp4", { type: "video/mp4" });
  const brand = await uploadDishVideo(s.owner.actor, { brandId: s.brand.id, video });
  const draft = await getMenuDraft(s.owner.actor, { brandId: s.brand.id });
  draft.menu.sections[0].dishes[0].videoAssetId = brand.id;
  draft.menu.sections[0].dishes[0].photoUrl = "https://example.test/serving.webp";
  const revision = await saveMenuDraft(s.owner.actor, { brandId: s.brand.id, revision: draft.revision, menu: draft.menu });
  await publishMenuDraft(s.owner.actor, { brandId: s.brand.id, revision });
  const published = async (venue = s.venue) => (await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken }))!.sections[0].dishes[0];
  expect((await published()).videoUrl).toContain(brand.id);
  const local = await uploadVenueDishVideo(s.managers.Hana.actor, { venueId: s.venue.id, video });
  await expect(uploadVenueDishVideo(s.managers.Hana.actor, { venueId: s.venues.Bole.id, video })).rejects.toMatchObject({ code: "not_allowed" });
  async function change(value: string | undefined, inherit = false) {
    const { draft } = await getVenueMenuDraft(s.managers.Hana.actor, { venueId: s.venue.id });
    const dish = draft.menu.sections[0].dishes[0];
    dish.videoAssetId = value;
    await saveVenueMenu(s.managers.Hana.actor, { venueId: s.venue.id, revision: draft.revision!, menu: draft.menu, inherit: inherit ? [dish.dishId] : [], publish: false });
    const saved = (await getVenueMenuDraft(s.managers.Hana.actor, { venueId: s.venue.id })).draft;
    await saveVenueMenu(s.managers.Hana.actor, { venueId: s.venue.id, revision: saved.revision!, menu: saved.menu, publish: true });
  }
  await change(local.id);
  expect((await published()).videoUrl).toContain(local.id);
  expect((await published(s.venues.Bole)).videoUrl).toContain(brand.id);
  const other = (await getVenueMenuDraft(s.owner.actor, { venueId: s.venues.Bole.id })).draft;
  other.menu.sections[0].dishes[0].videoAssetId = local.id;
  await expect(saveVenueMenu(s.owner.actor, { venueId: s.venues.Bole.id, revision: other.revision!, menu: other.menu, publish: false })).rejects.toMatchObject({ reason: "invalidDishVideo" });
  await change(undefined);
  expect((await published()).videoUrl).toBeNull();
  await change(brand.id, true);
  expect((await published()).videoUrl).toContain(brand.id);
});
