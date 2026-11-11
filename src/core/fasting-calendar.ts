import { z } from "zod";
import { requirePlatformAdmin } from "./access";
import type { Actor } from "./actor";
import { inTransaction } from "./db";
import { MaasiiError } from "./errors";
import { parseInput } from "./validation";

const date = z.iso.date().refine((value) => !value.startsWith("0000"));
const periodInput = z.object({ startsOn: date, endsOn: date, fasting: z.boolean() }).refine(
  (period) => period.startsOn <= period.endsOn,
  { message: "The end date must be on or after the start date." },
);

export type FastingPeriod = z.output<typeof periodInput>;
const periodColumns = 'starts_on::text as "startsOn", ends_on::text as "endsOn", fasting';

export async function listFastingPeriods(actor: Actor): Promise<FastingPeriod[]> {
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    const { rows } = await tx.query<FastingPeriod>(
      `select ${periodColumns} from app.fasting_calendar_periods order by starts_on, ends_on, fasting`,
    );
    return rows;
  });
}

export async function addFastingPeriod(actor: Actor, input: FastingPeriod): Promise<FastingPeriod> {
  const period = parseInput(periodInput, input, "invalidFastingDates");
  return changePeriod(
    actor,
    `insert into app.fasting_calendar_periods (starts_on, ends_on, fasting) values ($1, $2, $3)`,
    periodValues(period),
  );
}

export async function updateFastingPeriod(
  actor: Actor,
  input: { period: FastingPeriod; changes: FastingPeriod },
): Promise<FastingPeriod> {
  const { period, changes } = parseInput(z.object({ period: periodInput, changes: periodInput }), input, "invalidFastingDates");
  return changePeriod(
    actor,
    `update app.fasting_calendar_periods set starts_on = $4, ends_on = $5, fasting = $6
     where (starts_on, ends_on, fasting) = ($1, $2, $3)`,
    [...periodValues(period), ...periodValues(changes)],
  );
}

export async function removeFastingPeriod(actor: Actor, input: FastingPeriod): Promise<void> {
  const period = parseInput(periodInput, input, "invalidFastingDates");
  await changePeriod(
    actor,
    "delete from app.fasting_calendar_periods where (starts_on, ends_on, fasting) = ($1, $2, $3)",
    periodValues(period),
  );
}

function periodValues(period: FastingPeriod) {
  return [period.startsOn, period.endsOn, period.fasting];
}

async function changePeriod(actor: Actor, sql: string, values: ReturnType<typeof periodValues>): Promise<FastingPeriod> {
  return inTransaction(actor, async (tx) => {
    await requirePlatformAdmin(tx, actor);
    try {
      const { rows } = await tx.query<FastingPeriod>(`${sql} returning ${periodColumns}`, values);
      if (!rows[0]) throw new MaasiiError("not_found", "Fasting period not found.");
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new MaasiiError("invalid_input", "A fasting period with these dates and type already exists.", "fastingPeriodExists");
      }
      throw error;
    }
  });
}
