import { z } from "zod";
import { requireVenueManager } from "./access";
import type { Actor } from "./actor";
import { findVenue, type Table } from "./brands";
import { inTransaction, type Tx } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

const idInput = z.uuid().transform((id) => id.toLowerCase());
const venueInput = z.object({ venueId: idInput });
const usualTablesInput = venueInput.extend({ waiterId: idInput, tableIds: z.array(idInput) });
const assignmentInput = z.object({ tableId: idInput, waiterId: idInput });
const startShiftInput = venueInput.extend({ assignments: z.array(assignmentInput) });
const shiftTarget = venueInput.extend({ shiftId: idInput });
const reassignInput = shiftTarget.extend(assignmentInput.shape);
const shiftFields = 'id, venue_id as "venueId", started_at as "startedAt", ended_at as "endedAt"';

export type Shift = { id: string; venueId: string; startedAt: Date; endedAt: Date | null };
type ShiftWaiter = { id: string; name: string; usualTableIds: string[] };
type ShiftTable = Table & { waiterId: string | null };

export async function setUsualTables(actor: Actor, input: z.input<typeof usualTablesInput>): Promise<void> {
  const { venueId, waiterId, tableIds } = parseInput(usualTablesInput, input);
  await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    await lockVenueShifts(tx, venueId);
    await requireActiveWaiters(tx, venueId, [waiterId]);
    const tables = [...new Set(tableIds)];
    await requireActiveTables(tx, venueId, tables);
    await tx.query("delete from app.usual_tables where venue_id = $1 and waiter_id = $2", [venueId, waiterId]);
    await tx.query(
      `insert into app.usual_tables (venue_id, waiter_id, table_id)
       select $1, $2, id from unnest($3::uuid[]) as id`,
      [venueId, waiterId, tables],
    );
  });
}

export async function getShiftSetup(actor: Actor, input: z.input<typeof venueInput>) {
  const { venueId } = parseInput(venueInput, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    const venue = await findVenue(tx, venueId);
    await lockVenueShifts(tx, venueId);
    const { rows: waiters } = await tx.query<ShiftWaiter>(
      `select m.id, m.name, array(
         select t.id from app.usual_tables u join app.tables t on t.id = u.table_id
         where u.venue_id = $1 and u.waiter_id = m.id and t.active order by t.number
       ) as "usualTableIds"
       from app.memberships m
       where m.venue_id = $1 and m.role = 'waiter' and m.active order by m.name, m.created_at, m.id`,
      [venueId],
    );
    const { rows: activeTables } = await tx.query<Table>(
      "select id, number from app.tables where venue_id = $1 and active order by number",
      [venueId],
    );
    const shift = await findOpenShift(tx, venueId);
    const assignments = shift ? await openTableAssignments(tx, venueId, shift.id) : suggestAssignments(waiters);
    const tables: ShiftTable[] = activeTables.map((table) => ({ ...table, waiterId: assignments.get(table.id) ?? null }));
    const unassignedTables = activeTables.filter(({ id }) => !assignments.get(id));
    return { venue, shift, waiters, tables, unassignedTables };
  });
}

function suggestAssignments(waiters: ShiftWaiter[]): Map<string, string | null> {
  const suggested = new Map<string, string | null>();
  for (const waiter of waiters) {
    for (const tableId of waiter.usualTableIds) {
      suggested.set(tableId, suggested.has(tableId) ? null : waiter.id);
    }
  }
  return suggested;
}

async function openTableAssignments(tx: Tx, venueId: string, shiftId: string): Promise<Map<string, string>> {
  const { rows } = await tx.query<{ tableId: string; waiterId: string }>(
    `select table_id as "tableId", waiter_id as "waiterId" from app.table_assignments
     where venue_id = $1 and shift_id = $2 and ended_at is null`,
    [venueId, shiftId],
  );
  return new Map(rows.map(({ tableId, waiterId }) => [tableId, waiterId]));
}

