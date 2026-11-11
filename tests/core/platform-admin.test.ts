import { expect, test } from "vitest";
import { acceptInvitation, createBrand, getBrandOwners, inviteOwner, listBrands, publicActor } from "@/core";
import { scenario } from "../support/scenario";
import { createPlatformAdmin, createStaffUser, uniqueEmail } from "../support/users";

test("the platform admin creates a brand and sees it in the brand list", async () => {
  const admin = await createPlatformAdmin();

  const brand = await createBrand(admin.actor, { name: "Saba House" });

  expect(brand).toMatchObject({ name: "Saba House" });
  expect(await listBrands(admin.actor)).toContainEqual(expect.objectContaining({ id: brand.id, name: "Saba House" }));
});

test("the platform admin sees a brand's Owners and the Owner invitations still waiting", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Saba House" });
  const selam = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: uniqueEmail("selam") });
  const { userId } = await acceptInvitation(publicActor, { token: selam.token, password: "injera-and-tea" });
  const dawit = await inviteOwner(admin.actor, { brandId: brand.id, name: "Dawit", contact: "+251 911 000 111" });

  expect(await getBrandOwners(admin.actor, { brandId: brand.id })).toEqual({
    brand: { id: brand.id, name: "Saba House" },
    owners: [{ userId, name: "Selam" }],
    invitations: [{ invitationId: dawit.invitationId, name: "Dawit", contact: "+251911000111", expiresAt: dawit.expiresAt }],
  });
  const other = await scenario().build();
  await expect(getBrandOwners(other.owner.actor, { brandId: brand.id })).rejects.toMatchObject({ code: "not_allowed" });
});

test("nobody but the platform admin can create brands or list them", async () => {
  const someone = await createStaffUser("someone");

  for (const actor of [someone.actor, publicActor]) {
    await expect(createBrand(actor, { name: "Saba House" })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(listBrands(actor)).rejects.toMatchObject({ code: "not_allowed" });
  }
});
