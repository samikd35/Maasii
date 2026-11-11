import { guestActor } from "@/core";
import { createSessionClient } from "./server";

export async function guestSession() {
  const supabase = await createSessionClient({ guest: true });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const actor = claims?.is_anonymous && claims.sub ? guestActor(claims.sub) : null;
  return { supabase, actor, expiresAt: claims?.exp ?? 0 };
}
