"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { getMyTableOrders, PreparedBill } from "@/core";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { BillControls } from "./bill-controls";

type StaffOrderFeed = OrderFeed & Omit<Awaited<ReturnType<typeof getMyTableOrders>>, "orders" | "topic" | "bills"> & {
  bills: (Omit<PreparedBill, "preparedAt"> & { preparedAt: string })[];
};

export function MyTables() {
  const t = useTranslations("StaffOrders");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const heading = useId();
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [feed, setFeed] = useState<StaffOrderFeed>();
  const refresh = useRef<() => Promise<void>>(async () => {});
  const [now, setNow] = useState(Date.now);
  const [accepting, setAccepting] = useState<string>();
  const [acceptError, setAcceptError] = useState<string>();
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    const watcher = watchOrders<StaffOrderFeed>("/staff/orders", (data) => {
      setFeed(data);
      setOrders(data.orders);
      setRefreshError(false);
    }, (status) => {
      if (status === 403) {
        setOrders([]);
        setFeed(undefined);
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

  async function accept(orderId: string) {
    setAccepting(orderId);
    setAcceptError(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (response.status === 403) {
        setOrders([]);
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error();
      const accepted: LiveOrder = await response.json();
      setOrders((current) => [...current.filter(({ id }) => id !== orderId), accepted]);
    } catch {
      setAcceptError(orderId);
    } finally {
      setAccepting(undefined);
    }
  }

  const bills = new Map(feed?.bills.map((bill) => [bill.visitId, bill]));
  const firstAccepted = new Map(orders.filter(({ state }) => state === "accepted").reverse()
    .map((order) => [order.visitId, order.id]));

  return (
    <section className="mt-8" aria-labelledby={heading}>
      <h2 id={heading} className="border-b border-ink/70 pb-1.5 text-sm font-semibold uppercase">{t("heading")}</h2>
      {refreshError && <p role="status" className="mt-3 text-sm">{t("refreshError")}</p>}
      {orders.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t("empty")}</p>}
      <ul className="divide-y divide-rule">
        {orders.map((order) => {
          const bill = bills.get(order.visitId);
          const seconds = Math.max(0, Math.floor((now - Date.parse(order.sentAt)) / 1000));
          const waiting = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
          return (
            <li key={order.id} className="space-y-2 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl">{t("table", { number: order.tableNumber })}</h3>
                {order.state === "sent" && (
                  <p role="timer" className="text-sm tabular-nums text-ink-muted">{t("waiting", { time: waiting })}</p>
                )}
              </div>
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
                    </div>
                  </li>
                ))}
              </ul>
              {order.state === "sent" ? (
                <button type="button" disabled={!!accepting || !!bill} onClick={() => void accept(order.id)}
                  className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper disabled:opacity-50">
                  {t(accepting === order.id ? "accepting" : "accept")}
                </button>
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
              {acceptError === order.id && <p role="alert" className="text-sm">{t("acceptError")}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
