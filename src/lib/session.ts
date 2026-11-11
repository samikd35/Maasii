import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminActor, hasAuthSession, MaasiiError, staffActor, updateStaffLanguage, type Actor, type StaffActor } from "@/core";
import { isLocale, LANGUAGE_COOKIE } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { createSessionClient } from "@/lib/supabase/server";

/** The verified Supabase identity. Waiter access still requires the device's PIN unlock. */
export const getSessionActor = cache(async (): Promise<StaffActor | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.is_anonymous) return null;
  const actor = staffActor(claims.sub, typeof claims.session_id === "string" ? claims.session_id : undefined);
  return await hasAuthSession(actor) ? actor : null;
});

export async function signedInUserId(): Promise<string | null> {
  return (await getSessionActor())?.userId ?? null;
}

/** The signed-in staff member as an actor, or a redirect to the sign-in screen. */
export async function requireStaff(): Promise<Actor> {
  const actor = await getSessionActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

/** The signed-in person in the platform admin area. The core checks they really are an admin. */
export async function requireAdmin(): Promise<Actor> {
  const userId = await signedInUserId();
  if (!userId) redirect("/sign-in");
  return adminActor(userId);
}

/** The address this app is served from, for Venue Links and invitation links. */
export async function siteUrl(): Promise<string> {
  if (process.env.MAASII_SITE_URL) return process.env.MAASII_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Adopt an explicit pre-sign-in choice only if this person has never saved a preference. */
export async function rememberStaffLanguage(actor: StaffActor) {
  const store = await cookies();
  const language = store.get(LANGUAGE_COOKIE.staff)?.value;
  if (isLocale(language)) await updateStaffLanguage(actor, { language, ifUnset: true });
  store.delete(LANGUAGE_COOKIE.staff);
}

const WAITER_UNLOCK_COOKIE = "mx_waiter_unlock";

export async function waiterUnlockToken(): Promise<string | undefined> {
  return (await cookies()).get(WAITER_UNLOCK_COOKIE)?.value;
}

/** Browser-session cookie. The core also checks its expiry against the enrolled Auth session. */
export async function setWaiterUnlockToken(token: string) {
  (await cookies()).set(WAITER_UNLOCK_COOKIE, token, {
    path: "/staff",
    httpOnly: true,
    sameSite: "lax",
    secure: (await headers()).get("x-forwarded-proto") === "https",
    ...(token ? {} : { maxAge: 0 }),
  });
}

export type FormState = {
  error?: keyof Messages["StaffErrors"];
  done?: { key: keyof Messages["StaffForms"]; values?: Record<string, string | number> };
  link?: string;
  qr?: string;
} | undefined;

/**
 * Runs a core command for a form. A refusal from the core becomes a message for the person;
 * anything else is a bug or an outage and is thrown.
 */
export async function forForm(work: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await work()) ?? {};
  } catch (error) {
    if (error instanceof MaasiiError) return { error: error.reason ?? error.code };
    throw error;
  }
}
