import jsQR from "jsqr";
import { PNG } from "pngjs";
import { expect, test } from "vitest";
import { getVenueLink, publicActor } from "@/core";
import { scenario } from "../support/scenario";

function decodeQr(png: Uint8Array): string | undefined {
  const image = PNG.sync.read(Buffer.from(png));
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data;
}

test("an Owner and the Venue's Manager get the Venue Link and a QR image that opens it", async () => {
  const s = await scenario().brand("Bilo's").venue("Lancha").manager("Hana").build();

  for (const actor of [s.owner.actor, s.managers.Hana.actor]) {
    const link = await getVenueLink(actor, { venueId: s.venue.id, siteUrl: "https://maasii.app" });

    expect(link.url).toBe(`https://maasii.app/v/${s.venue.linkToken}`);
    expect(link.qrFileName).toBe(`${s.venue.linkToken}-qr.png`);
    expect(decodeQr(link.qrPng)).toBe(link.url);
  }
});

test("the Venue Link follows the site it is served from", async () => {
  const s = await scenario().build();

  const link = await getVenueLink(s.owner.actor, { venueId: s.venue.id, siteUrl: "http://127.0.0.1:4123/" });

  expect(link.url).toBe(`http://127.0.0.1:4123/v/${s.venue.linkToken}`);
});

test("nobody outside the Venue gets its QR image", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").manager("Hana", { venue: "Bole" }).build();
  const other = await scenario().build();

  for (const actor of [s.managers.Hana.actor, other.owner.actor, publicActor]) {
    await expect(
      getVenueLink(actor, { venueId: s.venues.Lancha.id, siteUrl: "https://maasii.app" }),
    ).rejects.toMatchObject({ code: "not_allowed" });
  }
});
