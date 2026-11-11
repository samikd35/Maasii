import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getShiftSetup, MaasiiError, type Shift } from "@/core";
import { requireStaff } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { endVenueShift, saveAssignment, saveUsualTables, startVenueShift } from "./actions";

type ShiftSetup = Awaited<ReturnType<typeof getShiftSetup>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: `${t("title")} · Maasii` };
}

async function load(venueId: string) {
  try {
    return await getShiftSetup(await requireStaff(), { venueId });
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function ShiftsPage({ params }: PageProps<"/manage/venues/[venueId]/shifts">) {
  const { venueId } = await params;
  const setup = await load(venueId);
  const t = await getTranslations("Shifts");
  return (
    <>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {setup.venue.name}
      </Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>
      {setup.shift ? <RunningShift setup={setup} shift={setup.shift} /> : <SuggestedAssignments setup={setup} />}
      <UsualTables setup={setup} />
    </>
  );
}

function SuggestedAssignments({ setup }: { setup: ShiftSetup }) {
  const t = useTranslations("Shifts");
  return (
    <section aria-labelledby="suggested" className="mt-7 space-y-3">
      <h2 id="suggested" className="text-lg font-semibold">{t("suggestedAssignments")}</h2>
      {setup.tables.length === 0 && <p className="text-sm text-ink-muted">{t("noActiveTables")}</p>}
      <ActionForm action={startVenueShift.bind(null, setup.venue.id)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {setup.tables.map((table) => (
            <AssignmentSelect
              key={`${table.id}:${table.waiterId}`}
              name={`assignment:${table.id}`}
              table={table}
              waiters={setup.waiters}
            />
          ))}
        </div>
        <SubmitButton>{t("start")}</SubmitButton>
      </ActionForm>
    </section>
  );
}

function RunningShift({ setup, shift }: { setup: ShiftSetup; shift: Shift }) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Addis_Ababa", hourCycle: "h23", dateStyle: "medium", timeStyle: "short",
  }).format(shift.startedAt);
  return (
    <section aria-labelledby="running" className="mt-7">
      <h2 id="running" className="text-lg font-semibold">{t("runningShift")}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        <time dateTime={shift.startedAt.toISOString()}>{t("started", { time })}</time>
      </p>
      <section aria-labelledby="unassigned" className="my-4 rounded-md border border-rule bg-paper-deep p-3">
        <h3 id="unassigned" className="font-semibold">{t("unassignedTables")}</h3>
        {setup.unassignedTables.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {setup.unassignedTables.map((table) => (
              <li key={table.id} className="rounded-md border border-ink/20 px-2 py-1 text-sm">
                {manage("table", { number: table.number })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{t(setup.tables.length ? "allAssigned" : "noActiveTables")}</p>
        )}
      </section>
      {setup.waiters.length > 0 && setup.tables.length > 0 && (
        <ul className="mb-4">
          {setup.tables.map((table) => (
            <li key={table.id} className="border-b border-rule py-3">
              <ActionForm
                action={saveAssignment.bind(null, { venueId: setup.venue.id, shiftId: shift.id, tableId: table.id })}
                className="flex flex-wrap items-end gap-2"
              >
                <AssignmentSelect key={table.waiterId} name="waiterId" table={table} waiters={setup.waiters} required />
                <SubmitButton variant="quiet">{t("saveAssignment")}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={endVenueShift.bind(null, setup.venue.id, shift.id)}>
        <SubmitButton variant="quiet">{t("end")}</SubmitButton>
      </ActionForm>
    </section>
  );
}

function AssignmentSelect({ name, table, waiters, required }: {
  name: string;
  table: ShiftSetup["tables"][number];
  waiters: ShiftSetup["waiters"];
  required?: boolean;
}) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  return (
    <label className="block min-w-40 flex-1 text-sm font-medium">
      {manage("table", { number: table.number })}
      <select
        name={name}
        defaultValue={table.waiterId ?? ""}
        required={required}
        className="mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base"
      >
        <option value="" disabled={required}>{t("unassigned")}</option>
        {waiters.map((waiter) => <option value={waiter.id} key={waiter.id}>{waiter.name}</option>)}
      </select>
    </label>
  );
}

function UsualTables({ setup }: { setup: ShiftSetup }) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  const waiterText = useTranslations("StaffWaiter");
  return (
    <section aria-labelledby="usual-tables" className="mt-9 border-t border-rule pt-4">
      <h2 id="usual-tables" className="text-lg font-semibold">{t("usualTables")}</h2>
      {setup.waiters.length === 0 && <p className="mt-2 text-sm text-ink-muted">{waiterText("noWaiters")}</p>}
      {setup.waiters.map((waiter) => (
        <details key={waiter.id} className="border-b border-rule">
          <summary className="min-h-11 cursor-pointer break-words py-2 font-medium">{waiter.name}</summary>
          <ActionForm action={saveUsualTables.bind(null, setup.venue.id, waiter.id)} className="space-y-2 pb-3">
            {setup.tables.length === 0 && <p className="text-sm text-ink-muted">{t("noActiveTables")}</p>}
            <div className="grid grid-cols-2 gap-x-2 sm:grid-cols-4">
              {setup.tables.map((table) => {
                const checked = waiter.usualTableIds.includes(table.id);
                return (
                  <label key={`${table.id}:${checked}`} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="tableId" value={table.id} defaultChecked={checked} className="size-5 accent-ink" />
                    {manage("table", { number: table.number })}
                  </label>
                );
              })}
            </div>
            <SubmitButton variant="quiet">{t("saveUsual")}</SubmitButton>
          </ActionForm>
        </details>
      ))}
    </section>
  );
}
