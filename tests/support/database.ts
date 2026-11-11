import pg from "pg";

let pool: pg.Pool | undefined;

/**
 * Runs SQL directly against the database as a signed-in person, the way a live subscription or a
 * future direct read would, so tests can show what row-level security alone lets them see or change.
 * The transaction is always rolled back.
 */
export async function asPerson<T extends pg.QueryResultRow>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, allowExitOnIdle: true });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)",
      [JSON.stringify({ sub: userId, role: "authenticated", is_anonymous: false })],
    );
    return await client.query<T>(sql, params);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}
