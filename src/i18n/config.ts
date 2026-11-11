import type { Language } from "@/core";

export const locales: readonly Language[] = ["am", "en"];

/** Guests choose a language on their phone; staff have their own preference, Amharic by default. */
export type Area = "guest" | "staff";

/** Set by `src/proxy.ts` on every request so `request.ts` knows which area's language rules apply. */
export const AREA_HEADER = "x-maasii-area";

export const LANGUAGE_COOKIE: Record<Area, string> = { guest: "mx_guest_lang", staff: "mx_staff_lang" };
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Language {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** The Venue Link pages and the landing page belong to guests; every other page is a staff screen. */
export function areaOf(pathname: string): Area {
  return pathname === "/" || pathname.startsWith("/v/") ? "guest" : "staff";
}

/** The phone's own language from Accept-Language when it is Amharic or English, otherwise English. */
export function phoneLanguage(acceptLanguage: string | null): Language {
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().toLowerCase().split(";");
      const q = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)[0];
  return preferred?.tag.split("-")[0] === "am" ? "am" : "en";
}
