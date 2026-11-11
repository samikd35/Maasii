import pg from "pg";
import type { Actor } from "./actor";

export type Tx = pg.PoolClient;

const globalForPool = globalThis as unknown as { maasiiPool?: pg.Pool };

function pool(): pg.Pool {
  if (!globalForPool.maasiiPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Run `pnpm db:start`, which writes .env.local.");
    }
    globalForPool.maasiiPool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
  }
  return globalForPool.maasiiPool;
}

/** Serialize Shift and Table changes with Send and Accept at this Venue. */
export async function lockVenueShifts(tx: Tx, venueId: string): Promise<void> {
  // ponytail: one lock per Venue, finer table locks if simultaneous reassignments become frequent.
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [venueId]);
}

/** Runs `work` in one database transaction, acting as `actor` for every statement. */
export async function inTransaction<T>(actor: Actor, work: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await pool().connect();
  try {
    await tx.query("begin");
    await actAs(tx, actor);
    const result = await work(tx);
    await tx.query("commit");
    return result;
  } catch (error) {
    await tx.query("rollback").catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}

async function actAs(tx: Tx, actor: Actor): Promise<void> {
  switch (actor.kind) {
    case "public":
      await tx.query("select set_config('role', 'anon', true)");
      return;
    case "staff":
    case "admin":
    case "guest": {
      const claims = {
        sub: actor.userId,
        role: "authenticated",
        is_anonymous: actor.kind === "guest",
        session_id: actor.kind === "staff" ? actor.sessionId : undefined,
      };
      await tx.query(
        "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)",
        [JSON.stringify(claims)],
      );
      return;
    }
    case "system":
      return;
  }
}
