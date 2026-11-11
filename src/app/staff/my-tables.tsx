"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_QUANTITY } from "@/core/browser";
import type { getMyTableOrders, PreparedBill } from "@/core";
import type { Messages } from "@/i18n/messages";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { formatBirr } from "@/ui/price";
import { BillControls } from "./bill-controls";
import { playOrderChime } from "./order-chime";

type StaffLiveOrder = LiveOrder & { canCorrect: boolean };
type StaffOrderFeed = OrderFeed & Omit<Awaited<ReturnType<typeof getMyTableOrders>>, "orders" | "topic" | "bills"> & {
  orders: StaffLiveOrder[];
  bills: (Omit<PreparedBill, "preparedAt"> & { preparedAt: string })[];
};
type Action = { action: "accept"; soldOutLineIndices: number[] }
  | { action: "decline" }
  | { action: "undo"; decisionId: string }
  | { action: "correct"; lineIndex: number; quantity: number | null; reason: string }
  | { action: "moveOrder"; tableId: string }
  | { action: "moveVisit"; visitId: string; tableId: string };
type UndoableOrder = LiveOrder & { decisionId: string; undoUntil: string };
type ErrorReason = keyof Messages["StaffErrors"];

export function MyTables({ tableId, tableNumber }: { tableId: string; tableNumber: number } | { tableId?: never; tableNumber?: never }) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const billing = useTranslations("Bills");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const heading = useId();
  const [orders, setOrders] = useState<StaffLiveOrder[]>([]);
  const [feed, setFeed] = useState<StaffOrderFeed>();
  const refresh = useRef<() => Promise<void>>(async () => {});
  const [now, setNow] = useState(Date.now);
  const [working, setWorking] = useState<{ orderId: string; action: Action["action"] }>();
  const [decisionError, setDecisionError] = useState<ErrorReason | "decisionError">();
  const [soldOut, setSoldOut] = useState<Record<string, number[]>>({});
  const [undoable, setUndoable] = useState<UndoableOrder[]>([]);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    let previous: Map<string, string | null> | undefined;
    const watcher = watchOrders<StaffOrderFeed>("/staff/orders", (data) => {
      const { orders } = data;
      const pending = orders.filter(({ state }) => state === "sent");
      const seen = previous;
      if (seen && pending.some(({ id, escalatedAt }) => seen.get(id) !== escalatedAt)) playOrderChime();
      previous = new Map(pending.map(({ id, escalatedAt }) => [id, escalatedAt]));
      setFeed(data);
      setOrders(orders);
      setRefreshError(false);
    }, (status) => {
      if (status === 403) {
        setOrders([]);
        setFeed(undefined);
        setUndoable([]);
        router.refresh();
      } else {
        setRefreshError(true);
      }
    });
    refresh.current = watcher.refresh;
    return watcher.stop;
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!undoable.length) return;
    const next = Math.min(...undoable.map(({ undoUntil }) => Date.parse(undoUntil)));
    const timer = window.setTimeout(() => {
      const at = Date.now();
      setUndoable((current) => current.filter(({ undoUntil }) => Date.parse(undoUntil) > at));
    }, Math.max(0, next - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undoable]);

  async function decide(orderId: string, command: Action) {
    setWorking({ orderId, action: command.action });
    setDecisionError(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...command }),
      });
      if (response.status === 403) {
        setOrders([]);
        setUndoable([]);
        router.refresh();
        return;
      }
      if (!response.ok) {
        const { reason }: { reason?: ErrorReason } = await response.json();
        setDecisionError(reason ?? "decisionError");
      } else if (response.status !== 204) {
        const decision: UndoableOrder | LiveOrder = await response.json();
        setUndoable((current) => {
          const rest = current.filter(({ id }) => id !== orderId);
          return "decisionId" in decision ? [...rest, decision] : rest;
        });
        setSoldOut((current) => {
          const next = { ...current };
          delete next[orderId];
          return next;
        });
      }
      await refresh.current();
    } catch {
      setDecisionError("decisionError");
    } finally {
      setWorking(undefined);
    }
  }

  const visibleOrders = tableId ? orders.filter((order) => order.tableId === tableId) : orders;
  const activeVisit = feed?.tableBills.find((visit) => visit.tableId === tableId);
  const showQuickAdd = tableId && feed?.assignedTables.some((table) => table.id === tableId)
    && !feed.bills.some((bill) => bill.tableId === tableId);
  const emptyAssigned = tableId ? [] : feed?.assignedTables.filter((table) => !orders.some((order) => order.tableId === table.id)) ?? [];
  const bills = new Map(feed?.bills.map((bill) => [bill.visitId, bill]));
  const billVisitIds = new Set(feed?.billVisitIds);
  const firstOrder = new Map([...visibleOrders].reverse().map(({ visitId, id }) => [visitId, id]));
  const partyVisitIds = new Set(visibleOrders.filter(({ partyPending }) => partyPending).map(({ visitId }) => visitId));
  const firstAccepted = new Map(visibleOrders.filter(({ state, visitId }) => state === "accepted" && billVisitIds.has(visitId)).reverse()
    .map((order) => [order.visitId, order.id]));

  return (
    <section className="mt-8" aria-labelledby={heading}>
      {tableId
        ? <h1 id={heading} className="font-display text-3xl">{t("table", { number: tableNumber })}</h1>
        : <h2 id={heading} className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("heading")}</h2>}
      {tableId && feed && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3">
          <p className="font-semibold">{billing("total", { amount: formatBirr(activeVisit?.totalSantim ?? 0) })}</p>
          {showQuickAdd && (
            <Link href={`/staff/tables/${tableId}/quick-add`} className="inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-sm font-semibold text-paper">
              {t("quickAdd")}
            </Link>
          )}
        </div>
      )}
      {refreshError && <p role="status" className="mt-3 text-sm">{t("refreshError")}</p>}
      {decisionError && (
        <p role="alert" className="mt-3 text-sm font-medium">
          {decisionError === "decisionError" ? t("decisionError")
            : decisionError === "billPrepared" ? t("billPrepared") : errors(decisionError)}
        </p>
      )}
      {undoable.map((order) => (
        <div key={order.decisionId} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rule p-2">
          <p role="status" className="text-sm">
            {t("table", { number: order.tableNumber })} · {t(order.state === "declined" ? "declined" : "acceptedOrder")}
          </p>
          <button type="button" disabled={!!working}
            onClick={() => void decide(order.id, { action: "undo", decisionId: order.decisionId })}
            className="min-h-11 rounded-lg border border-ink/30 px-4 text-sm font-semibold disabled:opacity-50">
            {t("undo")}
          </button>
        </div>
      ))}
      {visibleOrders.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t("empty")}</p>}
      <ul className="divide-y divide-rule">
        {visibleOrders.map((order) => {
          const bill = bills.get(order.visitId);
          const destinations = feed?.moveTables.filter(({ id }) => id !== order.tableId) ?? [];
          const drops = soldOut[order.id] ?? [];
          const seconds = Math.max(0, Math.floor((now - Date.parse(order.sentAt)) / 1000));
          const waiting = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
          return (
            <li key={order.id} className="space-y-2 py-4"
              style={order.state === "sent" ? { background: "var(--color-paper-deep)", borderInlineStart: "3px solid var(--color-ink)", paddingInline: "1rem" } : undefined}>
              <div className="flex items-center justify-between gap-3">
                {!tableId && (
                  <h3 className="font-display text-2xl">
                    <Link className="inline-flex min-h-11 items-center underline" href={`/staff/tables/${order.tableId}`}>
                      {t("table", { number: order.tableNumber })}
                    </Link>
                  </h3>
                )}
                {order.state === "sent" && (
                  <p role="timer" className="text-sm tabular-nums text-ink-muted">{t("waiting", { time: waiting })}</p>
                )}
              </div>
              {tableId && <p className="text-sm font-semibold">{t(order.source === "waiter" ? "waiterSource" : "guestSource")}</p>}
              {order.carriedOver && <p className="text-sm font-semibold">
                {order.carriedFrom ? t("carriedFrom", { name: order.carriedFrom }) : t("carriedOver")}
              </p>}
              {order.state === "sent" && (
                <p role="status" className="text-sm font-semibold">
                  {order.partyPending ? t("newParty", { number: order.tableNumber }) : t(order.escalatedAt ? "escalatedOrder" : "newOrder")}
                </p>
              )}
              <ul className="space-y-2">
                {order.lines.map((line, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="tabular-nums">{line.quantity} ×</span>
                    <div>
                      {line.name[locale] && <p lang={locale} className="font-semibold">{line.name[locale]}</p>}
                      {line.name[other] && <p lang={other} className={line.name[locale] ? "text-sm text-ink-muted" : "font-semibold"}>{line.name[other]}</p>}
                      {line.choices.map((choice) => (
                        <p key={choice.id} className="text-sm text-ink-muted">
                          {([locale, other] as const).map((lang) => choice.name[lang] && <span key={lang} lang={lang} className="me-2">{choice.name[lang]}</span>)}
                        </p>
                      ))}
                      {line.note && <p className="text-sm italic">“{line.note}”</p>}
                      {line.dropReason === "sold_out" && <p className="text-sm font-medium">{t("soldOut")}</p>}
                      {(line.dropReason === "waiter_removed" || activeVisit?.removedLines.includes(`${order.id}:${index}`))
                        && <p className="text-sm font-medium">{t("removedLine")}</p>}
                      {tableId && order.canCorrect && !bill && !line.dropReason && !activeVisit?.removedLines.includes(`${order.id}:${index}`) && (
                        <CorrectionForm key={line.quantity} quantity={line.quantity} disabled={!!working}
                          submit={(quantity, reason) => void decide(order.id, { action: "correct", lineIndex: index, quantity, reason })} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {order.state === "sent" ? (
                order.partyPending ? null : (
                  <>
                    <button type="button" disabled={!!working || !!bill || drops.length === order.lines.length}
                      onClick={() => void decide(order.id, { action: "accept", soldOutLineIndices: drops })}
                      className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-50">
                      {t(working?.orderId === order.id && working.action === "accept" ? "accepting" : "accept")}
                    </button>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("decisions")}</summary>
                      <fieldset className="space-y-2 pb-2" disabled={!!working || !!bill}>
                        <legend className="sr-only">{t("soldOut")}</legend>
                        {order.lines.map((line, index) => (
                          <label key={index} className="flex min-h-11 items-center gap-3 text-sm">
                            <input type="checkbox" className="size-5" checked={drops.includes(index)}
                              onChange={(event) => {
                                const next = event.target.checked ? [...drops, index] : drops.filter((line) => line !== index);
                                setSoldOut((current) => ({ ...current, [order.id]: next }));
                              }} />
                            <span>
                              {t("markSoldOut", { dish: line.name[locale] || line.name[other] })}
                              <span className="block text-ink-muted">
                                {[line.quantity + " ×", ...line.choices.map((choice) => choice.name[locale] || choice.name[other]), line.note]
                                  .filter(Boolean).join(" · ")}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      {drops.length === order.lines.length && (
                        <p className="mb-2 text-sm">{errors("orderAllLinesDropped")}</p>
                      )}
                      <button type="button" disabled={!!working} onClick={() => void decide(order.id, { action: "decline" })}
                        className="min-h-11 rounded-lg border border-ink/30 px-4 text-sm font-semibold disabled:opacity-50">
                        {t("decline")}
                      </button>
                    </details>
                  </>
                )
              ) : (
                <p role="status" className="text-sm font-semibold">{t("accepted", { name: order.acceptedByName ?? "" })}</p>
              )}
              {destinations.length > 0 && !bill && !order.partyPending && (
                <MoveControl label={t("moveOrder")} tables={destinations} disabled={!!working}
                  submit={(tableId) => void decide(order.id, { action: "moveOrder", tableId })} />
              )}
              {destinations.length > 0 && billVisitIds.has(order.visitId) && firstOrder.get(order.visitId) === order.id && (
                <MoveControl label={t("moveVisit")} tables={destinations} disabled={!!working}
                  submit={(tableId) => void decide(order.id, { action: "moveVisit", visitId: order.visitId, tableId })} />
              )}
              {feed && firstAccepted.get(order.visitId) === order.id && (
                <BillControls
                  key={bill?.preparedAt ?? order.visitId}
                  target={{ venueId: feed.venueId, visitId: order.visitId }}
                  bill={bill}
                  partyPending={partyVisitIds.has(order.visitId)}
                  methods={feed.paymentOptions}
                  refresh={() => refresh.current()}
                />
              )}
            </li>
          );
        })}
      </ul>
      {emptyAssigned.length > 0 && (
        <ul className="divide-y divide-rule border-t border-rule">
          {emptyAssigned.map((table) => (
            <li key={table.id}>
              <Link href={`/staff/tables/${table.id}`} className="inline-flex min-h-11 items-center font-semibold underline">
                {t("table", { number: table.number })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CorrectionForm({ quantity, disabled, submit }: {
  quantity: number;
  disabled: boolean;
  submit: (quantity: number | null, reason: string) => void;
}) {
  const t = useTranslations("StaffOrders");
  const field = "mt-1 block min-h-11 w-full rounded-md border border-rule bg-white px-3 text-base";
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("correctLine")}</summary>
      <form className="space-y-2 pb-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        submit(form.get("correction") === "remove" ? null : Number(form.get("quantity")), String(form.get("reason")));
      }}>
        <label className="block text-sm">{t("quantity")}
          <input className={field} type="number" name="quantity" min="1" max={MAX_QUANTITY} defaultValue={quantity} required />
        </label>
        <label className="block text-sm">{t("correctionReason")}
          <input className={field} name="reason" maxLength={300} required />
        </label>
        <div className="flex flex-wrap gap-2">
          <button name="correction" value="save" disabled={disabled} className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold disabled:opacity-50">{t("saveQuantity")}</button>
          <button name="correction" value="remove" disabled={disabled} className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold disabled:opacity-50">{t("removeLine")}</button>
        </div>
      </form>
    </details>
  );
}

function MoveControl({ label, tables, disabled, submit }: {
  label: string;
  tables: { id: string; number: number }[];
  disabled: boolean;
  submit: (tableId: string) => void;
}) {
  const t = useTranslations("StaffOrders");
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{label}</summary>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        submit(String(new FormData(event.currentTarget).get("tableId")));
      }}>
        <select name="tableId" aria-label={label} defaultValue="" required disabled={disabled}
          className="min-h-11 rounded-md border border-rule bg-white px-3 text-base">
          <option value="" disabled>{t("chooseTable")}</option>
          {tables.map(({ id, number }) => <option key={id} value={id}>{t("table", { number })}</option>)}
        </select>
        <button type="submit" disabled={disabled} className="min-h-11 rounded-md border border-rule px-3 text-sm font-semibold disabled:opacity-50">
          {t("move")}
        </button>
      </form>
    </details>
  );
}
