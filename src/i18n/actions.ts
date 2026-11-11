"use server";

import { cookies } from "next/headers";
import { isLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from "./config";

/**
 * The guest language switch without JavaScript (with it, `LanguageForm` sets the same cookie).
 * The cookie covers every Venue Link, so the choice follows the phone to any venue.
 */
export async function setGuestLanguage(formData: FormData) {
  const language = formData.get("language");
  if (!isLocale(language)) return;
  (await cookies()).set(LANGUAGE_COOKIE.guest, language, {
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  });
}
