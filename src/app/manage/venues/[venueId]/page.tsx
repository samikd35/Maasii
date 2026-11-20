import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getVenueLink, getVenueServiceSettings, getVenueSetup, getVenueStaff, getWaiterRatings, MaasiiError, type Actor, type VenueTable } from "@/core";
import { requireStaff, siteUrl } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, CopyField, SubmitButton } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { addTableRange, inviteVenueManager, removeVenueWaiter, renumber, setActive, showWaiterJoinQr } from "../../actions";
import { ServiceSettings } from "./service-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("venueSetup")} · Maasii` };
}

async function load(actor: Actor, venueId: string) {
  try {
    const [setup, staff, link, ratings] = await Promise.all([
      getVenueSetup(actor, { venueId }),
      getVenueStaff(actor, { venueId }),
      getVenueLink(actor, { venueId, siteUrl: await siteUrl() }),
      getWaiterRatings(actor, { venueId }),
    ]);
    const service = setup.isOwner ? await getVenueServiceSettings(actor, { venueId }) : null;
    return { setup, staff, link, ratings, service };
  } catch (error) {
    if (error instanceof MaasiiError && error.code !== "invalid_input") notFound();
    throw error;
  }
}

export default async function VenuePage({ params, searchParams }: PageProps<"/manage/venues/[venueId]">) {
  const { venueId } = await params;
  const { setup, staff, link, ratings, service } = await load(await requireStaff(), venueId);
  const { venue, tables, isOwner } = setup;
  const t = await getTranslations("StaffManage");
  const common = await getTranslations("Staff");
  const manager = await getTranslations("ManagerWorkspace");
  const waiter = await getTranslations("StaffWaiter");
  const paymentOptions = await getTranslations("PaymentOptions");
  const reviews = await getTranslations("Reviews");
  const insights = await getTranslations("Insights");
  const owner = await getTranslations("OwnerWorkspace");
  const root = `/manage/venues/${venueId}`;
  const openService = (await searchParams).section === "service";
  const readiness = [
    { href: "#tables", name: t("tables"), ready: tables.some(table => table.active) },
    { href: "#waiters", name: waiter("waiters"), ready: staff.waiters.length > 0 },
    { href: "#managers", name: t("managers"), ready: staff.managers.length > 0,
      pending: staff.invitations.length > 0 },
    { href: "?section=service#service-hours", name: insights("settings"), ready: Boolean(service) },
  ];
  const remaining = readiness.filter(step => !step.ready);

  return (
    <>
      <h1>{t("venueSetup")}</h1>
      {isOwner && <section className="workspace-panel" aria-labelledby="venue-setup-checklist">
        <div className="manager-row-heading">
          <h2 id="venue-setup-checklist">{owner("setupChecklist")}</h2>
          <Link href={root + "/shifts"} className="workspace-link">{owner("openShifts")}</Link>
        </div>
        <p className="manager-muted">{owner("setupProgress", { ready: readiness.length - remaining.length, total: readiness.length })}</p>
        {remaining.length > 0 && <ul className="manager-actions mt-2">
          {remaining.map(({ href, name, pending }) => <li key={href}>
            <Link className="manager-chip owner-setup-step" data-tone={pending ? "waiting" : undefined} href={href}>
              <WaiterIcon name={pending ? "clock" : "next"} />{name} · {owner(pending ? "invitePending" : "toDo")}
            </Link>
          </li>)}
        </ul>}
      </section>}
      <nav className="manager-setup-links" aria-label={t("venueSetup")}>
        <SetupLink href="#people" icon="account" label={manager("people")} hint={manager("peopleDescription")} />
        <SetupLink href="#venue-link" icon="qr" label={manager("qr")} hint={manager("qrDescription")} />
        <SetupLink href="#tables" icon="tables" label={t("tables")} hint={manager("tablesDescription")} />
        <SetupLink href={"/manage/venues/" + venue.id + "/payment-options"} icon="receipt"
          label={paymentOptions("title")} hint={isOwner ? owner("paymentHint") : manager("paymentsDescription")} />
      </nav>
      {isOwner && <Link href={"/manage/venues/" + venue.id + "/insights"} className="workspace-link">{insights("title")}</Link>}

      <section id="people" aria-labelledby="setup-people" className="workspace-panel manager-setup-section">
        <h2 id="setup-people">{manager("people")}</h2>
        <section aria-labelledby="waiters" className="manager-setup-subsection">
          <h3 id="waiters">{waiter("waiters")}</h3>
          <ActionForm action={showWaiterJoinQr.bind(null, venue.id)} className="my-3 space-y-3"
            qrAction={{ show: waiter("showJoinQr"), regenerate: waiter("regenerateQr") }}>
            <h3>{waiter("connectWaiter")}</h3>
            {staff.waiters.length > 0 && (
              <label className="block text-sm font-medium">
                {waiter("waiterToConnect")}
                <select name="waiterId" className="workspace-input">
                  <option value="">{waiter("newWaiter")}</option>
                  {staff.waiters.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            )}
          </ActionForm>
          {staff.waiters.length === 0 ? (
            <p className="py-3 text-ink-muted">{waiter("noWaiters")}</p>
          ) : (
            <ul>
              {staff.waiters.map(({ id, name }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2">
                  <span className="min-w-0 break-words">{name}</span>
                  <details><summary className="workspace-summary">{waiter("manageAccess", { name })}</summary><ActionForm action={removeVenueWaiter.bind(null, venue.id, id)} confirmMessage={waiter("removeConsequence", { name })} confirmLabel={waiter("removeNamed", { name })}>
                    <SubmitButton variant="destructive">{waiter("removeNamed", { name })}</SubmitButton>
                  </ActionForm></details>
                </li>
              ))}
            </ul>
          )}
        </section>

        <details role="region" aria-labelledby="managers" className="manager-setup-subsection">
          <summary id="managers" className="workspace-summary font-semibold">{t("managers")}</summary>
          {staff.managers.length === 0 ? (
            <p className="py-3 text-ink-muted">{t("noManager")}</p>
          ) : (
            <ul>
              {staff.managers.map((manager) => (
                <li key={manager.userId} className="flex min-h-12 items-center border-b border-rule">
                  {manager.name ?? common("manager")}
                </li>
              ))}
            </ul>
          )}
          {staff.invitations.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">{common("waiting")}</h3>
              <ul>
                {staff.invitations.map((invitation) => (
                  <li key={invitation.invitationId} className="border-b border-rule py-2 text-sm">
                    {invitation.name} · <span className="break-all">{invitation.contact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isOwner && (
            <ActionForm action={inviteVenueManager.bind(null, venue.id)} className="mt-4 space-y-3">
              <h3 className="text-sm font-semibold">{t("inviteHeading")}</h3>
              <Field label={common("name")} name="name" autoComplete="off" required />
              <Field label={common("emailOrPhone")} name="contact" autoComplete="off" required />
              <SubmitButton>{owner("createManagerLink")}</SubmitButton>
            </ActionForm>
          )}
        </details>
        {ratings.length > 0 && <section aria-labelledby="waiter-ratings" className="manager-setup-subsection">
          <h3 id="waiter-ratings">{reviews("waiterRatings")}</h3>
          <ul className="divide-y divide-rule">
            {ratings.map(rating => <li key={rating.waiterId} className="py-2">
              <p className="font-semibold">{rating.waiterName}</p>
              <p className="text-sm">{reviews("ratingsSummary", rating)}</p>
            </li>)}
          </ul>
        </section>}
      </section>

      {isOwner && <ServiceSettings venueId={venueId} settings={service} open={openService} />}

      <section id="venue-link" aria-labelledby="guest-qr-title" className="workspace-panel manager-setup-section">
        <h2 id="guest-qr-title">{manager("qr")}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t("venueLinkHelp")}</p>
        <CopyField label={t("venueLink")} value={link.url} />
        <Link href={`/v/${venue.linkToken}`} className="workspace-link" prefetch={false}>{t("openGuestMenu")}</Link>
        {/* A plain <img>: the QR is a private, per-request PNG, not something to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/manage/venues/${venue.id}/qr`}
          alt={t("venueQrAlt", { name: venue.name })}
          width={240}
          height={240}
          className="mt-4 h-auto max-w-full border border-rule bg-white"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(link.url + "\n")}`}
            download={`${venue.linkToken}-link.txt`}
            className="inline-flex min-h-11 items-center rounded-xl border border-ink/30 px-4 font-medium"
          >
            {t("downloadVenueLink")}
          </a>
          <a
            href={`/manage/venues/${venue.id}/qr?download=1`}
            download={link.qrFileName}
            className="inline-flex min-h-11 items-center rounded-xl border border-ink/30 px-4 font-medium"
          >
            {t("downloadQr")}
          </a>
        </div>
      </section>

      <section id="tables" aria-labelledby="tables-title" className="workspace-panel manager-setup-section">
        <h2 id="tables-title">{t("tables")}</h2>
        <ActionForm action={addTableRange.bind(null, venue.id)} className="my-4 flex flex-wrap items-end gap-3">
          <Field label={t("fromTable")} name="from" type="number" inputMode="numeric" min={1} required className="w-28 max-w-full" />
          <Field label={t("toTable")} name="to" type="number" inputMode="numeric" min={1} className="w-28 max-w-full" />
          <SubmitButton>{t("addTables")}</SubmitButton>
        </ActionForm>
        {tables.length === 0 ? (
          <p className="py-3 text-ink-muted">{t("noTables")}</p>
        ) : (
          <ul>
            {tables.map((table) => (
              <TableRow key={table.id} venueId={venue.id} table={table} />
            ))}
          </ul>
        )}
      </section>

    </>
  );
}

function SetupLink({ href, icon, label, hint }: {
  href: string; icon: "account" | "qr" | "tables" | "receipt"; label: string; hint: string;
}) {
  return <Link href={href} className="manager-setup-link">
    <span className="manager-setup-icon"><WaiterIcon name={icon} /></span>
    <span><strong>{label}</strong><small>{hint}</small></span>
    <WaiterIcon name="next" />
  </Link>;
}

function TableRow({ venueId, table }: { venueId: string; table: VenueTable }) {
  const t = useTranslations("StaffManage");
  return (
    <li className="border-b border-rule py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {t("table", { number: table.number })}
          {!table.active && <span className="ml-2 text-sm font-normal text-ink-muted">{t("notInUse")}</span>}
        </span>
        <ActionForm action={setActive.bind(null, venueId, table.id, !table.active)}
          confirmLabel={t("deactivate")} confirmMessage={table.active ? t("deactivateTableHelp", { number: table.number }) : undefined}>
          <SubmitButton variant="secondary">{t(table.active ? "deactivate" : "reactivate")}</SubmitButton>
        </ActionForm>
      </div>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 min-w-11 cursor-pointer items-center text-sm font-medium underline">
          {t("changeNumber")}
        </summary>
        <ActionForm action={renumber.bind(null, venueId, table.id)} className="flex flex-wrap items-end gap-3 pb-2">
          <Field
            label={t("newNumber", { number: table.number })}
            name="number"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={table.number}
            required
            className="w-44"
          />
          <SubmitButton>{t("save")}</SubmitButton>
        </ActionForm>
      </details>
    </li>
  );
}
