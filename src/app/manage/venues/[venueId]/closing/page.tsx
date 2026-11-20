import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";
import { getClosingReport, MaasiiError } from "@/core";
import { requireStaff } from "@/lib/session";
import { formatBirr } from "@/ui/price";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { ClosingBillControls, ClosingReceipts, ClosingTask } from "./bill-controls";
import { closeUnpaid, removeLine, saveDiscount } from "./actions";

const unpaid = ["walked_out", "on_the_house", "entered_by_mistake"] as const;
type Visit = Awaited<ReturnType<typeof getClosingReport>>["visits"][number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Closing");
  return { title: t("title") + " · Maasii" };
}

export default async function ClosingPage({ params, searchParams }: PageProps<"/manage/venues/[venueId]/closing">) {
  const { venueId } = await params;
  const { date, tab, filter } = await searchParams;
  const payments = tab === "payments" || (tab !== "visits" && typeof date === "string");
  const differencesOnly = filter === "differences";
  const report = await getClosingReport(await requireStaff(), { venueId, date: typeof date === "string" ? date : undefined }).catch(error => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, bills, format, { Bills, Closing }] = await Promise.all([
    getTranslations("Closing"), getTranslations("Bills"), getFormatter(), getMessages(),
  ]);
  const time = (value: Date) => format.dateTime(value, { hour: "numeric", minute: "numeric", timeZone: "Africa/Addis_Ababa" });
  const root = "/manage/venues/" + venueId + "/closing";
  const differences = report.payments.filter(payment => payment.differenceSantim !== 0);
  const visiblePayments = differencesOnly ? differences : report.payments;
  const day = root + "?tab=payments&date=" + report.date;
  const ready = report.visits.filter(visit => visit.preparedAt && !visit.waiting)
    .sort((a, b) => a.preparedAt!.getTime() - b.preparedAt!.getTime());
  const groups = ([
    { title: "readyForReceipt", short: "readyJump", visits: ready, icon: "receipt" },
    { title: "ordersToReview", short: "waitingJump", visits: report.visits.filter(visit => visit.waiting), icon: "queue" },
    { title: "otherOpen", short: "inService", visits: report.visits.filter(visit => !visit.waiting && !visit.preparedAt), icon: "tables" },
  ] as const).filter(group => group.visits.length);

  const amounts = (receiptSantim: number, billSantim: number, differenceSantim: number) => <dl className="receipt-values manager-amounts">
    <div><dt>{t("receiptAmount")}</dt><dd>{formatBirr(receiptSantim)} ETB</dd></div>
    <div><dt>{t("billAmount")}</dt><dd>{formatBirr(billSantim)} ETB</dd></div>
    <div><dt>{t("differenceAmount")}</dt><dd className={differenceSantim ? "manager-difference" : undefined}>
      {differenceSantim > 0 ? "+" : ""}{formatBirr(differenceSantim)} ETB
    </dd></div>
  </dl>;

  return <>
    <h1>{t("title")}</h1>
    <nav className="manager-switches" aria-label={t("title")}>
      <Link href={root} aria-current={!payments ? "page" : undefined}>
        <WaiterIcon name="tables" />{t("shortOpen")}
      </Link>
      <Link href={day} aria-current={payments ? "page" : undefined}>
        <WaiterIcon name="receipt" />{t("shortPayments")}
      </Link>
    </nav>
    {!payments && <section aria-labelledby="open-visits">
      <div className="manager-section-heading">
        <h2 id="open-visits">{t("open")}</h2>
      </div>
      {groups.length > 1 && <nav className="manager-switches" aria-label={t("open")}>
        {groups.map(({ title, short, visits, icon }) => <a className="workspace-button" key={title} href={"#" + title}>
          <WaiterIcon name={icon} />{t(short)} <span className="manager-count">{visits.length}</span>
        </a>)}
      </nav>}
      <NextIntlClientProvider messages={{ Bills, Closing }}>
        <ClosingReceipts root={root}>
          {report.visits.length === 0 && <p className="manager-empty">{t("noneOpen")}</p>}
          {groups.map(({ title, visits }) => <section key={title} className="manager-close-group" aria-labelledby={title}>
            <h3 id={title} tabIndex={-1}>{t(title)} <span className="manager-count">{visits.length}</span></h3>
            <ul className="manager-list">
              {visits.map(visit => <VisitRow key={visit.id} visit={visit} venueId={venueId} methods={report.methods} />)}
            </ul>
          </section>)}
        </ClosingReceipts>
      </NextIntlClientProvider>
    </section>}
    {payments && <section aria-labelledby="daily-payments">
      <div className="manager-section-heading"><h2 id="daily-payments">{t("payments")}</h2></div>
      <div className="manager-report-head workspace-panel">
        <div className="manager-report-total">
          <p className="font-semibold"><time dateTime={report.date}>{format.dateTime(new Date(report.date + "T00:00:00Z"), { dateStyle: "long", timeZone: "UTC" })}</time></p>
          {amounts(report.totals.receiptSantim, report.totals.billSantim, report.totals.differenceSantim)}
          {differences.length > 0 && <span className="manager-chip" data-tone="waiting">
            <WaiterIcon name="alert" />{t("receiptCount", { count: differences.length })}
          </span>}
        </div>
        <details>
          <summary className="workspace-button manager-disclosure"><WaiterIcon name="calendar" />{t("changeDate")}</summary>
          <form className="manager-actions mt-2" aria-label={t("changeDate")}>
            <input type="hidden" name="tab" value="payments" />
            {differencesOnly && <input type="hidden" name="filter" value="differences" />}
            <label className="text-sm font-medium">{t("date")}<input type="date" name="date" className="workspace-input" defaultValue={report.date} required /></label>
            <button className="workspace-button workspace-primary">{t("showDate")}</button>
          </form>
        </details>
      </div>
      <nav className="manager-switches" aria-label={t("receiptFilter")}>
        <Link href={day} aria-current={!differencesOnly ? "page" : undefined}>{t("allReceipts")}</Link>
        <Link href={day + "&filter=differences"} aria-current={differencesOnly ? "page" : undefined}>{t("differencesOnly")}</Link>
      </nav>
      {!visiblePayments.length && <p className="manager-empty">{t(differencesOnly ? "noDifferences" : "nonePaid")}</p>}
      {!!visiblePayments.length && <ul className="manager-list">
        {visiblePayments.map(payment => <li key={payment.visitId} id={"payment-" + payment.visitId} className="manager-receipt-row">
          <div>
            <h3>{bills("table", { number: payment.tableNumber })}</h3>
            <p className="manager-muted">{payment.method.provider ?? bills(payment.method.kind)} · {time(payment.confirmedAt)}</p>
          </div>
          {amounts(payment.receiptAmountSantim, payment.billTotalSantim, payment.differenceSantim)}
        </li>)}
      </ul>}
      {report.closedAdjustments.length > 0 && <details className="workspace-panel mt-4">
        <summary className="workspace-summary">{t("closedHistory")}</summary>
        <ul className="divide-y divide-rule">
          {report.closedAdjustments.map(change => <li key={change.id} className="py-2 text-sm">
            <p className="font-semibold">{bills("table", { number: change.tableNumber })}</p>
            <p>{change.kind === "discount" ? t("discountValue", { amount: formatBirr(Number(change.amountSantim)) }) : t("lineRemoved")} · {change.reason}</p>
            <p className="manager-muted">{change.changedByName ?? change.changedBy} · {time(change.changedAt)}</p>
          </li>)}
        </ul>
      </details>}
    </section>}
  </>;
}

