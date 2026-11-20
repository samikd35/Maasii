import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { getLiveFloor, getOwnerVenueSchedule, type Actor, type MyAccess } from "@/core";
import { WaiterIcon } from "@/ui/waiter-icon";

type Venue = MyAccess["brands"][number]["venues"][number];

export async function ownerVenueStatus(actor: Actor, venues: Venue[], now: Date) {
  if (!venues.length) return [];
  const [schedule, floors] = await Promise.all([
    getOwnerVenueSchedule(actor, { now }),
    Promise.all(venues.map(venue => getLiveFloor(actor, { venueId: venue.id }, { now }))),
  ]);
  const scheduled = new Map(schedule.map(venue => [venue.id, venue.open]));
  return venues.map((venue, index) => ({ ...venue, scheduled: scheduled.get(venue.id), snapshot: floors[index] }));
}

type VenueStatus = Awaited<ReturnType<typeof ownerVenueStatus>>[number];

export async function VenueAttention({ venues, checkedAt }: { venues: VenueStatus[]; checkedAt: Date }) {
  const [t, floor, closing, format] = await Promise.all([
    getTranslations("OwnerWorkspace"), getTranslations("Floor"), getTranslations("Closing"), getFormatter(),
  ]);
  const attention = venues.map(({ id, name, snapshot, scheduled }) => {
    const root = `/manage/venues/${id}`;
    const { service, exceptions, tables } = snapshot;
    const waiting = tables.filter(table => table.pendingOrders.length).length;
    const overdue = exceptions.filter(item => item.kind === "prepared").length;
    const gaps = exceptions.filter(item => item.kind === "unassigned").length;
    const differences = exceptions.filter(item => item.kind === "difference").length;
    const stopped = scheduled && !service.shiftStartedAt;
    const issues = [
      { show: waiting, label: t("ordersWaiting", { count: waiting }), icon: "queue", tone: "waiting", href: root + "/floor?focus=sent#floor-attention" },
      { show: gaps, label: t("uncovered", { count: gaps }), icon: "account", tone: "urgent", href: root + "/floor?focus=unassigned#floor-attention" },
      { show: overdue, label: t("overdue", { count: overdue }), icon: "receipt", tone: "bill", href: root + "/floor?focus=prepared#floor-attention" },
      { show: differences, label: closing("receiptCount", { count: differences }), icon: "alert", tone: "waiting", href: root + "/closing?tab=payments&filter=differences" },
      { show: stopped, label: t("scheduledWithoutShift"), icon: "clock", tone: "waiting", href: root + "/shifts" },
    ] as const;
    return { id, name, waiting, overdue, issues: issues.filter(issue => issue.show) };
  }).filter(venue => venue.issues.length).sort((a, b) => b.waiting - a.waiting || b.overdue - a.overdue);
  return <section className="owner-attention workspace-panel" aria-labelledby="needs-attention">
    <div className="manager-row-heading">
      <h2 id="needs-attention"><WaiterIcon name="alert" />{floor("exceptions")}</h2>
      <p className="manager-muted">{floor("lastUpdated", { time: format.dateTime(checkedAt, { timeStyle: "short", timeZone: "Africa/Addis_Ababa" }) })}</p>
    </div>
    {attention.length ? <ul className="owner-attention-list">
      {attention.map(({ id, name, issues }) => <li key={id}>
        <h3>{name}</h3>
        <div className="owner-issue-links">
          {issues.map(issue => <Link key={issue.href} className="manager-chip owner-issue" data-tone={issue.tone} href={issue.href}
            aria-label={t("venueIssue", { venue: name, issue: issue.label })}><WaiterIcon name={issue.icon} />{issue.label}<WaiterIcon name="next" /></Link>)}
        </div>
      </li>)}
    </ul> : <p className="manager-notice" data-tone="live"><WaiterIcon name="circleCheck" />{t("noIssues")}</p>}
  </section>;
}

export async function OwnerVenues({ venues }: { venues: VenueStatus[] }) {
  const [t, floor] = await Promise.all([getTranslations("StaffManage"), getTranslations("Floor")]);
  if (!venues.length) return <p className="manager-empty workspace-panel">{t("noVenues")}</p>;
  return <ul className="manager-list owner-venue-list">
    {venues.map(({ id, name, scheduled, snapshot: { service } }) => {
      const shift = Boolean(service.shiftStartedAt);
      const covered = service.assigned > 0;
      const ready = service.active > 0;
      return <li key={id}>
        <Link className="owner-venue-link" href={`/manage/venues/${id}${ready ? "/floor" : ""}`}
          aria-label={t(ready ? "openVenueOperations" : "setUpVenue", { venue: name })}>
          <span className="manager-setup-icon"><WaiterIcon name="brand" /></span>
          <div className="owner-venue-info">
            <h3>{name}</h3>
            <div className="manager-actions">
              <span className="manager-chip" data-tone={covered ? "live" : shift ? "waiting" : undefined}>
                <WaiterIcon name={covered ? "check" : shift ? "alert" : "clock"} />
                {floor(covered ? "shiftRunning" : shift ? "shiftUncovered" : "shiftStopped")}
              </span>
              {scheduled !== undefined && <span className="manager-muted">{t(scheduled ? "scheduledOpen" : "scheduledClosed")}</span>}
            </div>
            <p className="manager-muted">{shift
              ? floor("coverage", { assigned: service.assigned, total: service.active, waiters: service.waiters })
              : floor("tableCount", { count: service.active })}</p>
          </div>
          <WaiterIcon name="next" />
        </Link>
      </li>;
    })}
  </ul>;
}
