import { expect, test } from "vitest";
import { adminSupportActor, getBrandSocialLinks, getGuestSocialLinks, guestActor, publicActor, updateBrandSocialLinks } from "@/core";
import { createPublicAuthClient } from "@/lib/supabase/public";
import { scenario } from "../support/scenario";

test("only the Brand Owner writes shared social links and invalid edits preserve the last published list", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").waiter("Sam").build();
  const other = await scenario().build();
  const { data, error } = await createPublicAuthClient().auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Could not create guest");
  const brandId = s.brand.id;
  const read = (venueLinkToken: string) => getGuestSocialLinks(publicActor, { venueLinkToken });
  const instagram = { name: "Instagram", url: "https://www.instagram.com/testcafe/" };
  const telegram = { name: "Telegram", url: "https://t.me/testcafe" };

  expect(await getBrandSocialLinks(s.owner.actor, { brandId })).toEqual([]);
  expect(await read(s.venue.linkToken)).toMatchObject({ links: [] });
  expect(await read("not-a-venue")).toBeNull();
  await updateBrandSocialLinks(s.owner.actor, { brandId, links: [instagram, telegram] });
  for (const venue of Object.values(s.venues)) {
    expect(await read(venue.linkToken)).toMatchObject({ brand: { id: brandId }, links: [instagram, telegram] });
  }
  expect(await read(other.venue.linkToken)).toMatchObject({ links: [] });

  for (const actor of [
    publicActor, guestActor(data.user.id), s.managers.Hana.actor, s.waiters.Sam.actor, other.owner.actor,
    adminSupportActor(s.owner.userId),
  ]) {
    await expect(updateBrandSocialLinks(actor, { brandId, links: [] })).rejects.toMatchObject({ code: "not_allowed" });
  }
  for (const url of ["http://example.com/profile", "javascript:alert(1)", "https://name:password@example.com/profile"]) {
    await expect(updateBrandSocialLinks(s.owner.actor, { brandId, links: [{ name: "Profile", url }] }))
      .rejects.toMatchObject({ reason: "invalidSocialLinks" });
  }
  expect(await getBrandSocialLinks(s.owner.actor, { brandId })).toEqual([instagram, telegram]);

  await updateBrandSocialLinks(s.owner.actor, { brandId, links: [telegram, instagram] });
  expect(await read(s.venues.Bole.linkToken)).toMatchObject({ links: [telegram, instagram] });
  await updateBrandSocialLinks(s.owner.actor, { brandId, links: [] });
  expect(await read(s.venues.Bole.linkToken)).toMatchObject({ links: [] });
});
