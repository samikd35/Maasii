import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getLiveFloor, getMenuDraft, getMyAccess, getOwnerVenueSchedule, getShiftSetup, getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { addVenue } from "./actions";
import { OwnerHome } from "./owner-home";
import { RefreshFloor } from "./refresh-floor";

const brandCookie = "maasii-owner-brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("ownerOverview")} · Maasii` };
}

export default async function ManageHome({ searchParams }: PageProps<"/manage">) {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) redirect("/staff");
  const access = await getMyAccess(actor);
  if (!access.brands.length && access.venues.length && !access.isPlatformAdmin) redirect("/manage/operations");
  const query = await searchParams;
  const preferred = typeof query.brand === "string" ? query.brand : (await cookies()).get(brandCookie)?.value;
  const brand = access.brands.find(option => option.id === preferred) ?? access.brands[0];
  const [t, staff, floor, menu, insights, payment, format] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("Staff"), getTranslations("Floor"), getTranslations("MenuEditor"),
    getTranslations("Insights"), getTranslations("PaymentOptions"), getFormatter(),
  ]);

  async function selectBrand(form: FormData) {
    "use server";
    const id = String(form.get("brand") ?? "");
    if ((await getMyAccess(await requireStaff())).brands.some(brand => brand.id === id)) {
      (await cookies()).set(brandCookie, id, { path: "/manage", sameSite: "lax", httpOnly: true });
      redirect(`/manage?brand=${id}`);
    }
  }

  const adminLink = access.isPlatformAdmin && <Link className="workspace-link" href="/admin">{staff("platformAdmin")}</Link>;
  if (!brand) return <>
    <h1>{access.name ? t("greeting", { name: access.name }) : t("yourVenues")}</h1>
    {adminLink}
    {access.venues.length ? <Link className="workspace-link" href="/manage/operations">{t("operations")}</Link>
      : !access.isPlatformAdmin && <p className="mt-4 text-ink-muted">{t("noAccess")}</p>}
  </>;

  const now = new Date();
  const [draft, schedule, venues] = await Promise.all([
    getMenuDraft(actor, { brandId: brand.id }),
    getOwnerVenueSchedule(actor, { now }),
    Promise.all(brand.venues.map(async venue => ({ ...venue, snapshot: await getLiveFloor(actor, { venueId: venue.id }, { now }) }))),
  ]);
  const scheduled = new Map(schedule.map(item => [item.id, item.open]));
  const inService = venues.filter(venue => venue.snapshot.service.assigned > 0).length;
  const needsSetup = venues.find(({ snapshot }) => !snapshot.service.shiftStartedAt);
  const setup = needsSetup && draft.lastPublishedAt ? await getShiftSetup(actor, { venueId: needsSetup.id }) : undefined;
  const menuHref = `/manage/brands/${brand.id}/menu`;
  const setupHref = setup && `/manage/venues/${setup.venue.id}${!setup.tables.length ? "#tables" : !setup.waiters.length ? "#waiters" : "/shifts"}`;

  return <>
    <div className="workspace-title">
      <div>
        <p className="text-sm text-ink-muted">{t("ownerOverview")}</p>
        <h1>{brand.name}</h1>
      </div>
      {access.brands.length > 1 && <form action={selectBrand} className="workspace-actions items-end">
        <label className="text-sm font-medium">{t("selectBrand")}
          <select name="brand" className="workspace-input" defaultValue={brand.id}>
            {access.brands.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <button type="submit" className="workspace-button">{t("switchBrand")}</button>
      </form>}
    </div>
    {adminLink}
    <section id="venues" aria-labelledby="venues-heading" className="workspace-panel workspace-section">
      <div className="workspace-title">
        <div>
          <h2 id="venues-heading">{t("yourVenues")}</h2>
          {!!venues.length && <p className="mt-1 text-sm text-ink-muted">{t("liveVenueCount", { count: inService, total: venues.length })}</p>}
        </div>
        <details>
          <summary className={venues.length ? "workspace-summary" : "workspace-summary workspace-button workspace-primary"}>{t("addVenue")}</summary>
          <ActionForm action={addVenue.bind(null, brand.id)} className="workspace-actions items-end mt-2">
            <Field label={t("venueName")} name="name" required className="min-w-0 flex-1" />
            <SubmitButton>{t("addVenue")}</SubmitButton>
          </ActionForm>
        </details>
      </div>
      {!venues.length && <p className="text-ink-muted">{t("noVenues")}</p>}
      <ul className="divide-y divide-rule">
        {venues.map(({ id, name, snapshot }) => {
          const { service, tables, exceptions } = snapshot;
          const root = `/manage/venues/${id}`;
          const pending = tables.filter(table => table.pendingOrders.length).length;
          const assigned = service.assigned > 0;
          const urgent = exceptions.find(item => item.kind === "prepared" || item.kind === "difference");
          return <li key={id} className="owner-venue-row">
            <div>
              <h3><Link href={root} className="workspace-link">{name}</Link></h3>
              <div className="workspace-actions">
                <span className="workspace-badge" data-tone={assigned ? "live" : service.shiftStartedAt ? "waiting" : undefined}>
                  {floor(!service.shiftStartedAt ? "shiftStopped" : assigned ? "shiftRunning" : "shiftUncovered")}
                </span>
                {scheduled.has(id) && <span className="text-sm text-ink-muted">{t(scheduled.get(id) ? "scheduledOpen" : "scheduledClosed")}</span>}
              </div>
              {service.shiftStartedAt && <p className="mt-1 text-sm">{floor("coverage", { assigned: service.assigned, total: service.active, waiters: service.waiters })}</p>}
              {pending > 0 ? <p className="text-sm font-semibold">{t("pendingVenueTables", { count: pending })}</p>
                : urgent && <p className="text-sm font-semibold">{floor(urgent.kind)}</p>}
            </div>
            <div className="workspace-actions">
              <Link href={`/manage/operations?venue=${id}`} className="workspace-button" aria-label={t("openVenueOperations", { venue: name })}>{t("openOperations")}</Link>
              <Link href={`${root}/insights`} className="workspace-link">{insights("title")}</Link>
              <Link href={`${root}/payment-options`} className="workspace-link">{payment("title")}</Link>
            </div>
          </li>;
        })}
      </ul>
    </section>
    <div className="owner-summary workspace-section">
      <section id="brand-menu" aria-labelledby="brand-menu-title" className="workspace-panel space-y-2">
        <h2 id="brand-menu-title">{menu("nav")}</h2>
        <p>{draft.lastPublishedAt ? menu("lastPublish", { date: format.dateTime(draft.lastPublishedAt, { dateStyle: "medium" }) }) : menu("neverPublished")}</p>
        {draft.hasUnpublishedChanges && <span className="workspace-badge" data-tone="waiting">{menu("savedUnpublished")}</span>}
        <div className="workspace-actions">
          <Link className={draft.hasUnpublishedChanges || !draft.lastPublishedAt ? "workspace-button workspace-primary" : "workspace-link"} href={menuHref}>
            {t(draft.hasUnpublishedChanges ? "reviewBrandDraft" : draft.lastPublishedAt ? "openBrandMenu" : "createBrandMenu")}
          </Link>
        </div>
      </section>
      {setup && setupHref && <section className="workspace-panel space-y-2">
        <h2>{t("setUpVenue", { venue: setup.venue.name })}</h2>
        <Link className="workspace-link" href={setupHref}>
          {t(!setup.tables.length ? "addTables" : !setup.waiters.length ? "connectWaiterAction" : "startServiceAction")}
        </Link>
      </section>}
      {venues.length > 0 && <OwnerHome actor={actor} brandId={brand.id} venues={venues} selected={typeof query.findingVenue === "string" ? query.findingVenue : undefined} />}
      {venues.length === 0 && <section id="weekly-finding" className="workspace-panel"><h2>{t("insightsNav")}</h2><p className="mt-2 text-ink-muted">{t("noVenues")}</p></section>}
    </div>
    {venues.length > 0 && <RefreshFloor intervalMs={60_000} />}
  </>;
}
