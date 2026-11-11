"use server";

import { cookies } from "next/headers";
import { isLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, type Area } from "./config";

/**
 * The guest language switch without JavaScript (with it, `LanguageForm` sets the same cookie).
 * The cookie covers every Venue Link, so the choice follows the phone to any venue.
 */
export async function setGuestLanguage(formData: FormData) {
  await setLanguage("guest", formData);
}

export async function setStaffLanguage(formData: FormData) {
  await setLanguage("staff", formData);
}

async function setLanguage(area: Area, formData: FormData) {
  const language = formData.get("language");
  if (!isLocale(language)) return;
  (await cookies()).set(LANGUAGE_COOKIE[area], language, {
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
}
