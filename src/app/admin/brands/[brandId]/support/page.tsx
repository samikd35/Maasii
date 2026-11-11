import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { MaasiiError, openBrandSupport } from "@/core";
import { requireAdmin } from "@/lib/session";
import { PaymentOptionValues } from "@/ui/payment-option-values";

async function load(brandId: string) {
  const actor = await requireAdmin("support");
  try {
    return await openBrandSupport(actor, { brandId });
  } catch (error) {
    if (error instanceof MaasiiError) notFound();
    throw error;
  }
}

export default async function BrandSupportPage({ params }: PageProps<"/admin/brands/[brandId]/support">) {
  const { brandId } = await params;
  const [{ brand, owners, venues }, t, staff, manage, waiter, payment, format] = await Promise.all([
    load(brandId),
    getTranslations("StaffAdmin"),
    getTranslations("Staff"),
    getTranslations("StaffManage"),
    getTranslations("StaffWaiter"),
    getTranslations("PaymentOptions"),
    getFormatter(),
  ]);
  const visitTime = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {t("allBrands")}
      </Link>
      <p className="mt-2 text-sm text-ink-muted">{t("supportHeading")}</p>
      <h1 className="font-display text-3xl break-words">{brand.name}</h1>

      <section aria-labelledby="support-owners" className="mt-6">
        <h2 id="support-owners" className="font-semibold">{t("owners")}</h2>
        {owners.length === 0 ? <p className="text-sm text-ink-muted">{t("noSupportOwners")}</p> : (
          <ul className="mt-1 space-y-1 text-sm">
            {owners.map((owner) => <li key={owner.userId} className="break-words">{owner.name ?? staff("owner")}</li>)}
          </ul>
        )}
      </section>

      {venues.length === 0 && <p className="mt-6 text-sm text-ink-muted">{manage("noVenues")}</p>}
      {venues.map((venue) => (
        <section key={venue.id} aria-labelledby={`venue-${venue.id}`} className="mt-6 space-y-4 rounded-md border border-rule p-4">
          <div>
            <h2 id={`venue-${venue.id}`} className="font-display text-xl break-words">{venue.name}</h2>
            <Link href={`/v/${venue.linkToken}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
              {manage("venueLink")}
            </Link>
          </div>
          <div>
            <h3 className="font-semibold">{manage("tables")}</h3>
            {venue.tables.length === 0 ? <p className="text-sm text-ink-muted">{t("noSupportTables")}</p> : (
              <ul className="mt-1 flex flex-wrap gap-2 text-sm">
                {venue.tables.map((table) => (
                  <li key={table.id} className="rounded-md border border-rule px-2 py-1">
                    {manage("table", { number: table.number })}
                    {!table.active && <span className="text-ink-muted"> · {manage("notInUse")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">{t("supportStaff")}</h3>
            {venue.staff.length === 0 ? <p className="text-sm text-ink-muted">{t("noSupportStaff")}</p> : (
              <ul className="mt-1 space-y-1 text-sm">
                {venue.staff.map((person) => (
                  <li key={person.id} className="break-words">
                    {person.name && <><span>{person.name}</span> · </>}
                    <span className="text-ink-muted">{person.role === "manager" ? staff("manager") : waiter("waiter")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold">{payment("title")}</h3>
            {venue.paymentOptions.length === 0 && <p className="text-sm text-ink-muted">{payment("empty")}</p>}
            {venue.paymentOptions.map((option) => (
              <article key={option.id} className="mt-2 rounded-md border border-rule p-3">
                <h4 className="font-medium break-words">{option.provider ?? payment(option.kind)}</h4>
                <PaymentOptionValues option={option} />
              </article>
            ))}
          </div>
          <section aria-labelledby={`visits-${venue.id}`}>
            <h3 id={`visits-${venue.id}`} className="font-semibold">{t("supportVisits")}</h3>
            {venue.visits.length === 0 ? <p className="text-sm text-ink-muted">{t("noSupportVisits")}</p> : (
              <ul className="mt-1 divide-y divide-rule text-sm">
                {venue.visits.map((visit) => (
                  <li key={visit.id} className="py-2">
                    <p className="font-medium">{manage("table", { number: visit.tableNumber })}</p>
                    <p>
                      {t("visitOpened")} <time dateTime={visit.openedAt.toISOString()}>{visitTime(visit.openedAt)}</time>
                    </p>
                    {visit.closedAt && (
                      <p>
                        {t("visitClosed")} <time dateTime={visit.closedAt.toISOString()}>{visitTime(visit.closedAt)}</time>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      ))}
    </>
  );
}
