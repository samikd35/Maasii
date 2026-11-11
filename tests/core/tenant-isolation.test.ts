import { expect, test } from "vitest";
import {
  addTables,
  createVenue,
  getVenueLink,
  getVenueSetup,
  getVenueStaff,
  inviteManager,
  renumberTable,
  setTableActive,
} from "@/core";
import { asPerson } from "../support/database";
import { scenario } from "../support/scenario";
import { uniqueEmail } from "../support/users";

const site = { siteUrl: "https://maasii.app" };

test("another brand's Owner can neither read nor change a brand's Venues, Tables or staff through the core", async () => {
  const bilos = await scenario().brand("Bilo's").venue("Lancha", { tables: 2 }).manager("Hana").build();
  const saba = await scenario().brand("Saba House").build();
  const intruder = saba.owner.actor;
  const venueId = bilos.venue.id;
  const tableId = bilos.venue.tables[0].id;

  const attempts = [
    () => getVenueSetup(intruder, { venueId }),
    () => getVenueStaff(intruder, { venueId }),
    () => getVenueLink(intruder, { venueId, ...site }),
    () => createVenue(intruder, { brandId: bilos.brand.id, name: "Bole" }),
    () => inviteManager(intruder, { venueId, name: "Mallory", contact: uniqueEmail("mallory") }),
    () => addTables(intruder, { venueId, numbers: [3] }),
    () => renumberTable(intruder, { tableId, number: 9 }),
    () => setTableActive(intruder, { tableId, active: false }),
  ];
  for (const attempt of attempts) {
    await expect(attempt()).rejects.toMatchObject({ code: "not_allowed" });
  }

  expect((await getVenueSetup(bilos.owner.actor, { venueId })).tables).toEqual([
    { id: tableId, number: 1, active: true },
    expect.objectContaining({ number: 2, active: true }),
  ]);
});

test("row-level security alone hides another brand's memberships and invitations", async () => {
  const bilos = await scenario().brand("Bilo's").venue("Lancha").venue("Bole").manager("Hana").build();
  await inviteManager(bilos.owner.actor, { venueId: bilos.venues.Bole.id, name: "Abebe", contact: uniqueEmail("a") });
  const saba = await scenario().brand("Saba House").manager("Selam").build();

  const memberships = "select role, brand_id, venue_id from app.memberships";
  const invitations = "select venue_id from app.invitations";

  const venueIds = (rows: { venue_id?: string }[]) => rows.map((row) => row.venue_id).sort();

  // Saba's Owner sees only Saba's memberships and invitations.
  const sabaOwnerSees = await asPerson(saba.owner.userId, memberships);
  expect(sabaOwnerSees.rows.map((m) => m.brand_id ?? m.venue_id).sort()).toEqual(
    [saba.brand.id, saba.venue.id].sort(),
  );
  expect(venueIds((await asPerson(saba.owner.userId, invitations)).rows)).toEqual([saba.venue.id]);

  // Hana manages Lancha: she sees Lancha's staff, but not Bole's invitations or the brand's Owners.
  const hanaSees = await asPerson(bilos.managers.Hana.userId, memberships);
  expect(hanaSees.rows).toEqual([{ role: "manager", brand_id: null, venue_id: bilos.venues.Lancha.id }]);
  expect(venueIds((await asPerson(bilos.managers.Hana.userId, invitations)).rows)).toEqual([bilos.venues.Lancha.id]);

  expect(venueIds((await asPerson(bilos.owner.userId, invitations)).rows)).toEqual(
    [bilos.venues.Lancha.id, bilos.venues.Bole.id].sort(),
  );
});

test("row-level security alone stops staff changing another venue's Tables or another brand's Venues", async () => {
  const bilos = await scenario().brand("Bilo's").venue("Lancha", { tables: 1 }).venue("Bole", { tables: 1 }).manager("Hana").build();
  const saba = await scenario().brand("Saba House").build();
  const boleTable = bilos.venues.Bole.tables[0].id;
  const lanchaTable = bilos.venues.Lancha.tables[0].id;

  const renumber = "update app.tables set number = 99 where id = $1";
  expect((await asPerson(bilos.managers.Hana.userId, renumber, [boleTable])).rowCount).toBe(0);
  expect((await asPerson(saba.owner.userId, renumber, [lanchaTable])).rowCount).toBe(0);
  expect((await asPerson(bilos.managers.Hana.userId, renumber, [lanchaTable])).rowCount).toBe(1);

  await expect(
    asPerson(bilos.managers.Hana.userId, "insert into app.tables (venue_id, number) values ($1, 50)", [
      bilos.venues.Bole.id,
    ]),
  ).rejects.toThrow(/row-level security/);
  await expect(
    asPerson(saba.owner.userId, "insert into app.venues (brand_id, name, link_token) values ($1, 'Bole', 'evil-bole')", [
      bilos.brand.id,
    ]),
  ).rejects.toThrow(/row-level security/);
  await expect(
    asPerson(bilos.managers.Hana.userId, "insert into app.memberships (user_id, role, venue_id) values ($1, 'manager', $2)", [
      bilos.managers.Hana.userId,
      bilos.venues.Bole.id,
    ]),
  ).rejects.toThrow(/permission denied|row-level security/);
  await expect(
    asPerson(saba.owner.userId, "insert into app.brands (name) values ('Bilo''s Copy')"),
  ).rejects.toThrow(/row-level security/);
});
