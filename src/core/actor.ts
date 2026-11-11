/**
 * Who is calling the Maasii core. Every command and query takes an Actor as its first argument,
 * and runs its database work as that actor, so row-level security always applies.
 */
export type Actor =
  /** Anyone without a session, such as a guest browsing a menu. Runs as the `anon` role. */
  | { kind: "public" }
  /** A signed-in staff member. Their roles come from memberships in the database, not from the token. */
  | StaffActor
  /**
   * A signed-in person working in the platform admin area. The core still checks that they are a
   * platform admin in the database; the actor only says which hat they are wearing.
   */
  | { kind: "admin"; userId: string }
  /** Seeding and scheduled jobs. Runs as `postgres` and bypasses row-level security. */
  | { kind: "system" };

export type StaffActor = { kind: "staff"; userId: string; sessionId?: string };

export const publicActor: Actor = { kind: "public" };
export const systemActor: Actor = { kind: "system" };
export const staffActor = (userId: string, sessionId?: string): StaffActor => ({ kind: "staff", userId, sessionId });
export const adminActor = (userId: string): Actor => ({ kind: "admin", userId });
