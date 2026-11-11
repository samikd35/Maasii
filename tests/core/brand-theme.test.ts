import { expect, test } from "vitest";
import { createBrand, createVenue, deriveBrandTheme, getPublishedMenu, publicActor, systemActor } from "@/core";

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
