import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createBrand, createVenue, deriveBrandTheme, getBranding, getPublishedMenu, publicActor, systemActor, updateBranding } from "@/core";
import { scenario } from "../support/scenario";

test("the Venue Link returns its Brand's artwork, display font and readable orange", async () => {
  const brand = await createBrand(systemActor, {
    name: "Bilo's Pastry",
    logoUrl: "/brands/bilos/logo.webp",
    coverUrl: "/brands/bilos/almond-cake.webp",
    colour: "#ec6728",
    displayFont: "noto-sans-ethiopic",
  });
  const venue = await createVenue(systemActor, { brandId: brand.id, name: "Lancha" });

  const menu = await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken });

  expect(menu?.brand).toMatchObject({
    logoUrl: "/brands/bilos/logo.webp",
    coverUrl: "/brands/bilos/almond-cake.webp",
    colour: "#EC6728",
    displayFont: "noto-sans-ethiopic",
  });
  expect(menu?.theme.accent).toBe("#EC6728");
  const readable = rgb(menu!.theme.readable);
  const reference = rgb("#B4461A");
  expect(Math.hypot(...readable.map((channel, i) => channel - reference[i]))).toBeLessThan(20);
  expect(contrast(menu!.theme.readable, menu!.theme.paperDeep)).toBeGreaterThanOrEqual(4.5);
});

test("readable Brand colours have at least 4.5:1 contrast with both paper backgrounds", () => {
  const channels = ["00", "11", "55", "7F", "AA", "EE", "FF"];
  for (const red of channels) {
    for (const green of channels) {
      for (const blue of channels) {
        const accent = `#${red}${green}${blue}`;
        const theme = deriveBrandTheme(accent);
        expect(theme.accent).toBe(accent);
        for (const paper of [theme.paper, theme.paperDeep]) {
          expect(contrast(theme.readable, paper), `${accent} against ${paper}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  }
  expect(deriveBrandTheme("#244638").readable).toBe("#244638");
});

test("a Brand cannot be created with an unrecognised font or an invalid colour", async () => {
  await expect(createBrand(systemActor, { name: "Saba House", colour: "red" })).rejects.toMatchObject({ code: "invalid_input" });
  // @ts-expect-error Simulate an untyped caller sending a font outside the curated list.
  await expect(createBrand(systemActor, { name: "Saba House", displayFont: "Papyrus" })).rejects.toMatchObject({ code: "invalid_input" });
});

test("an Owner's branding takes effect at every Venue without publishing the Menu", async () => {
  const s = await scenario().venue("Lancha").venue("Bole").publishedMenu().build();

  await updateBranding(s.owner.actor, {
    brandId: s.brand.id,
    colour: "#ec6728",
    displayFont: "noto-serif-ethiopic",
  });

  for (const venue of Object.values(s.venues)) {
    const menu = await getPublishedMenu(publicActor, { venueLinkToken: venue.linkToken });
    expect(menu?.brand).toMatchObject({ colour: "#EC6728", displayFont: "noto-serif-ethiopic" });
    expect(menu?.sections[0]?.dishes[0]?.name).toBe("Omelette");
  }
});

test("only an Owner of the Brand can open or change its branding settings", async () => {
  const s = await scenario().manager("Hana").build();
  const other = await scenario().build();
  const fields = { brandId: s.brand.id, colour: "#EC6728", displayFont: "noto-serif-ethiopic" } as const;

  for (const actor of [publicActor, s.managers.Hana.actor, other.owner.actor]) {
    await expect(getBranding(actor, { brandId: s.brand.id })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(updateBranding(actor, fields)).rejects.toMatchObject({ code: "not_allowed" });
  }
  await expect(getBranding(s.owner.actor, { brandId: s.brand.id })).resolves.toEqual(s.brand);
});

test("branding accepts raster artwork and rejects corrupt, mismatched and oversized files before saving", async () => {
  const s = await scenario().build();
  const fields = { brandId: s.brand.id, colour: "#EC6728", displayFont: "noto-serif-ethiopic" } as const;
  const logoBytes = readFileSync(new URL("../../public/brands/bilos/logo.webp", import.meta.url));
  const logo = new File([logoBytes], "logo.webp", { type: "image/webp" });
  const invalidCovers = [
    new File([logoBytes.subarray(0, 20)], "broken.webp", { type: "image/webp" }),
    new File([logoBytes], "wrong.png", { type: "image/png" }),
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.webp", { type: "image/webp" }),
  ];
  for (const cover of invalidCovers) {
    await expect(updateBranding(s.owner.actor, { ...fields, logo, cover })).rejects.toMatchObject({
      code: "invalid_input", reason: "invalidBrandArtwork",
    });
  }
  await expect(getBranding(s.owner.actor, { brandId: s.brand.id })).resolves.toEqual(s.brand);

  await updateBranding(s.owner.actor, { ...fields, logo });
  await updateBranding(s.owner.actor, { ...fields, colour: "#244638" });
  const menu = await getPublishedMenu(publicActor, { venueLinkToken: s.venue.linkToken });
  expect(menu?.brand.logoUrl).toBeTruthy();
  const response = await fetch(menu!.brand.logoUrl!);
  expect(response.ok).toBe(true);
  expect(response.headers.get("content-type")).toBe("image/webp");
});

// WCAG 2.2 relative luminance and contrast ratio: https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
function contrast(first: string, second: string) {
  const luminance = (colour: string) => rgb(colour).reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  }, 0);
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function rgb(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
