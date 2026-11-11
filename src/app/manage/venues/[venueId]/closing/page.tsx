import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { getClosingReport, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { formatBirr } from "@/ui/price";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { ClosingBillControls } from "./bill-controls";
import { closeUnpaid, removeLine, saveDiscount } from "./actions";

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base";
const unpaid = ["walked_out", "on_the_house", "entered_by_mistake"] as const;

export default async function ClosingPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/closing">) {
  const { venueId } = await params;
  const { date } = await searchParams;
  const actor = await requireStaff();
  const report = await getClosingReport(actor, { venueId, date: typeof date === "string" ? date : undefined }).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, bills, locale, format] = await Promise.all([getTranslations("Closing"), getTranslations("Bills"), getLocale(), getFormatter()]);
  const other = locale === "am" ? "en" : "am";
  const localTime = (time: Date) => format.dateTime(time, { hour: "numeric", minute: "numeric", timeZone: "Africa/Addis_Ababa" });

  return (
    <>
      <Link href={`/manage/venues/${venueId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("back")}</Link>
      <h1 className="font-display text-3xl">{t("title")}</h1>
      <section aria-labelledby="open-visits" className="mt-8">
        <h2 id="open-visits" className="text-xl font-semibold">{t("open")}</h2>
        {report.visits.length === 0 && <p className="py-3 text-ink-muted">{t("noneOpen")}</p>}
        <ul className="divide-y divide-rule">
          {report.visits.map((visit) => (
            <li key={visit.id} id={`visit-${visit.id}`} className="space-y-3 py-4">
              <h3 className="font-display text-2xl">{bills("table", { number: visit.tableNumber })}</h3>
              <p className="text-sm">{t("age", { minutes: visit.minutesOpen })} · {visit.waiterName ?? t("noWaiter")} · {bills("total", { amount: formatBirr(visit.totalSantim) })}</p>
              {(visit.preparedAt || visit.lines.length > 0) && (
                <ClosingBillControls venueId={venueId} visitId={visit.id} methods={report.methods}
                  bill={visit.preparedAt ? { visitId: visit.id, tableId: visit.tableId, totalSantim: visit.totalSantim, reminder: false } : undefined} />
              )}
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("adjust")}</summary>
                {visit.lines.length > 0 && (
                  <ActionForm action={removeLine.bind(null, venueId, visit.id)} className="mb-3 space-y-2">
                    <label className="block text-sm font-medium">
                      {t("line")}
                      <select name="line" className={field}>
                        {visit.lines.map((line) => (
                          <option key={`${line.orderId}:${line.lineIndex}`} value={`${line.orderId}:${line.lineIndex}`}>
                            {line.quantity} × {line.name[locale] || line.name[other]} · {formatBirr(line.unitPriceSantim * line.quantity)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ReasonField label={t("reason")} />
                    <SubmitButton variant="quiet">{t("removeLine")}</SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={saveDiscount.bind(null, venueId, visit.id)} className="mb-3 space-y-2">
                  <label className="block text-sm font-medium">
                    {t("discountAmount")}
                    <input name="amount" className={field} inputMode="decimal" required defaultValue={visit.discountSantim / 100} />
                  </label>
                  <ReasonField label={t("reason")} />
                  <SubmitButton variant="quiet">{t("discount")}</SubmitButton>
                </ActionForm>
                {visit.adjustments.length > 0 && (
                  <>
                    <h4 className="font-semibold">{t("history")}</h4>
                    <ul className="divide-y divide-rule">
                      {visit.adjustments.map((change) => (
                        <li key={change.id} className="py-2 text-sm">
                          <p>{change.kind === "discount" ? t("discountValue", { amount: formatBirr(Number(change.amountSantim)) }) : t("lineRemoved")} · {change.reason}</p>
                          <p className="text-ink-muted">{change.changedByName ?? change.changedBy} · {localTime(change.changedAt)}</p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("closeUnpaid")}</summary>
                <ActionForm action={closeUnpaid.bind(null, venueId, visit.id)} className="space-y-2">
                  <label className="block text-sm font-medium">
                    {t("reason")}
                    <select name="reason" className={field} required defaultValue="">
                      <option value="" disabled>{t("chooseReason")}</option>
                      {unpaid.map((reason) => <option key={reason} value={reason}>{t(reason)}</option>)}
                    </select>
                  </label>
                  <SubmitButton variant="quiet">{t("closeUnpaid")}</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="daily-payments" className="mt-8">
        <h2 id="daily-payments" className="text-xl font-semibold">{t("payments")}</h2>
        <form className="my-3 flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">{t("date")} <input type="date" name="date" className={field} defaultValue={report.date} required /></label>
          <button className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold">{t("showDate")}</button>
        </form>
        {report.payments.length === 0 && <p className="py-3 text-ink-muted">{t("nonePaid")}</p>}
        <ul className="divide-y divide-rule">
          {report.payments.map((payment) => (
            <li key={payment.visitId} id={`payment-${payment.visitId}`} className="py-2">
              <p className="font-semibold">{bills("table", { number: payment.tableNumber })} · {payment.method.provider ?? bills(payment.method.kind)} · {localTime(payment.confirmedAt)}</p>
              <p className="text-sm">{t("amounts", {
                receipt: formatBirr(payment.receiptAmountSantim), bill: formatBirr(payment.billTotalSantim), difference: formatBirr(payment.differenceSantim),
              })}</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-rule py-3 font-semibold">{t("dayTotal")}</p>
        <p className="text-sm">{t("amounts", {
          receipt: formatBirr(report.totals.receiptSantim), bill: formatBirr(report.totals.billSantim), difference: formatBirr(report.totals.differenceSantim),
        })}</p>
      </section>
      {report.closedAdjustments.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("closedHistory")}</summary>
          <ul className="divide-y divide-rule">
            {report.closedAdjustments.map((change) => (
              <li key={change.id} className="py-2 text-sm">
                <p className="font-semibold">{bills("table", { number: change.tableNumber })}</p>
                <p>{change.kind === "discount" ? t("discountValue", { amount: formatBirr(Number(change.amountSantim)) }) : t("lineRemoved")} · {change.reason}</p>
                <p className="text-ink-muted">{change.changedByName ?? change.changedBy} · {localTime(change.changedAt)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ReasonField({ label }: { label: string }) {
  return <label className="block text-sm font-medium">{label}<input name="reason" className={field} maxLength={300} required /></label>;
}
