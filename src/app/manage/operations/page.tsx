import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, getShiftSetup, getMyAccess, getWaiterSession } from "@/core";
import { LiveFloor } from "../live-floor";
import { RefreshFloor } from "../refresh-floor";
import { requireStaff } from "@/lib/session";

export default async function OperationsHome() {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) redirect("/staff");
  const access = await getMyAccess(actor);
  const venues = [
    ...access.venues.map(({ id, name, brandName }) => ({ id, name, brandName })),
    ...access.brands.flatMap((brand) => brand.venues.map((venue) => ({ ...venue, brandName: brand.name }))),
  ];
  if (!venues.length) notFound();
  const [t, floor, shifts, menu, waiter] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("Floor"), getTranslations("Shifts"),
    getTranslations("VenueMenu"), getTranslations("StaffWaiter"),
  ]);
  const service = await Promise.all(venues.map(async venue => ({ floor: await getLiveFloor(actor, { venueId: venue.id }), setup: await getShiftSetup(actor, { venueId: venue.id }) })));
  const destinations = [
    ["/floor", floor("title")], ["/shifts", shifts("title")],
    ["#tables", t("tables")], ["#waiters", waiter("waiters")], ["/menu", menu("title")],
  ];
  return (
    <>
      {access.brands.length > 0 && (
        <Link href="/manage" className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("ownerOverview")}</Link>
      )}
      <h1 className="font-sans text-3xl">{t("operations")}</h1>
      <ul className="mt-5 space-y-4">
        {venues.map((venue, index) => {
          const href = `/manage/venues/${venue.id}`;
          const { setup, floor: live } = service[index];
          const unassigned = setup.shift ? setup.unassignedTables.length : setup.tables.length;
          const assigned = setup.shift ? new Set(setup.tables.flatMap(table => table.waiterId ? [table.waiterId] : [])).size : 0;
          const waiting = live.tables.filter(table => table.status === "sent").length;
          const differences = live.exceptions.filter(exception => exception.kind === "difference").length;
          const [nextPath, nextAction] = !setup.shift ? ["/shifts", "startServiceAction"] as const
            : waiting ? ["/floor", "reviewOrdersAction"] as const
            : unassigned ? ["/shifts", "assignTablesAction"] as const
            : differences ? ["/closing", "reviewReceiptsAction"] as const
            : ["/floor", "viewFloorAction"] as const;
          return (
            <li key={venue.id} className="maasii-card">
              <p className="text-sm text-ink-muted">{venue.brandName}</p>
              <h2 className="font-sans text-2xl">
                <Link href={href} className="inline-flex min-h-11 items-center underline">{venue.name}</Link>
              </h2>
              <p className="my-2 text-sm font-semibold">{t(setup.shift ? "serviceRunning" : "serviceStopped")}</p>
              <dl className="my-4 grid grid-cols-2 gap-3">
                {[[t("assignedWaiters"), assigned], [t("unassignedTables"), unassigned], [t("pendingTables"), waiting], [t("receiptDifferences"), differences]].map(([label, value]) => <div key={label}><dt className="text-sm text-ink-muted">{label}</dt><dd className="text-2xl font-semibold tabular-nums">{value}</dd></div>)}
              </dl>
              <Link className="maasii-button mb-4" href={href + nextPath}>{t(nextAction)}</Link>
              <nav aria-label={t("venueOperations", { venue: venue.name })} className="task-nav flex flex-wrap gap-x-5">
                {destinations.map(([path, label]) => (
                  <Link key={path} href={href + path} className="inline-flex min-h-11 items-center text-sm font-medium underline">{label}</Link>
                ))}
              </nav>
              <LiveFloor venueId={venue.id} floor={live} />
            </li>
          );
        })}
      </ul><RefreshFloor />
    </>
  );
}
