"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { getMyTableOrders, PreparedBill } from "@/core";
import type { Messages } from "@/i18n/messages";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { BillControls } from "./bill-controls";
import { playOrderChime } from "./order-chime";

type StaffOrderFeed = OrderFeed & Omit<Awaited<ReturnType<typeof getMyTableOrders>>, "orders" | "topic" | "bills"> & {
  bills: (Omit<PreparedBill, "preparedAt"> & { preparedAt: string })[];
};
type Action = { action: "accept"; soldOutLineIndices: number[] }
  | { action: "decline" }
  | { action: "undo"; decisionId: string };
type UndoableOrder = LiveOrder & { decisionId: string; undoUntil: string };
type ErrorReason = keyof Messages["StaffErrors"];

export function MyTables({ tableId, tableNumber }: { tableId: string; tableNumber: number } | { tableId?: never; tableNumber?: never }) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const heading = useId();
  const [orders, setOrders] = useState<LiveOrder[]>([]);
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
      } else {
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
  const bills = new Map(feed?.bills.map((bill) => [bill.visitId, bill]));
  const billVisitIds = new Set(feed?.billVisitIds);
  const firstAccepted = new Map(visibleOrders.filter(({ state, visitId }) => state === "accepted" && billVisitIds.has(visitId)).reverse()
    .map((order) => [order.visitId, order.id]));

  return (
    <section className="mt-8" aria-labelledby={heading}>
      {tableId
        ? <h1 id={heading} className="font-display text-3xl">{t("table", { number: tableNumber })}</h1>
        : <h2 id={heading} className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("heading")}</h2>}
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
              {order.state === "sent" && (
                <p role="status" className="text-sm font-semibold">{t(order.escalatedAt ? "escalatedOrder" : "newOrder")}</p>
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
                    </div>
                  </li>
                ))}
              </ul>
              {order.state === "sent" ? (
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
              ) : (
                <p role="status" className="text-sm font-semibold">{t("accepted", { name: order.acceptedByName ?? "" })}</p>
              )}
              {feed && firstAccepted.get(order.visitId) === order.id && (
                <BillControls
                  key={bill?.preparedAt ?? order.visitId}
                  target={{ venueId: feed.venueId, visitId: order.visitId }}
                  bill={bill}
                  methods={feed.paymentOptions}
                  refresh={() => refresh.current()}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
