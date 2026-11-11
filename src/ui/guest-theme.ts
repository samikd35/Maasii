import type { CSSProperties } from "react";
import { serifEthiopic, serifLatin } from "@/app/fonts";
import type { deriveBrandTheme, DisplayFont } from "@/core/browser";

export const displayFontClasses: Record<DisplayFont, string> = {
  "noto-sans-ethiopic": "", // Inherits the default face from the root layout.
  "noto-serif-ethiopic": `${serifEthiopic.variable} ${serifLatin.variable}`,
};

export function brandThemeStyle(theme: ReturnType<typeof deriveBrandTheme>): CSSProperties {
  return {
    "--color-paper": theme.paper,
    "--color-paper-deep": theme.paperDeep,
    "--color-brand-accent": theme.accent,
    "--color-brand-readable": theme.readable,
  } as CSSProperties;
}