async function VisitRow({ visit, venueId, methods }: {
  visit: Visit; venueId: string; methods: Awaited<ReturnType<typeof getClosingReport>>["methods"];
}) {
  const [t, bills, locale, format] = await Promise.all([getTranslations("Closing"), getTranslations("Bills"), getLocale(), getFormatter()]);
  const other = locale === "am" ? "en" : "am";
  const table = bills("table", { number: visit.tableNumber });
  const floor = "/manage/venues/" + venueId + "/floor#floor-visit-" + visit.id;
  return <li id={"visit-" + visit.id} className="manager-visit-row">
    <div className="manager-row-heading">
      <div>
        <h3>{table}</h3>
        <p className="manager-muted">{t("age", { minutes: visit.minutesOpen })} · {visit.waiterName ?? t("noWaiter")}</p>
      </div>
      <div className="manager-visit-total">
        <span>{t(visit.preparedAt ? "billAmount" : "runningTotal")}</span>
        <strong>{formatBirr(visit.totalSantim)} ETB</strong>
      </div>
    </div>
    <div className="manager-actions">
      {!!visit.waiting && <span className="manager-chip" data-tone="waiting"><WaiterIcon name="clock" />{t("waitingCount", { count: visit.waiting })}</span>}
      {visit.preparedAt && <span className="manager-chip" data-tone={visit.overdue ? "waiting" : "bill"}>
        <WaiterIcon name="receipt" />{t(visit.overdue ? "overdue" : "billReady")}
      </span>}
      {visit.partyPending && <span className="manager-chip" data-tone="waiting"><WaiterIcon name="account" />{t("newParty")}</span>}
      {!visit.waiting && !visit.preparedAt && <span className="manager-chip" data-tone="live">{t("inService")}</span>}
    </div>
    {visit.waiting > 0 ?
      <Link href={floor} className="workspace-button workspace-primary"><WaiterIcon name="queue" />{t("reviewWaiting")}</Link>
      : (visit.preparedAt || visit.hasAccepted) && <ClosingBillControls venueId={venueId} visitId={visit.id} tableNumber={visit.tableNumber}
        methods={methods} partyPending={visit.partyPending} bill={visit.preparedAt ? {
          visitId: visit.id, tableId: visit.tableId, preparedAt: visit.preparedAt.toISOString(), totalSantim: visit.totalSantim, reminder: false,
        } : undefined} />}
    <details className="manager-row-more">
      <summary className="workspace-summary"><WaiterIcon name="more" />{t("visitActions")}</summary>
      <div className="manager-actions">
        <ClosingTask label={t("adjust")} title={t("adjustFor", { number: visit.tableNumber })}>
          <div className="waiter-receipt-total"><WaiterIcon name="receipt" />{bills("total", { amount: formatBirr(visit.totalSantim) })}</div>
          {visit.lines.length > 0 && <ActionForm action={removeLine.bind(null, venueId, visit.id)} className="manager-task-form">
            <label>{t("line")}
              <select name="line" className="workspace-input">
                {visit.lines.map(line => <option key={line.orderId + ":" + line.lineIndex} value={line.orderId + ":" + line.lineIndex}>
                  {line.quantity} × {line.name[locale] || line.name[other]} · {formatBirr(line.unitPriceSantim * line.quantity)} ETB
                </option>)}
              </select>
            </label>
            <ReasonField label={t("reason")} />
            <SubmitButton variant="secondary">{t("removeLine")}</SubmitButton>
          </ActionForm>}
          <ActionForm action={saveDiscount.bind(null, venueId, visit.id)} className="manager-task-form">
            <label>{t("discountAmount")}
              <input name="amount" key={visit.discountSantim} className="workspace-input" inputMode="decimal" required defaultValue={visit.discountSantim / 100} />
            </label>
            <ReasonField label={t("reason")} />
            <SubmitButton>{t("discount")}</SubmitButton>
          </ActionForm>
          {!!visit.adjustments.length && <section className="workspace-panel mt-3">
            <h3>{t("history")}</h3>
            <ul className="divide-y divide-rule">
              {visit.adjustments.map(change => <li key={change.id} className="py-2 text-sm">
                <p>{change.kind === "discount" ? t("discountValue", { amount: formatBirr(Number(change.amountSantim)) }) : t("lineRemoved")} · {change.reason}</p>
                <p className="manager-muted">{change.changedByName ?? change.changedBy} · {format.dateTime(change.changedAt, { timeStyle: "short", timeZone: "Africa/Addis_Ababa" })}</p>
              </li>)}
            </ul>
          </section>}
        </ClosingTask>
        <ClosingTask destructive label={t("closeUnpaid")} title={t("unpaidFor", { number: visit.tableNumber })}>
          <p>{t("unpaidConsequence", { table: visit.tableNumber })}</p>
          {!!visit.waiting && <p className="manager-notice" data-tone="waiting"><WaiterIcon name="alert" />{t("pendingUnpaid")}</p>}
          <ActionForm action={closeUnpaid.bind(null, venueId, visit.id)} className="manager-task-form">
            <label>{t("reason")}
              <select name="reason" className="workspace-input" required defaultValue="">
                <option value="" disabled>{t("chooseReason")}</option>
                {unpaid.map(reason => <option key={reason} value={reason}>{t(reason)}</option>)}
              </select>
            </label>
            <SubmitButton variant="destructive">{t("closeUnpaid")}</SubmitButton>
          </ActionForm>
        </ClosingTask>
      </div>
    </details>
  </li>;
}

function ReasonField({ label }: { label: string }) {
  return <label>{label}<input name="reason" className="workspace-input" maxLength={300} required /></label>;
}
