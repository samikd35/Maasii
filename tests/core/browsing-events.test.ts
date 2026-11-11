import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect, test } from "vitest";
import { publicActor, recordBrowsingEvent } from "@/core";
import { asPerson } from "../support/database";
import { scenario } from "../support/scenario";

test("browsing records only the Venue, kind, Dish, time and page-load identifier", async () => {
  const { venue, dishId } = await scenario().publishedMenu().build();
  const pageLoadId = randomUUID();
  const nextPageLoadId = randomUUID();
  const now = new Date("2026-11-11T09:00:00Z");
  const later = new Date("2026-11-11T09:01:00Z");
  const venueLinkToken = venue.linkToken;
  const omelette = dishId("Omelette");

  const menuOpen = { venueLinkToken, event: { kind: "menu_opened", pageLoadId } };
  const dishOpen = { venueLinkToken, event: { kind: "dish_opened", dishId: omelette, pageLoadId } };
  await recordBrowsingEvent(publicActor, menuOpen, { now });
  await recordBrowsingEvent(publicActor, menuOpen, { now: later });
  await recordBrowsingEvent(publicActor, dishOpen, { now });
  await recordBrowsingEvent(publicActor, dishOpen, { now: later });
  await recordBrowsingEvent(publicActor, { venueLinkToken, event: { kind: "menu_opened", pageLoadId: nextPageLoadId } }, { now: later });

  // Inspect the persisted events as Postgres because there is no application read path in v1.
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      "select * from app.browsing_events where venue_id = $1 order by kind desc, occurred_at",
      [venue.id],
    );
    expect(rows).toEqual([
      { venue_id: venue.id, kind: "menu_opened", dish_id: null, occurred_at: now, page_load_id: pageLoadId },
      { venue_id: venue.id, kind: "menu_opened", dish_id: null, occurred_at: later, page_load_id: nextPageLoadId },
      { venue_id: venue.id, kind: "dish_opened", dish_id: omelette, occurred_at: now, page_load_id: pageLoadId },
      { venue_id: venue.id, kind: "dish_opened", dish_id: omelette, occurred_at: later, page_load_id: pageLoadId },
    ]);
  } finally {
    await db.end();
  }
});

test("browsing writes are anonymous and scoped to the Venue's published Menu", async () => {
  const s = await scenario().publishedMenu().build();
  const other = await scenario().publishedMenu().build();
  const venueLinkToken = s.venue.linkToken;
  const event = { kind: "menu_opened", pageLoadId: randomUUID() };

  await expect(recordBrowsingEvent(publicActor, { venueLinkToken, event: { ...event, deviceId: randomUUID() } }))
    .rejects.toMatchObject({ code: "invalid_input" });
  await expect(recordBrowsingEvent(publicActor, {
    venueLinkToken,
    event: { ...event, kind: "dish_opened", dishId: other.dishId("Omelette") },
  })).rejects.toMatchObject({ code: "not_found" });
  await expect(recordBrowsingEvent(s.owner.actor, { venueLinkToken, event }))
    .rejects.toMatchObject({ code: "not_allowed" });
  await expect(asPerson(s.owner.userId, "select * from app.browsing_events"))
    .rejects.toMatchObject({ code: "42501" });
});