export async function startShift(
  actor: Actor,
  input: z.input<typeof startShiftInput>,
  { now }: { now?: Date } = {},
): Promise<Shift> {
  const { venueId, assignments } = parseInput(startShiftInput, input);
  const tableIds = assignments.map(({ tableId }) => tableId);
  if (new Set(tableIds).size !== tableIds.length) {
    throw new MaasiiError("invalid_input", "A Table can have only one Waiter at a time.");
  }
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    await lockVenueShifts(tx, venueId);
    if (await findOpenShift(tx, venueId)) {
      throw new MaasiiError("invalid_input", "A Shift is already running at this Venue.", "shiftAlreadyRunning");
    }
    const at = now ?? new Date();
    const { rows: [previous] } = await tx.query<{ endedAt: Date | null }>(
      `select max(ended_at) as "endedAt" from app.shifts where venue_id = $1`,
      [venueId],
    );
    if (previous.endedAt && at < previous.endedAt) {
      throw new MaasiiError("invalid_input", "A Shift cannot start before the previous Shift ended.");
    }
    const waiterIds = assignments.map(({ waiterId }) => waiterId);
    await requireActiveTables(tx, venueId, tableIds);
    await requireActiveWaiters(tx, venueId, waiterIds);
    const { rows: [shift] } = await tx.query<Shift>(
      `insert into app.shifts (venue_id, started_at) values ($1, $2) returning ${shiftFields}`,
      [venueId, at],
    );
    await tx.query(
      `insert into app.table_assignments (venue_id, shift_id, table_id, waiter_id, started_at)
       select $1, $2, table_id, waiter_id, $3 from unnest($4::uuid[], $5::uuid[]) as a(table_id, waiter_id)`,
      [venueId, shift.id, at, tableIds, waiterIds],
    );
    return shift;
  });
}

async function findOpenShift(tx: Tx, venueId: string): Promise<Shift | null> {
  const { rows } = await tx.query<Shift>(
    `select ${shiftFields} from app.shifts where venue_id = $1 and ended_at is null`,
    [venueId],
  );
  return rows[0] ?? null;
}

export async function getRunningShift(actor: Actor, input: { venueId: string; at?: Date }): Promise<Shift | null> {
  const { venueId, at } = parseInput(venueInput.extend({ at: z.date().optional() }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    return findRunningShift(tx, venueId, at ?? new Date());
  });
}

/** Resolve service state inside the caller's authorized transaction. */
export async function findRunningShift(tx: Tx, venueId: string, at: Date): Promise<Shift | null> {
  const { rows } = await tx.query<Shift>(
    `select ${shiftFields} from app.shifts
     where venue_id = $1 and started_at <= $2 and (ended_at is null or ended_at > $2)
     order by started_at desc limit 1`,
    [venueId, at],
  );
  return rows[0] ?? null;
}

export async function reassignTable(
  actor: Actor,
  input: z.input<typeof reassignInput>,
  { now }: { now?: Date } = {},
): Promise<void> {
  const { venueId, shiftId, tableId, waiterId } = parseInput(reassignInput, input);
  await inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    await lockVenueShifts(tx, venueId);
    const shift = await requireOpenShift(tx, venueId, shiftId);
    const at = now ?? new Date();
    await requireActiveTables(tx, venueId, [tableId]);
    await requireActiveWaiters(tx, venueId, [waiterId]);
    const { rows: [previous] } = await tx.query<{
      id: string; waiterId: string; startedAt: Date; endedAt: Date | null;
    }>(
      `select id, waiter_id as "waiterId", started_at as "startedAt", ended_at as "endedAt"
       from app.table_assignments where venue_id = $1 and shift_id = $2 and table_id = $3
       order by started_at desc, ended_at desc limit 1`,
      [venueId, shiftId, tableId],
    );
    if (at < (previous?.endedAt ?? previous?.startedAt ?? shift.startedAt)) {
      throw new MaasiiError("invalid_input", "A Table Assignment cannot start before the last change.");
    }
    if (previous && previous.endedAt === null) {
      if (previous.waiterId === waiterId) return;
      await tx.query("update app.table_assignments set ended_at = $2 where id = $1", [previous.id, at]);
    }
    await tx.query(
      `insert into app.table_assignments (venue_id, shift_id, table_id, waiter_id, started_at)
       values ($1, $2, $3, $4, $5)`,
      [venueId, shiftId, tableId, waiterId, at],
    );
  });
}

