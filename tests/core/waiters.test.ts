import { expect, test } from "vitest";
import {
  createWaiterJoinCode,
  getVenueSetup,
  getVenueStaff,
  getWaiterJoinCode,
  getWaiterSession,
  hasAuthSession,
  joinWaiter,
  lockWaiter,
  publicActor,
  removeWaiter,
  unlockWaiter,
} from "@/core";
import { scenario } from "../support/scenario";

const siteUrl = "https://maasii.test";
const pin = "0427";

test("a Manager's join QR enrolls one Waiter at that Venue only", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").build();
  const manager = s.managers.Hana.actor;
  await expect(
    createWaiterJoinCode(manager, { venueId: s.venues.Bole.id, siteUrl }),
  ).rejects.toMatchObject({ code: "not_allowed" });

  const qr = await createWaiterJoinCode(manager, { venueId: s.venue.id, siteUrl });
  expect(qr.url).toBe(`${siteUrl}/join/${qr.token}`);
  expect(qr.qrPng.byteLength).toBeGreaterThan(0);
  await expect(getWaiterJoinCode(publicActor, { token: qr.token })).resolves.toMatchObject({
    status: "pending",
    venueName: "Lancha",
  });

  await expect(joinWaiter(publicActor, { token: qr.token, name: "Sam", pin: "427" })).rejects.toMatchObject({
    reason: "invalidPin",
  });
  const { actor, unlockToken } = await joinWaiter(publicActor, { token: qr.token, name: "Sam", pin });
  await expect(getWaiterSession(actor, { unlockToken })).resolves.toMatchObject({
    status: "unlocked",
    name: "Sam",
    venue: { id: s.venue.id },
  });
  await expect(getVenueStaff(manager, { venueId: s.venue.id })).resolves.toMatchObject({
    waiters: [{ name: "Sam" }],
  });
  await expect(getVenueStaff(s.owner.actor, { venueId: s.venues.Bole.id })).resolves.toMatchObject({ waiters: [] });
  await expect(getVenueSetup(actor, { venueId: s.venue.id })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(joinWaiter(publicActor, { token: qr.token, name: "Other", pin })).rejects.toMatchObject({
    reason: "waiterJoinUsed",
  });
});

test("a used or expired QR refuses enrollment, including two phones joining at once", async () => {
  const s = await scenario().build();
  const now = new Date();
  const expired = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl }, { now });
  await expect(getWaiterJoinCode(publicActor, { token: expired.token }, { now: expired.expiresAt })).resolves.toMatchObject({
    status: "expired",
  });
  await expect(
    joinWaiter(publicActor, { token: expired.token, name: "Sam", pin }, { now: expired.expiresAt }),
  ).rejects.toMatchObject({ reason: "waiterJoinExpired" });

  const qr = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl });
  const joins = await Promise.allSettled([
    joinWaiter(publicActor, { token: qr.token, name: "Sam", pin }),
    joinWaiter(publicActor, { token: qr.token, name: "Abebe", pin }),
  ]);
  expect(joins.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  expect(joins.find((result) => result.status === "rejected")?.reason).toMatchObject({ reason: "waiterJoinUsed" });
  expect((await getVenueStaff(s.owner.actor, { venueId: s.venue.id })).waiters).toHaveLength(1);
});

test("a phone stays enrolled across days and requires the PIN for another unlock", async () => {
  const s = await scenario().build();
  const qr = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl });
  const { actor, unlockToken } = await joinWaiter(publicActor, { token: qr.token, name: "Sam", pin });
  const tomorrow = { now: new Date(Date.now() + 24 * 60 * 60 * 1000) };

  await expect(getWaiterSession(actor, { unlockToken }, tomorrow)).resolves.toEqual({ status: "locked" });
  await expect(unlockWaiter(actor, { pin: "9876" }, tomorrow)).rejects.toMatchObject({ reason: "wrongPin" });
  const next = await unlockWaiter(actor, { pin }, tomorrow);
  await expect(getWaiterSession(actor, next, tomorrow)).resolves.toMatchObject({ status: "unlocked", name: "Sam" });
  await expect(getWaiterSession(actor, {}, tomorrow)).resolves.toEqual({ status: "locked" });

  await lockWaiter(actor);
  await expect(getWaiterSession(actor, next, tomorrow)).resolves.toEqual({ status: "locked" });
});

test("five wrong PINs require a fresh join even when attempts arrive at the same time", async () => {
  const s = await scenario().build();
  const qr = await createWaiterJoinCode(s.owner.actor, { venueId: s.venue.id, siteUrl });
  const { actor, unlockToken } = await joinWaiter(publicActor, { token: qr.token, name: "Sam", pin });

  const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => unlockWaiter(actor, { pin: "0000" })));
  expect(attempts.filter((result) => result.status === "rejected" && result.reason.reason === "wrongPin")).toHaveLength(4);
  await expect(unlockWaiter(actor, { pin })).rejects.toMatchObject({ reason: "waiterRejoin" });
  await expect(getWaiterSession(actor, { unlockToken })).resolves.toEqual({ status: "rejoin" });
});

test("a fresh QR can reconnect the same Waiter, and removal revokes both phones", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana").manager("Selam", { venue: "Bole" }).build();
  const manager = s.managers.Hana.actor;
  const input = { venueId: s.venue.id, siteUrl };
  const first = await createWaiterJoinCode(manager, input);
  const original = await joinWaiter(publicActor, { token: first.token, name: "Sam", pin });
  const [{ id: waiterId }] = (await getVenueStaff(manager, input)).waiters;

  const fresh = await createWaiterJoinCode(manager, { ...input, waiterId });
  await expect(getWaiterJoinCode(publicActor, fresh)).resolves.toMatchObject({ waiterName: "Sam" });
  const second = await joinWaiter(publicActor, { token: fresh.token, name: "", pin: "1111" });
  expect(second.actor.userId).toBe(original.actor.userId);
  expect(second.actor.sessionId).not.toBe(original.actor.sessionId);
  await expect(hasAuthSession(original.actor)).resolves.toBe(true);
  await expect(hasAuthSession(second.actor)).resolves.toBe(true);
  await expect(getVenueStaff(manager, input)).resolves.toMatchObject({ waiters: [{ id: waiterId, name: "Sam" }] });
  await expect(removeWaiter(s.managers.Selam.actor, { ...input, waiterId })).rejects.toMatchObject({
    code: "not_allowed",
  });

  const outstanding = await createWaiterJoinCode(manager, { ...input, waiterId });
  const [joining, removing] = await Promise.allSettled([
    joinWaiter(publicActor, { token: outstanding.token, name: "", pin }),
    removeWaiter(manager, { ...input, waiterId }),
  ]);
  expect(removing.status).toBe("fulfilled");
  await expect(getVenueStaff(manager, input)).resolves.toMatchObject({ waiters: [] });
  const phones = [original, second];
  if (joining.status === "fulfilled") phones.push(joining.value);
  else expect(joining.reason).toMatchObject({ reason: "waiterJoinInvalid" });
  for (const phone of phones) {
    await expect(hasAuthSession(phone.actor)).resolves.toBe(false);
    await expect(getWaiterSession(phone.actor, phone)).resolves.toEqual({ status: "rejoin" });
    await expect(unlockWaiter(phone.actor, { pin })).rejects.toMatchObject({ reason: "waiterRejoin" });
  }
  await expect(joinWaiter(publicActor, { token: outstanding.token, name: "", pin })).rejects.toMatchObject({
    reason: "waiterJoinInvalid",
  });
});
