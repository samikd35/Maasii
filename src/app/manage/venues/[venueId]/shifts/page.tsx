import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, getShiftSetup, MaasiiError, type Shift } from "@/core";
import { requireStaff } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { endVenueShift, saveAssignment, saveUsualTables, startVenueShift } from "./actions";

type ShiftSetup = Awaited<ReturnType<typeof getShiftSetup>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: `${t("title")} · Maasii` };
}

export default async function ShiftsPage({ params }: PageProps<"/manage/venues/[venueId]/shifts">) {
  const { venueId } = await params;
  const actor = await requireStaff();
  const setup = await getShiftSetup(actor, { venueId }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const t = await getTranslations("Shifts");
  const openVisits = setup.shift ? (await getLiveFloor(actor, { venueId })).tables.length : 0;
  return (
    <>
      <h1 className="font-sans text-3xl">{t("title")}</h1>
      {setup.shift ? <RunningShift setup={setup} shift={setup.shift} openVisits={openVisits} /> : <SuggestedAssignments setup={setup} />}
      <UsualTables setup={setup} />
    </>
  );
}

function SuggestedAssignments({ setup }: { setup: ShiftSetup }) {
  const t = useTranslations("Shifts");
  return (
    <section aria-labelledby="suggested" className="workspace-panel workspace-section space-y-3">
      <h2 id="suggested">{t("suggestedAssignments")}</h2>
      <p>{t("suggestedCoverage", { count: setup.tables.length - setup.unassignedTables.length, total: setup.tables.length })}</p>
      {setup.tables.length === 0 && <p className="text-sm text-ink-muted">{t("noActiveTables")}</p>}
      {setup.waiters.length === 0 && <Link className="workspace-link" href={`/manage/venues/${setup.venue.id}#waiters`}>{t("connectWaiters")}</Link>}
      <ActionForm action={startVenueShift.bind(null, setup.venue.id)} className="space-y-2"
        confirmMessage={t("startUncovered", { venue: setup.venue.name })} confirmLabel={t("start")} confirmWhenEmptyPrefix="assignment:">
        <SubmitButton>{t("start")}</SubmitButton>
        <details>
          <summary className="workspace-summary">{t("reviewAssignments")}</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            {setup.tables.map(table => <AssignmentSelect key={`${table.id}:${table.waiterId}`} name={`assignment:${table.id}`}
              table={table} waiters={setup.waiters} />)}
          </div>
        </details>
      </ActionForm>
    </section>
  );
}

function RunningShift({ setup, shift, openVisits }: { setup: ShiftSetup; shift: Shift; openVisits: number }) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Addis_Ababa", hourCycle: "h23", dateStyle: "medium", timeStyle: "short",
  }).format(shift.startedAt);
  return (
    <section aria-labelledby="running" className="workspace-section">
      <div className="workspace-panel workspace-title">
        <div><h2 id="running">{t("runningShift")}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            <time dateTime={shift.startedAt.toISOString()}>{t("started", { time })}</time>
          </p>
          <p>{t("currentCoverage", { count: setup.tables.length - setup.unassignedTables.length, total: setup.tables.length })}</p>
        </div>
        <details>
          <summary className="workspace-summary">{t("shiftActions")}</summary>
          <ActionForm action={endVenueShift.bind(null, setup.venue.id, shift.id)} confirmLabel={t("end")}
            confirmMessage={t("endConsequence", { venue: setup.venue.name, count: openVisits })}>
            <SubmitButton variant="destructive">{t("end")}</SubmitButton>
          </ActionForm>
        </details>
      </div>
      <section id="assignments" aria-labelledby="unassigned" className="my-4 rounded-xl border border-rule bg-paper-deep p-3">
        <h3 id="unassigned" className="font-semibold">{t("unassignedTables")}</h3>
        {setup.unassignedTables.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {setup.unassignedTables.map((table) => (
              <li key={table.id} id={setup.waiters.length ? undefined : `assignment-${table.id}`} className="rounded-xl border border-ink/20 px-2 py-1 text-sm">
                {manage("table", { number: table.number })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{t(setup.tables.length ? "allAssigned" : "noActiveTables")}</p>
        )}
        {setup.waiters.length === 0 && <Link className="workspace-link" href={`/manage/venues/${setup.venue.id}#waiters`}>{t("connectWaiters")}</Link>}
      </section>
      {setup.waiters.length > 0 && setup.tables.length > 0 && (
        <ul className="workspace-panel mb-4">
          {[...setup.tables].sort((a, b) => Number(!!a.waiterId) - Number(!!b.waiterId)).map((table) => (
            <li key={table.id} id={`assignment-${table.id}`} className="border-b border-rule py-3">
              <ActionForm
                action={saveAssignment.bind(null, { venueId: setup.venue.id, shiftId: shift.id, tableId: table.id })}
                className="flex flex-wrap items-end gap-2"
              >
                <AssignmentSelect key={table.waiterId} name="waiterId" table={table} waiters={setup.waiters} required />
                <SubmitButton variant="secondary">{t("saveAssignment")}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
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
    <label className="block min-w-0 flex-1 basis-40 text-sm font-medium">
      {manage("table", { number: table.number })}
      <select
        name={name}
        defaultValue={table.waiterId ?? ""}
        required={required}
        className="mt-1 block min-h-11 w-full rounded-xl border border-ink/30 bg-white px-3 text-base"
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
