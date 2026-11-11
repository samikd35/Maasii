import localFont from "next/font/local";

// Noto Sans Ethiopic, one static weight (400) of Google Fonts' Ethiopic subset only, about 73 KB
// (the variable font is 193 KB and would break the guest page budget). Licence: OFL.txt.
// The unicode-range means only pages that show Ethiopic text download it, and there is no
// preload, so English pages never fetch it. Latin text keeps the system fonts. Ethiopic glyphs set
// small next to Latin ones at the same size, so size-adjust scales them up for body and heading text.
export const ethiopic = localFont({
  src: "./noto-sans-ethiopic-400-ethiopic.woff2",
  weight: "400",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-ethiopic",
  declarations: [
    { prop: "size-adjust", value: "108%" },
    {
      prop: "unicode-range",
      value: "U+30E, U+1200-1399, U+2D80-2DDE, U+AB01-AB2E, U+1E7E0-1E7E6, U+1E7E8-1E7EB, U+1E7ED-1E7EE, U+1E7F0-1E7FE",
    },
  ],
});
