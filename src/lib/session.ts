import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminActor, MaasiiError, staffActor, type Actor } from "@/core";
import type { Messages } from "@/i18n/messages";
import { createSessionClient } from "@/lib/supabase/server";

/** The signed-in person's user id, verified from the session token, or null. */
export async function signedInUserId(): Promise<string | null> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.is_anonymous) return null;
  return claims.sub;
}

/** The signed-in staff member as an actor, or a redirect to the sign-in screen. */
export async function requireStaff(): Promise<Actor> {
  const userId = await signedInUserId();
  if (!userId) redirect("/sign-in");
  return staffActor(userId);
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

export type FormState = {
  error?: keyof Messages["StaffErrors"];
  done?: { key: keyof Messages["StaffForms"]; values?: Record<string, string | number> };
  link?: string;
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
