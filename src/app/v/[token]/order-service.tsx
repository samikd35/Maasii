"use client";

import { createTranslator, useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DraftLine, Table } from "@/core";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { Price } from "@/ui/price";
import am from "../../../../messages/orders.am.json";
import en from "../../../../messages/orders.en.json";

type Line = DraftLine & { lineId: string };
type Pending = { requestId: string; table: Table; lines: Line[] };
type Device = { table?: Table; pending?: Pending };
type VenueFeed = OrderFeed & { available: boolean; tables: Table[] };

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
  const [error, setError] = useState<"chooseAgain" | "draftChanged" | "unavailable" | "requestConflict">();

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
    const pending = current.current.pending;
    const confirmed = pending && data.orders.find(({ requestId }) => requestId === pending.requestId);
    if (pending && !confirmed) return;
    const last = confirmed || data.orders.at(-1);
    const table = last ? { id: last.tableId, number: last.tableNumber } : undefined;
    if (pending && confirmed) {
      onSent(pending.lines);
      setError(undefined);
      saveDevice({ table });
    } else if (table?.id !== current.current.table?.id || table?.number !== current.current.table?.number) {
      saveDevice({ table });
    }
  }, () => setLoadError(true)), [url, hasTable, saveDevice, onSent]);

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
        if (reason === "noRunningShift") {
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
      setOrders((previous) => [...previous.filter(({ id }) => id !== order.id), order]);
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
  const status = (order: LiveOrder) => order.state === "accepted"
    ? t("accepted", { name: order.acceptedByName ?? "" }) : t("sent");
  const isAvailable = feed?.available ?? false;

  return render({
    tableLabel: table ? t("table", { number: table.number }) : undefined,
    status: latest ? status(latest) : undefined,
    locked: !!device.pending || sending,
    controls: (
      <>
        {error && <p role="alert" className="mt-2 text-sm">{t(error)}</p>}
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
            <button type="button" disabled={!isAvailable || invalidDraft}
              onClick={() => device.table ? void send(device.table) : setChoosing(true)}
              className={`${sendButton} mt-2`}>
              {t("send")}
            </button>
          )}
      </>
    ),
    orders: orders.length > 0 && (
      <section className="pb-4">
        <h3 className="mt-4 border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("orders")}</h3>
        <ol>
          {orders.map((order) => (
            <li key={order.id} className="border-b border-rule py-3">
              <p role="status" className="mb-2 text-sm font-semibold text-brand-readable">{status(order)}</p>
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
                    <Price santim={line.unitPriceSantim * line.quantity} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    ),
  });
}
