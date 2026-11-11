import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getStaffLanguage, type Language } from "@/core";
import { getSessionActor } from "@/lib/session";
import { AREA_HEADER, isLocale, LANGUAGE_COOKIE, phoneLanguage } from "./config";
import { messages } from "./messages";

export default getRequestConfig(async ({ locale }) => {
  const language = isLocale(locale) ? locale : await requestLanguage();
  return { locale: language, timeZone: "Africa/Addis_Ababa", messages: messages[language] };
});

async function requestLanguage(): Promise<Language> {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  const area = requestHeaders.get(AREA_HEADER) === "staff" ? "staff" : "guest";
  if (area === "staff") {
    const actor = await getSessionActor();
    if (actor) return getStaffLanguage(actor);
  }
  const chosen = requestCookies.get(LANGUAGE_COOKIE[area])?.value;
  if (isLocale(chosen)) return chosen;
  return area === "staff" ? "am" : phoneLanguage(requestHeaders.get("accept-language"));
}
