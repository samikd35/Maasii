import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getVenueLink, getVenueSetup, getVenueStaff, MaasiiError, type Actor, type VenueTable } from "@/core";
import { requireStaff, siteUrl } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, CopyField, SubmitButton } from "@/ui/staff-forms";
import { addTableRange, inviteVenueManager, removeVenueWaiter, renumber, setActive, showWaiterJoinQr } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("venueTitle")} · Maasii` };
}

async function load(actor: Actor, venueId: string) {
  try {
    const [setup, staff, link] = await Promise.all([
      getVenueSetup(actor, { venueId }),
      getVenueStaff(actor, { venueId }),
      getVenueLink(actor, { venueId, siteUrl: await siteUrl() }),
    ]);
    return { setup, staff, link };
  } catch (error) {
    if (error instanceof MaasiiError && error.code !== "invalid_input") notFound();
    throw error;
  }
}

export default async function VenuePage({ params }: PageProps<"/manage/venues/[venueId]">) {
  const { venueId } = await params;
  const { setup, staff, link } = await load(await requireStaff(), venueId);
  const { venue, brand, tables, isOwner } = setup;
  const t = await getTranslations("StaffManage");
  const common = await getTranslations("Staff");
  const waiter = await getTranslations("StaffWaiter");
  const paymentOptions = await getTranslations("PaymentOptions");
  const menu = await getTranslations("VenueMenu");

  return (
    <>
      <Link href="/manage" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {t("allVenues")}
      </Link>
      <p className="mt-2 text-sm text-ink-muted">{brand.name}</p>
      <h1 className="font-display text-3xl">{venue.name}</h1>
      <div className="mt-2 flex flex-wrap gap-x-5">
        <Link
          href={`/manage/venues/${venue.id}/menu`}
          className="inline-flex min-h-11 items-center text-sm font-medium underline"
        >
          {menu("title")}
        </Link>
        <Link
          href={`/manage/venues/${venue.id}/payment-options`}
          className="inline-flex min-h-11 items-center text-sm font-medium underline"
        >
          {paymentOptions("title")}
        </Link>
      </div>

      <section aria-labelledby="waiters" className="mt-8">
        <SectionHeading id="waiters">{waiter("waiters")}</SectionHeading>
        {staff.waiters.length === 0 ? (
          <p className="py-3 text-ink-muted">{waiter("noWaiters")}</p>
        ) : (
          <ul>
            {staff.waiters.map(({ id, name }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-rule py-2">
                <span className="min-w-0 break-words">{name}</span>
                <ActionForm action={removeVenueWaiter.bind(null, venue.id, id)}>
                  <SubmitButton variant="quiet">{waiter("removeNamed", { name })}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={showWaiterJoinQr.bind(null, venue.id)} className="mt-3 space-y-3">
          {staff.waiters.length > 0 && (
            <label className="block text-sm font-medium">
              {waiter("waiterToConnect")}
              <select name="waiterId" className="mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base">
                <option value="">{waiter("newWaiter")}</option>
                {staff.waiters.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          <SubmitButton>{waiter("showJoinQr")}</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="venue-link" className="mt-8">
        <SectionHeading id="venue-link">{t("venueLink")}</SectionHeading>
        <p className="mt-2 text-sm text-ink-muted">{t("venueLinkHelp")}</p>
        <CopyField label={t("venueLink")} value={link.url} />
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
            className="inline-flex min-h-11 items-center rounded-md border border-ink/30 px-4 font-medium"
          >
            {t("downloadVenueLink")}
          </a>
          <a
            href={`/manage/venues/${venue.id}/qr?download=1`}
            download={link.qrFileName}
            className="inline-flex min-h-11 items-center rounded-md border border-ink/30 px-4 font-medium"
          >
            {t("downloadQr")}
          </a>
        </div>
      </section>

      <section aria-labelledby="tables" className="mt-10">
        <SectionHeading id="tables">{t("tables")}</SectionHeading>
        {tables.length === 0 ? (
          <p className="py-3 text-ink-muted">{t("noTables")}</p>
        ) : (
          <ul>
            {tables.map((table) => (
              <TableRow key={table.id} venueId={venue.id} table={table} />
            ))}
          </ul>
        )}
        <ActionForm action={addTableRange.bind(null, venue.id)} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={t("fromTable")} name="from" type="number" inputMode="numeric" min={1} required className="w-28" />
          <Field label={t("toTable")} name="to" type="number" inputMode="numeric" min={1} className="w-28" />
          <SubmitButton>{t("addTables")}</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="managers" className="mt-10">
        <SectionHeading id="managers">{t("managers")}</SectionHeading>
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
            <SubmitButton>{t("inviteManager")}</SubmitButton>
          </ActionForm>
        )}
      </section>
    </>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="border-b border-ink/70 pb-1.5 text-sm font-semibold tracking-wide uppercase">
      {children}
    </h2>
  );
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
        <form action={setActive.bind(null, venueId, table.id, !table.active)}>
          <SubmitButton variant="quiet">{t(table.active ? "deactivate" : "reactivate")}</SubmitButton>
        </form>
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
