import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, getShiftSetup, MaasiiError, type Shift } from "@/core";
import { requireStaff } from "@/lib/session";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { endVenueShift, saveAssignment, saveUsualTables, startVenueShift } from "./actions";

type ShiftSetup = Awaited<ReturnType<typeof getShiftSetup>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: `${t("title")} · Maasii` };
}

export default async function ShiftsPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/shifts">) {
  const { venueId } = await params;
  const actor = await requireStaff();
  const setup = await getShiftSetup(actor, { venueId }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, query] = await Promise.all([getTranslations("Shifts"), searchParams]);
  const openVisits = setup.shift ? (await getLiveFloor(actor, { venueId })).tables.length : 0;
  return (
    <>
      <h1 className="font-sans text-3xl">{t("title")}</h1>
      {setup.shift ? <RunningShift setup={setup} shift={setup.shift} openVisits={openVisits}
        selected={setup.tables.find(table => table.id === query.table)} fromFloor={query.from === "floor"} /> : <SuggestedAssignments setup={setup} />}
      <UsualTables setup={setup} />
    </>
  );
}

function SuggestedAssignments({ setup }: { setup: ShiftSetup }) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  const root = `/manage/venues/${setup.venue.id}`;
  const canAssign = setup.waiters.length > 0 && setup.tables.length > 0;
  return (
    <section aria-labelledby="suggested" className="workspace-panel workspace-section space-y-3">
      <div className="manager-row-heading">
        <h2 id="suggested">{t("suggestedAssignments")}</h2>
        <span className="manager-chip" data-tone={setup.unassignedTables.length ? "waiting" : "live"}>
          <WaiterIcon name={setup.unassignedTables.length ? "alert" : "check"} />{t("uncoveredCount", { count: setup.unassignedTables.length })}
        </span>
      </div>
      <p className="manager-muted">{t("suggestedCoverage", { count: setup.tables.length - setup.unassignedTables.length, total: setup.tables.length })}</p>
      {canAssign && setup.unassignedTables.length > 0 && <p className="manager-muted">{t("noSuggested")}</p>}
      {!canAssign && <div className="manager-notice" data-tone="waiting">
        <WaiterIcon name="alert" />
        <div>
          <p>{setup.tables.length === 0 ? t("noActiveTables") : t("noWaitersForShift")}</p>
          <div className="manager-actions">
            {setup.tables.length === 0 && <Link className="workspace-link" href={root + "#tables"}>{manage("addTables")}</Link>}
            {setup.waiters.length === 0 && <Link className="workspace-link" href={root + "#waiters"}>{t("connectWaiters")}</Link>}
          </div>
        </div>
      </div>}
      <ActionForm action={startVenueShift.bind(null, setup.venue.id)} className="space-y-2"
        confirmMessage={t("startUncovered", { venue: setup.venue.name })} confirmLabel={t("start")} confirmWhenEmptyPrefix="assignment:">
        {canAssign && <details>
          <summary className="workspace-summary">{t("reviewAssignments")}</summary>
          <div className="grid gap-3 sm:grid-cols-2">
            {setup.tables.map(table => <AssignmentSelect key={`${table.id}:${table.waiterId}`} name={`assignment:${table.id}`}
              table={table} waiters={setup.waiters} />)}
          </div>
        </details>}
        <SubmitButton variant={setup.unassignedTables.length < setup.tables.length ? "primary" : "secondary"}>{t("start")}</SubmitButton>
      </ActionForm>
    </section>
  );
}

