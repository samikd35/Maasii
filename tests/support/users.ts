import { staffActor, type Actor } from "@/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type TestUser = { userId: string; email: string; actor: Actor };

/** Creates a real Supabase Auth user with a unique email, so parallel tests never collide. */
export async function createStaffUser(label: string): Promise<TestUser> {
  const email = `${label.toLowerCase()}-${crypto.randomUUID()}@test.local`;
  const { data, error } = await createAdminClient().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return { userId: data.user.id, email, actor: staffActor(data.user.id) };
}