export async function endShift(
  actor: Actor,
  input: z.input<typeof shiftTarget>,
  { now }: { now?: Date } = {},
): Promise<Shift> {
  const { venueId, shiftId } = parseInput(shiftTarget, input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    await lockVenueShifts(tx, venueId);
    const shift = await requireOpenShift(tx, venueId, shiftId);
    const at = now ?? new Date();
    const { rows: [latest] } = await tx.query<{ changedAt: Date | null }>(
      `select max(greatest(started_at, ended_at)) as "changedAt"
       from app.table_assignments where venue_id = $1 and shift_id = $2`,
      [venueId, shiftId],
    );
    if (at < (latest.changedAt ?? shift.startedAt)) {
      throw new MaasiiError("invalid_input", "A Shift cannot end before the last change.");
    }
    await tx.query(
      "update app.table_assignments set ended_at = $3 where venue_id = $1 and shift_id = $2 and ended_at is null",
      [venueId, shiftId, at],
    );
    const { rows: [ended] } = await tx.query<Shift>(
      `update app.shifts set ended_at = $2 where id = $1 returning ${shiftFields}`,
      [shiftId, at],
    );
    return ended;
  });
}

async function requireOpenShift(tx: Tx, venueId: string, shiftId: string): Promise<Shift> {
  const shift = await findOpenShift(tx, venueId);
  if (shift?.id !== shiftId) throw new MaasiiError("invalid_input", "The running Shift has changed.", "shiftChanged");
  return shift;
}

type ResponsibleWaiter = { waiterId: string; waiterName: string };

export async function getResponsibleWaiter(
  actor: Actor,
  input: { venueId: string; tableId: string; at: Date },
): Promise<ResponsibleWaiter | null> {
  const { venueId, tableId, at } = parseInput(venueInput.extend({ tableId: idInput, at: z.date() }), input);
  return inTransaction(actor, async (tx) => {
    await requireVenueManager(tx, actor, venueId);
    return findResponsibleWaiter(tx, venueId, tableId, at);
  });
}

/** Resolve the Table Assignment in the caller's authorized transaction. End times are exclusive. */
export async function findResponsibleWaiter(
  tx: Tx, venueId: string, tableId: string, at: Date,
): Promise<ResponsibleWaiter | null> {
  const { rows } = await tx.query<ResponsibleWaiter>(
    `select a.waiter_id as "waiterId", m.name as "waiterName"
     from app.table_assignments a join app.memberships m on m.id = a.waiter_id
     where a.venue_id = $1 and a.table_id = $2 and a.started_at <= $3 and (a.ended_at is null or a.ended_at > $3)
     order by a.started_at desc limit 1`,
    [venueId, tableId, at],
  );
  return rows[0] ?? null;
}

/** Called while holding the Venue's Shift lock so a removed Waiter keeps only historical Assignments. */
export async function closeWaiterAssignments(tx: Tx, venueId: string, waiterId: string, at: Date): Promise<void> {
  await tx.query(
    `update app.table_assignments set ended_at = greatest(started_at, $3)
     where venue_id = $1 and waiter_id = $2 and ended_at is null`,
    [venueId, waiterId, at],
  );
}

/** Serialize Shift mutations and Waiter removal at this Venue. */
export async function lockVenueShifts(tx: Tx, venueId: string): Promise<void> {
  // ponytail: one lock per Venue, finer table locks if simultaneous reassignments become frequent.
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [venueId]);
}

async function requireActiveWaiters(tx: Tx, venueId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const { rowCount } = await tx.query(
    "select id from app.memberships where venue_id = $1 and id = any($2::uuid[]) and role = 'waiter' and active",
    [venueId, unique],
  );
  if (rowCount !== unique.length) throw new MaasiiError("not_found", "Waiter not found.");
}

async function requireActiveTables(tx: Tx, venueId: string, ids: string[]): Promise<void> {
  const { rowCount } = await tx.query(
    "select id from app.tables where venue_id = $1 and id = any($2::uuid[]) and active for share",
    [venueId, ids],
  );
  if (rowCount !== ids.length) throw new MaasiiError("invalid_input", "Choose active Tables at this Venue.");
}
