"use client";

import { createTranslator, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Bill, DraftLine, getGuestVisit, Table } from "@/core";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { formatBirr, Price } from "@/ui/price";
import am from "../../../../messages/orders.am.json";
import en from "../../../../messages/orders.en.json";

type Line = DraftLine & { lineId: string };
type Pending = { requestId: string; table: Table; lines: Line[] };
type Device = { table?: Table; pending?: Pending };
type GuestVisit = NonNullable<Awaited<ReturnType<typeof getGuestVisit>>>;
type LiveBill = Omit<Bill, "preparedAt"> & { preparedAt: string };
type VenueFeed = OrderFeed & {
  available: boolean;
  tables: Table[];
  visit: (Omit<GuestVisit, "orders" | "bill" | "closedAt"> & { bill: LiveBill | null; closedAt: string | null }) | null;
};

export type SlipService = {
  tableLabel?: string;
  status?: string;
  locked: boolean;
  controls: ReactNode;
  orders: ReactNode;
};

const sendButton = "min-h-11 w-full rounded-lg bg-brand-readable px-4 text-sm font-semibold text-paper disabled:opacity-50";

function readDevice(key: string): Device {
  try {
    const saved: Device | null = JSON.parse(localStorage.getItem(key) ?? "null");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export default function OrderService({
  venueLinkToken, storageKey, lines, invalidDraft, onSent, render,
}: {
  venueLinkToken: string;
  storageKey: string;
  lines: Line[];
  invalidDraft: boolean;
  onSent: (sent: Line[]) => void;
  render: (service: SlipService) => ReactNode;
}) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: locale === "am" ? am : en });
  const url = `/v/${encodeURIComponent(venueLinkToken)}/orders`;
  const [device, setDevice] = useState(() => readDevice(storageKey));
  const current = useRef(device);
  const [feed, setFeed] = useState<VenueFeed>();
  const [loadError, setLoadError] = useState(false);
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<"chooseAgain" | "draftChanged" | "unavailable" | "requestConflict" | "billPrepared" | "orderTableBillPrepared">();

  const saveDevice = useCallback((next: Device) => {
    current.current = next;
    setDevice(next);
    try {
      if (next.table || next.pending) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {
      // The service remains available when the browser does not allow local storage.
    }
  }, [storageKey]);

  const hasTable = !!device.table;
  useEffect(() => watchOrders<VenueFeed>(url, (data) => {
    setFeed(data);
    setLoadError(false);
    setOrders(data.orders);
    if (!data.visit?.bill || data.visit.closedAt) {
      setError((previous) => previous === "billPrepared" ? undefined : previous);
    }
    const pending = current.current.pending;
    const confirmed = pending && data.orders.find(({ requestId }) => requestId === pending.requestId);
    if (pending && !confirmed) return;
    const waiting = data.orders.findLast(({ partyPending }) => partyPending);
    const table = waiting ? { id: waiting.tableId, number: waiting.tableNumber } : data.visit?.table;
    if (pending && confirmed) {
      onSent(pending.lines);
      setError(undefined);
      saveDevice({ table });
    } else if (table?.id !== current.current.table?.id || table?.number !== current.current.table?.number) {
      saveDevice({ table });
    }
  }, () => setLoadError(true)).stop, [url, hasTable, saveDevice, onSent]);

  async function send(table: Table) {
    if (sending) return;
    const pending = current.current.pending ?? { table, requestId: crypto.randomUUID(), lines };
    saveDevice({ ...current.current, pending });
    setError(undefined);
    setChoosing(false);
    setSending(true);
    try {
      const session = await fetch(url, { method: "PUT" });
      if (!session.ok) return;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: pending.requestId,
          tableId: pending.table.id,
          lines: pending.lines.map(({ dishId, choices, quantity, note }) => ({
            dishId, choiceIds: choices.map(({ choiceId }) => choiceId), quantity, note,
          })),
        }),
      });
      if (response.status === 409) {
        const { reason } = await response.json();
        if (reason === "orderRequestConflict") {
          setError("requestConflict");
          return;
        }
        if (reason === "billPrepared" || reason === "orderTableBillPrepared") {
          setError(reason);
        } else if (reason === "noRunningShift") {
          setError("unavailable");
          setFeed((previous) => previous && { ...previous, available: false });
        } else if (reason === "orderTableUnavailable") {
          setError("chooseAgain");
          setFeed((previous) => previous && { ...previous, tables: previous.tables.filter(({ id }) => id !== pending.table.id) });
          saveDevice({});
        } else {
          setError("draftChanged");
        }
        if (reason !== "orderTableUnavailable") saveDevice({ table: current.current.table });
        return;
      }
      if (!response.ok) return;
      const order: LiveOrder = await response.json();
      setOrders((previous) => previous.some(({ id }) => id === order.id)
        ? previous : [...previous.filter(({ visitId }) => visitId === order.visitId), order]);
      onSent(pending.lines);
      saveDevice({ table: { id: order.tableId, number: order.tableNumber } });
    } catch {
      // Keep the same request and Draft until the server acknowledges the Order.
    } finally {
      setSending(false);
    }
  }

  const table = device.table ?? device.pending?.table;
  const latest = orders.at(-1);
  const visit = feed?.visit?.id === latest?.visitId ? feed?.visit : null;
  const billIsPrepared = Boolean(visit?.bill && !visit.closedAt) || error === "billPrepared";
  const status = (order: LiveOrder) => {
    if (order.partyPending) return t("waitingForWaiter");
    return order.state === "accepted" ? t("accepted", { name: order.acceptedByName ?? "" }) : t(order.state);
  };
  const isAvailable = feed?.available ?? false;

  return render({
    tableLabel: table ? t("table", { number: table.number }) : undefined,
    status: visit?.bill ? t(visit.closedAt ? "billPaid" : "billReady") : latest ? status(latest) : undefined,
    locked: !!device.pending || sending,
    controls: (
      <>
        {error && error !== "billPrepared" && <p role="alert" className="mt-2 text-sm">{t(error)}</p>}
        {billIsPrepared && <p role="status" className="mt-2 text-sm">{t("billPrepared")}</p>}
        {feed && !isAvailable && error !== "unavailable" && <p className="mt-2 text-sm">{t("unavailable")}</p>}
        {loadError && !feed && <p role="status" className="mt-2 text-sm">{t("serviceUnavailable")}</p>}
        {sending ? <p role="status" className="mt-2 text-sm">{t("sending")}</p>
          : device.pending ? (
            <button type="button" onClick={() => void send(device.pending!.table)} className={`${sendButton} mt-2`}>
              {t("retry")}
            </button>
          ) : choosing && isAvailable ? (
            <fieldset className="mt-3">
              <legend className="text-sm font-semibold">{t("choose")}</legend>
              {feed ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {feed.tables.map((table) => (
                    <button key={table.id} type="button" onClick={() => void send(table)}
                      className="min-h-11 rounded-lg border border-rule px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ink">
                      {t("table", { number: table.number })}
                    </button>
                  ))}
                </div>
              ) : <p role="status" className="mt-2 text-sm">{t("serviceUnavailable")}</p>}
            </fieldset>
          ) : lines.length > 0 && (
            <button type="button" disabled={!isAvailable || invalidDraft || billIsPrepared}
              onClick={() => device.table && !visit?.closedAt ? void send(device.table) : setChoosing(true)}
              className={`${sendButton} mt-2`}>
              {t("send")}
            </button>
          )}
      </>
    ),
    orders: orders.length > 0 && (<>
      <section className="pb-4">
        <h3 className="mt-4 border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("orders")}</h3>
        <ol>
          {orders.map((order) => (
            <li key={order.id} className="border-b border-rule py-3">
              <p role="status" className="mb-2 text-sm font-semibold text-brand-readable">
                {order.state === "declined" ? t("declinedMessage") : status(order)}
              </p>
              <ul className="space-y-1">
                {order.lines.map((line, index) => (
                  <li key={index} className="flex justify-between gap-3 text-sm">
                    <div>
                      <p>{line.quantity} × {line.name[locale] || line.name[locale === "am" ? "en" : "am"]}</p>
                      {line.choices.length > 0 && (
                        <p className="text-ink-muted">
                          {line.choices.map((choice) => choice.name[locale] || choice.name[locale === "am" ? "en" : "am"]).join(", ")}
                        </p>
                      )}
                      {line.note && <p className="text-ink-muted italic">“{line.note}”</p>}
                    </div>
                    {visit?.removedLines.includes(`${order.id}:${index}`)
                      ? <span className="shrink-0 font-medium">{t("removedFromBill")}</span>
                      : line.dropReason === "sold_out"
                      ? <span className="shrink-0 font-medium">{t("soldOut")}</span>
                      : order.state !== "declined" && <Price santim={line.unitPriceSantim * line.quantity} />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
      {!!visit?.discountSantim && <p className="text-sm">{t("billDiscount", { amount: formatBirr(visit.discountSantim) })}</p>}
      {visit?.bill ? (
        <GuestBill bill={visit.bill} paid={!!visit.closedAt} options={visit.paymentOptions} />
      ) : visit && !visit.closedAt && <BillTotal totalSantim={visit.totalSantim} label={t("billTotal")} />}
    </>),
  });
}

function BillTotal({ totalSantim, label }: { totalSantim: number; label: string }) {
  return (
    <section aria-label={label} className="flex items-center justify-between border-t border-ink/70 py-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div aria-live="polite"><Price santim={totalSantim} /></div>
    </section>
  );
}

type GuestPaymentOption = GuestVisit["paymentOptions"][number];

function GuestBill({ bill, options, paid }: { bill: LiveBill; options: GuestPaymentOption[]; paid: boolean }) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: locale === "am" ? am : en });
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    section.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <>
      <section ref={section} aria-label={t("bill")} className="pb-1">
        <h3 className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("bill")}</h3>
        <p className="my-2 text-sm text-ink-muted">{t("notTaxReceipt")}</p>
        {paid && <p role="status" className="mb-2 text-sm font-semibold">{t("billPaid")}</p>}
        <ul className="space-y-2 pb-3">
          {bill.lines.map((line, index) => (
            <li key={index} className="flex items-center justify-between gap-3 text-sm">
              <span>{line.quantity} × {line.name[locale] || line.name[locale === "am" ? "en" : "am"]}</span>
              <Price santim={line.unitPriceSantim * line.quantity} />
            </li>
          ))}
        </ul>
        <BillTotal totalSantim={bill.totalSantim} label={t("billTotal")} />
      </section>
      {options.length > 0 && (
        <section aria-label={t("paymentOptions")} className="pb-5">
          <h3 className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("paymentOptions")}</h3>
          <ul className="divide-y divide-rule">
            {options.map((option) => (
              <li key={option.id} className="space-y-1 py-3 text-sm">
                <p className="font-semibold">{option.provider ?? t(option.kind)}</p>
                {option.recipientName && <p>{option.recipientName}</p>}
                {option.accountOrMerchantCode && (
                  <CopyPaymentCode key={option.accountOrMerchantCode} code={option.accountOrMerchantCode} t={t} />
                )}
                {option.qrImage && (
                  // Payment Options carry bounded raster images.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.qrImage} alt={t("paymentQr")} width={128} height={128} loading="lazy"
                    className="h-auto max-w-full bg-white" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CopyPaymentCode({ code, t }: { code: string; t: (key: "copyCode" | "copied" | "copyFailed") => string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }
  return (
    <>
      <p className="break-all font-mono">{code}</p>
      <button type="button" onClick={() => void copy()}
        className="min-h-11 rounded-md border border-ink/40 px-3 font-medium">
        {t(copied ? "copied" : "copyCode")}
      </button>
      {failed && <p role="status">{t("copyFailed")}</p>}
    </>
  );
}
