import { addPlatformAdmin, adminActor, staffActor, systemActor, type Actor } from "@/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type TestUser = { userId: string; email: string; password: string; actor: Actor };

export const TEST_PASSWORD = "table-service-2026";

/** Creates a real Supabase Auth user with a unique email, so parallel tests never collide. */
export async function createStaffUser(label: string): Promise<TestUser> {
  const email = uniqueEmail(label);
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return { userId: data.user.id, email, password: TEST_PASSWORD, actor: staffActor(data.user.id) };
}

/** A real Auth user who is a platform admin, acting with the platform admin actor. */
export async function createPlatformAdmin(): Promise<TestUser> {
  const user = await createStaffUser("admin");
  await addPlatformAdmin(systemActor, { userId: user.userId });
  return { ...user, actor: adminActor(user.userId) };
}

export function uniqueEmail(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID()}@test.local`;
}

/** A unique Ethiopian mobile number in E.164 form, such as +251912345678. */
export function uniquePhone(): string {
  return `+2519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}
