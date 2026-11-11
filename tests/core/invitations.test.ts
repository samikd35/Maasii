import { expect, test } from "vitest";
import {
  acceptInvitation,
  createBrand,
  getInvitation,
  getMyAccess,
  inviteOwner,
  publicActor,
  publishMenu,
  staffActor,
} from "@/core";
import { sampleMenu, scenario } from "../support/scenario";
import { signInWithPassword } from "../support/sign-in";
import { createPlatformAdmin, uniqueEmail, uniquePhone } from "../support/users";

test("an invited Owner accepts with a password, signs in with their email and runs the brand", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Saba House" });
  const email = uniqueEmail("Selam");

  const invitation = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: email });
  expect(await getInvitation(publicActor, { token: invitation.token })).toMatchObject({
    status: "pending",
    role: "owner",
    name: "Selam",
    contact: email,
    brand: { name: "Saba House" },
  });

  const { userId } = await acceptInvitation(publicActor, { token: invitation.token, password: "injera-and-tea" });

  expect(await signInWithPassword({ email, password: "injera-and-tea" })).toBe(userId);
  expect(await getMyAccess(staffActor(userId))).toMatchObject({
    name: "Selam",
    brands: [{ id: brand.id, name: "Saba House", role: "owner" }],
  });
  await expect(
    publishMenu(staffActor(userId), { brandId: brand.id, menu: sampleMenu }),
  ).resolves.toMatchObject({ number: 1 });
});

test("an Owner invited by a local phone number signs in with that phone and a password", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Tomoca" });
  const phone = uniquePhone(); // +2519XXXXXXXX
  const localPhone = `0${phone.slice(4, 7)} ${phone.slice(7, 10)} ${phone.slice(10)}`; // 09XX XXX XXX

  const invitation = await inviteOwner(admin.actor, { brandId: brand.id, name: "Dawit", contact: localPhone });
  expect(await getInvitation(publicActor, { token: invitation.token })).toMatchObject({ contact: phone });
  const { userId } = await acceptInvitation(publicActor, { token: invitation.token, password: "buna-time-2026" });

  expect(await signInWithPassword({ phone, password: "buna-time-2026" })).toBe(userId);
  expect((await getMyAccess(staffActor(userId))).brands).toEqual([
    expect.objectContaining({ id: brand.id, role: "owner" }),
  ]);
});

test("an invitation works once, and not after it expires a week later", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Saba House" });
  const invitedAt = new Date("2026-11-11T09:00:00+03:00");
  const oneWeekLater = new Date("2026-11-18T09:00:00+03:00");

  const used = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: uniqueEmail("selam") });
  await acceptInvitation(publicActor, { token: used.token, password: "injera-and-tea" });
  await expect(
    acceptInvitation(publicActor, { token: used.token, password: "injera-and-tea" }),
  ).rejects.toMatchObject({ code: "not_allowed", message: expect.stringMatching(/already been used/) });

  const email = uniqueEmail("hanna");
  const late = await inviteOwner(admin.actor, { brandId: brand.id, name: "Hanna", contact: email }, { now: invitedAt });
  expect(await getInvitation(publicActor, { token: late.token }, { now: oneWeekLater })).toMatchObject({
    status: "expired",
  });
  await expect(
    acceptInvitation(publicActor, { token: late.token, password: "injera-and-tea" }, { now: oneWeekLater }),
  ).rejects.toMatchObject({ code: "not_allowed", message: expect.stringMatching(/expired/) });
  await expect(signInWithPassword({ email, password: "injera-and-tea" })).rejects.toThrow();
});

test("inviting the same person again replaces the earlier link", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Saba House" });
  const email = uniqueEmail("selam");

  const first = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: email });
  const second = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: email });

  await expect(
    acceptInvitation(publicActor, { token: first.token, password: "injera-and-tea" }),
  ).rejects.toMatchObject({ code: "not_allowed", message: expect.stringMatching(/replaced/) });
  await expect(acceptInvitation(publicActor, { token: second.token, password: "injera-and-tea" })).resolves.toBeDefined();
});

test("someone who already has an account accepts with that account's password", async () => {
  const admin = await createPlatformAdmin();
  const saba = await createBrand(admin.actor, { name: "Saba House" });
  const tomoca = await createBrand(admin.actor, { name: "Tomoca" });
  const email = uniqueEmail("selam");
  const first = await inviteOwner(admin.actor, { brandId: saba.id, name: "Selam", contact: email });
  const { userId } = await acceptInvitation(publicActor, { token: first.token, password: "injera-and-tea" });

  const second = await inviteOwner(admin.actor, { brandId: tomoca.id, name: "Selam", contact: email });
  await expect(
    acceptInvitation(publicActor, { token: second.token, password: "a-different-password" }),
  ).rejects.toMatchObject({ code: "not_allowed", message: expect.stringMatching(/already has a Maasii account/) });
  await expect(acceptInvitation(publicActor, { token: second.token, password: "injera-and-tea" })).resolves.toEqual(
    expect.objectContaining({ userId }),
  );

  expect((await getMyAccess(staffActor(userId))).brands.map((b) => b.name).sort()).toEqual(["Saba House", "Tomoca"]);
});

test("a password shorter than 8 characters or an unreadable contact is refused", async () => {
  const admin = await createPlatformAdmin();
  const brand = await createBrand(admin.actor, { name: "Saba House" });
  const invitation = await inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact: uniqueEmail("s") });

  await expect(acceptInvitation(publicActor, { token: invitation.token, password: "short" })).rejects.toMatchObject({
    code: "invalid_input",
  });
  for (const contact of ["selam@", "12", "call me"]) {
    await expect(inviteOwner(admin.actor, { brandId: brand.id, name: "Selam", contact })).rejects.toMatchObject({
      code: "invalid_input",
    });
  }
});

test("only the platform admin can invite a brand's Owner", async () => {
  const s = await scenario().brand("Bilo's").build();

  for (const actor of [s.owner.actor, publicActor, staffActor(s.owner.userId)]) {
    await expect(
      inviteOwner(actor, { brandId: s.brand.id, name: "Mallory", contact: uniqueEmail("mallory") }),
    ).rejects.toMatchObject({ code: "not_allowed" });
  }
});

test("an unknown invitation link finds nothing", async () => {
  expect(await getInvitation(publicActor, { token: "no-such-invitation" })).toBeNull();
  await expect(
    acceptInvitation(publicActor, { token: "no-such-invitation", password: "injera-and-tea" }),
  ).rejects.toMatchObject({ code: "not_found" });
});
