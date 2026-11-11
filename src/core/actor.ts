/**
 * Who is calling the Maasii core. Every command and query takes an Actor as its first argument,
 * and runs its database work as that actor, so row-level security always applies.
 */
export type Actor =
  /** Anyone without a session, such as a guest browsing a menu. Runs as the `anon` role. */
  | { kind: "public" }
  /** A signed-in staff member. Their roles come from memberships in the database, not from the token. */
  | StaffActor
  /** An anonymous Supabase identity created on first Send. */
  | GuestActor
  /**
   * A signed-in person working in the platform admin area. The core still checks that they are a
   * platform admin in the database; the actor only says which hat they are wearing.
   */
  | { kind: "admin"; userId: string }
  /** A platform admin opening the read-only support view. */
  | { kind: "support"; userId: string }
  /** Seeding and scheduled jobs. Runs as `postgres` and bypasses row-level security. */
  | { kind: "system" };

export type GuestActor = { kind: "guest"; userId: string };
export type StaffActor = { kind: "staff"; userId: string; sessionId?: string };

export const publicActor: Actor = { kind: "public" };
export const systemActor: Actor = { kind: "system" };
export const guestActor = (userId: string): GuestActor => ({ kind: "guest", userId });
export const staffActor = (userId: string, sessionId?: string): StaffActor => ({ kind: "staff", userId, sessionId });
export const adminActor = (userId: string): Actor => ({ kind: "admin", userId });
export const adminSupportActor = (userId: string): Actor => ({ kind: "support", userId });
