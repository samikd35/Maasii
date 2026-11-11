import { expect, test } from "vitest";
import {
  acceptInvitation,
  addBrandOwner,
  addPaymentOption,
  adminSupportActor,
  createVenue,
  createWaiterJoinCode,
  inviteOwner,
  joinWaiter,
  listBrandSupportOpenings,
  openBrandSupport,
  publicActor,
  setVenueDishSoldOut,
  systemActor,
  updatePaymentOption,
} from "@/core";
import { scenario } from "../support/scenario";
import { createPlatformAdmin, uniqueEmail } from "../support/users";

test("each authorized opening reads one Brand's support data and leaves an audit entry", async () => {
  const admin = await createPlatformAdmin();
  const support = adminSupportActor(admin.userId);
  const s = await scenario().brand("Saba House").venue("Bole", { tables: 2 }).venue("Lancha")
    .manager("Hana", { venue: "Bole" }).waiter("Sam", { venue: "Bole" }).publishedMenu().build();
  const other = await scenario().venue("Other Brand's Venue").manager("Other Manager").build();
  const { id: venueId } = s.venue;
  const cash = await addPaymentOption(s.owner.actor, { venueId, kind: "cash", displayOrder: 1 });
  await updatePaymentOption(s.owner.actor, {
    venueId, paymentOptionId: cash.id, revision: cash.revision, changes: { active: false },
  });
  await setVenueDishSoldOut(s.owner.actor, { venueId, dishId: s.dishId("Omelette"), soldOut: true });

  for (const actor of [publicActor, other.owner.actor, adminSupportActor(other.owner.userId)]) {
    await expect(openBrandSupport(actor, { brandId: s.brand.id })).rejects.toMatchObject({ code: "not_allowed" });
  }
  await expect(listBrandSupportOpenings(s.owner.actor, { brandId: s.brand.id }))
    .rejects.toMatchObject({ code: "not_allowed" });
  expect(await listBrandSupportOpenings(admin.actor, { brandId: s.brand.id })).toEqual([]);

  const first = new Date("2026-11-11T10:00:00Z");
  const second = new Date("2026-11-11T10:01:00Z");
  const view = await openBrandSupport(support, { brandId: s.brand.id }, { now: first });
  expect(view.brand).toMatchObject({ id: s.brand.id, name: "Saba House" });
  expect(view.owners).toEqual([{ userId: s.owner.userId, name: null }]);
  expect(view.venues.map((venue) => venue.name)).toEqual(["Bole", "Lancha"]);
  expect(view.venues[0]).toMatchObject({
    tables: [{ number: 1, active: true }, { number: 2, active: true }],
    staff: [{ name: "Hana", role: "manager" }, { name: "Sam", role: "waiter" }],
    paymentOptions: [{ id: cash.id, kind: "cash", active: false }],
  });
  await openBrandSupport(support, { brandId: s.brand.id }, { now: second });
  expect(await listBrandSupportOpenings(admin.actor, { brandId: s.brand.id })).toEqual([
    { brandId: s.brand.id, adminUserId: admin.userId, openedAt: second },
    { brandId: s.brand.id, adminUserId: admin.userId, openedAt: first },
  ]);
  expect(await listBrandSupportOpenings(admin.actor, { brandId: other.brand.id })).toEqual([]);
});

test("support access refuses Brand writes even for an admin who also owns the Brand", async () => {
  const admin = await createPlatformAdmin();
  const support = adminSupportActor(admin.userId);
  const { brand, owner, venue } = await scenario().build();
  await addBrandOwner(systemActor, { brandId: brand.id, userId: admin.userId });
  await openBrandSupport(support, { brandId: brand.id });

  await expect(createVenue(support, { brandId: brand.id, name: "Adwa" })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(addPaymentOption(support, { venueId: venue.id, kind: "cash", displayOrder: 1 }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(inviteOwner(support, { brandId: brand.id, name: "Liya", contact: uniqueEmail("liya") }))
    .rejects.toMatchObject({ code: "not_allowed" });
  const invite = await inviteOwner(admin.actor, { brandId: brand.id, name: "Liya", contact: uniqueEmail("liya") });
  const join = await createWaiterJoinCode(owner.actor, { venueId: venue.id, siteUrl: "https://maasii.test" });
  await expect(acceptInvitation(support, { token: invite.token, password: "injera-and-tea" }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(joinWaiter(support, { token: join.token, name: "Liya", pin: "0427" }))
    .rejects.toMatchObject({ code: "not_allowed" });
});
