import { z } from "zod";
import { parseInput } from "./validation";

export const displayFonts = ["noto-sans-ethiopic", "noto-serif-ethiopic"] as const;
export type DisplayFont = (typeof displayFonts)[number];

export const brandColourInput = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex colour.").toUpperCase();
export const defaultBrandColour = "#1C1917";

const paper = "#FBF7F0";
const paperDeep = "#F3ECE0";
// The darker surface sets the limit. Paper text on a readable-colour button also meets it.
const maximumLuminance = (luminance(linearRgb(paperDeep)) + 0.05) / 4.5 - 0.05;

/** The original accent is decorative. Use `readable` on paper or behind paper-coloured text. */
export function deriveBrandTheme(colour: string) {
  const accent = parseInput(brandColourInput, colour);
  return { accent, readable: readableShade(accent), paper, paperDeep };
}

function readableShade(accent: string): string {
  const rgb = linearRgb(accent);
  if (luminance(rgb) <= maximumLuminance) return accent;

  const [lightness, a, b] = toOklab(rgb);
  for (let step = 1; step <= 100; step++) {
    const darkness = step / 100;
    // Soften chroma as lightness drops, keeping the original hue in Oklab.
    const chroma = 1 - 0.75 * darkness;
    const shade = toHex(fromOklab([lightness * (1 - darkness), a * chroma, b * chroma]));
    // Check the colour after conversion and rounding, since this is what the browser displays.
    if (luminance(linearRgb(shade)) <= maximumLuminance) return shade;
  }
  return "#000000";
}

type Channels = [number, number, number];

function linearRgb(hex: string): Channels {
  const linear = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return [linear(1), linear(3), linear(5)];
}

function luminance([r, g, b]: Channels): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Oklab conversion matrices from https://bottosson.github.io/posts/oklab/
function toOklab([r, g, b]: Channels): Channels {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function fromOklab([lightness, a, b]: Channels): Channels {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function toHex(rgb: Channels): string {
  const channels = rgb.map((linear) => {
    // ponytail: clip to sRGB here. Switch to hue-preserving gamut mapping if clipping shifts a Brand's hue visibly.
    const value = Math.min(1, Math.max(0, linear));
    const srgb = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255).toString(16).padStart(2, "0");
  });
  return `#${channels.join("").toUpperCase()}`;
}
