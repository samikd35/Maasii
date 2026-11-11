import { expect, test } from "vitest";
import { createVenue, getMyAccess, getPublishedMenu, getVenueSetup, publicActor } from "@/core";
import { scenario } from "../support/scenario";

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