function RunningShift({ setup, shift, openVisits, selected, fromFloor }: {
  setup: ShiftSetup; shift: Shift; openVisits: number; selected?: ShiftSetup["tables"][number]; fromFloor: boolean;
}) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Addis_Ababa", hourCycle: "h23", dateStyle: "medium", timeStyle: "short",
  }).format(shift.startedAt);
  const root = "/manage/venues/" + setup.venue.id;
  const assignments = Map.groupBy(setup.tables, table => table.waiterId);
  const assignmentLinks = (tables: ShiftSetup["unassignedTables"]) => <ul className="manager-assignment-tiles">
    {tables.map(table => <li key={table.id} id={"assignment-" + table.id}>
      {setup.waiters.length
        ? <Link className="workspace-button" href={root + "/shifts?table=" + table.id + "#assignment-picker"}
          aria-label={t("assignTable", { number: table.number })}>{manage("table", { number: table.number })}<WaiterIcon name="next" /></Link>
        : <span className="manager-chip">{manage("table", { number: table.number })}</span>}
    </li>)}
  </ul>;
  return (
    <section aria-labelledby="running" className="workspace-section">
      <div className="workspace-panel workspace-title">
        <div><h2 id="running">{t("runningShift")}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            <time dateTime={shift.startedAt.toISOString()}>{t("started", { time })}</time>
          </p>
          <p className="manager-chip" data-tone={setup.unassignedTables.length ? "waiting" : "live"}><WaiterIcon name="account" />
            {t("currentCoverage", { count: setup.tables.length - setup.unassignedTables.length, total: setup.tables.length })}
          </p>
        </div>
        <details>
          <summary className="workspace-summary">{t("shiftActions")}</summary>
          {openVisits > 0 && <Link className="workspace-link" href={root + "/closing"}>{t("reviewVisits")}</Link>}
          <ActionForm action={endVenueShift.bind(null, setup.venue.id, shift.id)} confirmLabel={t("end")}
            confirmMessage={t("endConsequence", { venue: setup.venue.name, count: openVisits })}>
            <SubmitButton variant="destructive">{t("end")}</SubmitButton>
          </ActionForm>
        </details>
      </div>
      {selected && <section id="assignment-picker" className="workspace-panel manager-picker" aria-labelledby="assignment-title" key={selected.id}>
        <div className="manager-row-heading">
          <h3 id="assignment-title">{t("assignTable", { number: selected.number })}</h3>
          <Link className="workspace-link" href={root + (fromFloor ? "/floor" : "/shifts#assignments")}>
            <WaiterIcon name="back" />{t(fromFloor ? "backFloor" : "backAssignments")}
          </Link>
        </div>
        <p className="manager-muted">{t("pickWaiter", { number: selected.number })}</p>
        {setup.waiters.length
          ? <ActionForm action={saveAssignment.bind(null, { venueId: setup.venue.id, shiftId: shift.id, tableId: selected.id })}
            className="manager-actions mt-2">
            {setup.waiters.map(waiter => <SubmitButton key={waiter.id} name="waiterId" value={waiter.id}
              variant={selected.waiterId === waiter.id ? "primary" : "secondary"} disabled={selected.waiterId === waiter.id}>
              {selected.waiterId === waiter.id && <WaiterIcon name="check" />} {waiter.name}
            </SubmitButton>)}
          </ActionForm>
          : <Link className="workspace-link" href={root + "#waiters"}>{t("connectWaiters")}</Link>}
      </section>}
      <section id="assignments" aria-labelledby="unassigned" className="workspace-panel my-3">
        <div className="manager-row-heading">
          <h3 id="unassigned">{t("unassignedTables")}</h3>
          <span className="manager-count">{setup.unassignedTables.length}</span>
        </div>
        {setup.unassignedTables.length > 0 ? (
          assignmentLinks(setup.unassignedTables)
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{t(setup.tables.length ? "allAssigned" : "noActiveTables")}</p>
        )}
        {setup.waiters.length === 0 && <Link className="workspace-link" href={`/manage/venues/${setup.venue.id}#waiters`}>{t("connectWaiters")}</Link>}
      </section>
      {setup.waiters.map(waiter => {
        const tables = assignments.get(waiter.id) ?? [];
        return <section key={waiter.id} className="workspace-panel mb-2">
          <div className="manager-row-heading"><h3><WaiterIcon name="account" /> {waiter.name}</h3>
            <span className="manager-muted">{t("groupCount", { count: tables.length })}</span></div>
          {assignmentLinks(tables)}
        </section>;
      })}
    </section>
  );
}

function AssignmentSelect({ name, table, waiters }: {
  name: string;
  table: ShiftSetup["tables"][number];
  waiters: ShiftSetup["waiters"];
}) {
  const t = useTranslations("Shifts");
  const manage = useTranslations("StaffManage");
  return (
    <label className="block min-w-0 flex-1 basis-40 text-sm font-medium">
      {manage("table", { number: table.number })}
      <select
        name={name}
        defaultValue={table.waiterId ?? ""}
        className="workspace-input"
      >
        <option value="">{t("unassigned")}</option>
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
      <p className="manager-muted">{t("forFuture")}</p>
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
