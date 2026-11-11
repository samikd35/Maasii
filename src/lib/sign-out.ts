"use server";

import { redirect } from "next/navigation";
import { removeWaiterPushSubscription } from "@/core";
import { getSessionActor, setWaiterUnlockToken } from "@/lib/session";
import { createSessionClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const actor = await getSessionActor();
  if (actor) await removeWaiterPushSubscription(actor);
  await setWaiterUnlockToken("");
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
