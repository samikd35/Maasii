import { expect, test } from "vitest";
import {
  acceptInvitation,
  createVenue,
  getInvitation,
  getMyAccess,
  getPublishedMenu,
  getVenueSetup,
  getVenueStaff,
  inviteManager,
  publicActor,
  staffActor,
} from "@/core";
import { scenario } from "../support/scenario";
import { signInWithPassword } from "../support/sign-in";
import { uniqueEmail } from "../support/users";

test("an Owner creates a Venue, which opens the brand's Menu at its own Venue Link", async () => {
  const s = await scenario().brand("Bilo's Pastry").publishedMenu().build();

  const bole = await createVenue(s.owner.actor, { brandId: s.brand.id, name: "Bole" });

  expect(bole.linkToken).toMatch(/^bilos-pastry-bole-[a-z0-9]{4}$/);
  expect(await getVenueSetup(s.owner.actor, { venueId: bole.id })).toMatchObject({
    venue: { id: bole.id, name: "Bole", linkToken: bole.linkToken },
    brand: { id: s.brand.id, name: "Bilo's Pastry" },
    tables: [],
  });
  expect((await getMyAccess(s.owner.actor)).brands[0].venues.map((v) => v.name)).toEqual(["Bole", "Lancha"]);
  expect((await getPublishedMenu(publicActor, { venueLinkToken: bole.linkToken }))?.sections).toHaveLength(2);
});

test("an Owner invites a Manager for one Venue, who signs in and manages only that Venue", async () => {
  const s = await scenario().brand("Bilo's").venue("Lancha").venue("Bole").build();
  const email = uniqueEmail("hana");

  const invitation = await inviteManager(s.owner.actor, { venueId: s.venues.Bole.id, name: "Hana", contact: email });
  expect(await getInvitation(publicActor, { token: invitation.token })).toMatchObject({
    role: "manager",
    brand: { name: "Bilo's" },
    venue: { name: "Bole" },
  });
  const { userId } = await acceptInvitation(publicActor, { token: invitation.token, password: "macchiato-2026" });
  const hana = staffActor(await signInWithPassword({ email, password: "macchiato-2026" }));

  expect(await getMyAccess(hana)).toMatchObject({
    userId,
    name: "Hana",
    brands: [],
    venues: [{ id: s.venues.Bole.id, name: "Bole", brandName: "Bilo's", role: "manager" }],
  });
  expect(await getVenueSetup(hana, { venueId: s.venues.Bole.id })).toMatchObject({ isOwner: false });
  await expect(getVenueSetup(hana, { venueId: s.venues.Lancha.id })).rejects.toMatchObject({ code: "not_allowed" });
  await expect(createVenue(hana, { brandId: s.brand.id, name: "Sarbet" })).rejects.toMatchObject({
    code: "not_allowed",
  });
  await expect(
    inviteManager(hana, { venueId: s.venues.Bole.id, name: "Abebe", contact: uniqueEmail("abebe") }),
  ).rejects.toMatchObject({ code: "not_allowed" });
});

test("the Owner sees each Venue's Managers and the invitations still waiting", async () => {
  const s = await scenario().brand("Bilo's").venue("Lancha").manager("Hana").build();
  const waiting = await inviteManager(s.owner.actor, { venueId: s.venue.id, name: "Abebe", contact: "0911 223 344" });

  expect(await getVenueStaff(s.owner.actor, { venueId: s.venue.id })).toEqual({
    managers: [{ userId: s.managers.Hana.userId, name: "Hana" }],
    invitations: [
      { invitationId: waiting.invitationId, name: "Abebe", contact: "+251911223344", expiresAt: waiting.expiresAt },
    ],
  });
  await expect(getVenueStaff(s.managers.Hana.actor, { venueId: s.venue.id })).resolves.toBeDefined();
});

test("only the brand's Owner can create its Venues", async () => {
  const bilos = await scenario().brand("Bilo's").build();
  const saba = await scenario().brand("Saba House").build();

  for (const actor of [saba.owner.actor, publicActor]) {
    await expect(createVenue(actor, { brandId: bilos.brand.id, name: "Bole" })).rejects.toMatchObject({
      code: "not_allowed",
    });
  }
  await expect(createVenue(bilos.owner.actor, { brandId: bilos.brand.id, name: " " })).rejects.toMatchObject({
    code: "invalid_input",
  });
});
