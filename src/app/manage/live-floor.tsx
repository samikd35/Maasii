"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { getLiveFloor } from "@/core";
import { formatBirr } from "@/ui/price";

type Floor = Awaited<ReturnType<typeof getLiveFloor>>;
const filters = ["all", "sent", "prepared", "unassigned", "difference"] as const;

export function LiveFloor({ venueId, floor: initial }: { venueId: string; floor: Floor }) {
  const t = useTranslations("Floor");
  const bill = useTranslations("Bills");
  const manage = useTranslations("StaffManage");
  const format = useFormatter();
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const [floor, setFloor] = useState(initial);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const venue = `/manage/venues/${venueId}`;
  const refresh = useCallback(async () => {
    if (request.current || document.hidden) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await fetch(`${venue}/floor/live`, { cache: "no-store", signal: controller.signal });
      if (!result.ok) {
        if (result.status === 403) router.refresh();
        setStale(true);
        return;
      }
      const snapshot: Floor = await result.json();
      if (!controller.signal.aborted) {
        setFloor(snapshot);
        setStale(false);
      }
    } catch {
      if (!controller.signal.aborted) setStale(true);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [router, venue]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 5000);
    const refreshVisible = () => void refresh();
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("online", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    function openLinkedTable() {
      const node = document.getElementById(location.hash.slice(1));
      if (node instanceof HTMLDetailsElement) node.open = true;
    }
    openLinkedTable();
    window.addEventListener("hashchange", openLinkedTable);
    return () => window.removeEventListener("hashchange", openLinkedTable);
  }, []);

  const pending = floor.tables.filter(table => table.pendingOrders.length > 0)
    .sort((a, b) => (b.oldestSentMinutes ?? 0) - (a.oldestSentMinutes ?? 0));
  const displayPending = filter === "all" || filter === "sent";
  const exceptions = floor.exceptions.filter(item => item.kind !== "sent" && (filter === "all" || item.kind === filter)
    && !(filter === "all" && item.kind === "unassigned" && pending.some(table => table.id === item.id)));
  const service = floor.service;
  const active = !!service.shiftStartedAt;
  const uncovered = active && service.assigned === 0;
  const viewTable = (visitId: string) => {
    const row = document.getElementById(`floor-visit-${visitId}`);
    if (row instanceof HTMLDetailsElement) {
      row.open = true;
      row.querySelector("summary")?.focus({ preventScroll: true });
    }
  };

  return (
    <div data-live-floor>
      <div className="workspace-panel floor-summary">
        <div>
          <p className="workspace-badge" data-tone={uncovered ? "waiting" : active ? "live" : undefined}>
            {t(uncovered ? "shiftUncovered" : active ? "shiftRunning" : "shiftStopped")}
          </p>
          <p className="mt-2 text-sm">
            {active ? t("coverage", { assigned: service.assigned, total: service.active, waiters: service.waiters }) : t("tableCount", { count: service.active })}
          </p>
        </div>
        {!active && <Link className="workspace-button workspace-primary" href={`${venue}/shifts`}>{manage("startServiceAction")}</Link>}
        {active && service.assigned < service.active && <Link className="workspace-button" href={`${venue}/shifts#assignments`}>{manage("assignTablesAction")}</Link>}
      </div>
      <div className="workspace-actions mt-2 text-ink-muted">
        <p className="text-sm" role={stale ? "status" : undefined}>
          {stale ? `${t("stale")} · ` : ""}
          {t("lastUpdated", { time: format.dateTime(new Date(floor.updatedAt), { timeStyle: "short" }) })}
        </p>
        <button className="workspace-button" type="button" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await refresh(); } finally { setBusy(false); }
        }}>{t(busy ? "refreshing" : "refresh")}</button>
      </div>

      <div className="floor-layout">
        <section aria-labelledby="floor-attention" className="workspace-section">
          <h2 id="floor-attention">{t("exceptions")}</h2>
          <div className="workspace-actions floor-filters" aria-label={t("exceptions")}>
            {filters.map(value => <button key={value} type="button" className="workspace-button"
              aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(`filter_${value}`)}</button>)}
          </div>
          <ul className="floor-attention">
            {displayPending && pending.map(table => (
              <li key={table.id} className="workspace-panel">
                <div>
                  <h3>{bill("table", { number: table.number })}</h3>
                  <p className="workspace-badge" data-tone={(table.oldestSentMinutes ?? 0) >= 2 ? "urgent" : "waiting"}>
                    {t("pendingCount", { count: table.pendingOrders.length })} · {t("age", { minutes: table.oldestSentMinutes ?? 0 })}
                  </p>
                  <p className="mt-1 text-sm">{table.waiter ?? t("unassigned")}</p>
                </div>
                <div className="workspace-actions">
                  <a className="workspace-link" href={`#floor-visit-${table.visitId}`} onClick={() => viewTable(table.visitId)}>
                    {t("viewPending", { number: table.number })}
                  </a>
                  {!table.waiter && active && <Link className="workspace-link" href={`${venue}/shifts#assignment-${table.id}`}>{t("unassignedAction")}</Link>}
                </div>
              </li>
            ))}
            {exceptions.map(item => {
              const href = item.kind === "unassigned" ? `${venue}/shifts${active ? `#assignment-${item.id}` : ""}`
                : item.kind === "difference" ? `${venue}/closing?tab=payments#payment-${item.id}` : `${venue}/closing#visit-${item.id}`;
              return <li key={`${item.kind}:${item.id}`} className="workspace-panel">
                <div><h3>{bill("table", { number: item.tableNumber })}</h3>
                  <p className="workspace-badge" data-tone={item.kind === "prepared" ? "urgent" : "waiting"}>{t(item.kind)} · {t("age", { minutes: item.minutes })}</p></div>
                <Link className="workspace-link" href={href} prefetch={false}>{item.kind === "unassigned" && !active ? manage("startServiceAction") : t(`${item.kind}Action`)}</Link>
              </li>;
            })}
          </ul>
          {(!displayPending || !pending.length) && !exceptions.length && <p className="workspace-panel text-ink-muted">{t("none")}</p>}
        </section>
        <section aria-labelledby="floor-tables" className="workspace-section">
          <h2 id="floor-tables">{t("openTables")}</h2>
          {!floor.tables.length && <p className="workspace-panel text-ink-muted">{t("noneOpen")}</p>}
          <ul className="floor-tables flex flex-col gap-2 sm:grid sm:grid-cols-2">
            {floor.tables.map(table => <li key={table.id} className="workspace-panel">
              <details id={`floor-visit-${table.visitId}`}>
                <summary className="workspace-summary">
                  <span className="font-semibold">{bill("table", { number: table.number })}</span>
                  <span className="block mt-1 text-sm">{t(`${table.status}Status`)} · {table.waiter ?? t("unassigned")}</span>
                </summary>
                {(table.status === "prepared" || table.hasAccepted) && <p className="text-sm font-semibold">
                  {bill(table.status === "prepared" ? "total" : "runningTotal", { amount: formatBirr(table.totalSantim) })}
                </p>}
                {table.pendingOrders.length > 0 && <ul className="mt-3 divide-y divide-rule">
                  {table.pendingOrders.map(order => <li key={order.id} className="py-2">
                    <p className="text-sm font-semibold">{t(order.partyPending ? "partyPending" : "pendingOrder")} · {t("age", { minutes: order.minutes })}</p>
                    <ul className="text-sm">
                      {order.lines.map((line, index) => <li key={index}>
                        {line.quantity} × {line.name[locale] || line.name[other]}
                        {line.choices.map(choice => <span key={choice.id}> · {choice.name[locale] || choice.name[other]}</span>)}
                        {line.note && <span className="block text-ink-muted">“{line.note}”</span>}
                      </li>)}
                    </ul>
                  </li>)}
                </ul>}
                {(table.status === "prepared" || table.hasAccepted) && <Link className="workspace-link" href={`${venue}/closing#visit-${table.visitId}`}>{t("preparedAction")}</Link>}
              </details>
            </li>)}
          </ul>
          {floor.quietTables.length > 0 && <details className="mt-4">
            <summary className="workspace-summary">{t("quietTables", { count: floor.quietTables.length })}</summary>
            <ul className="quiet-tables">
              {floor.quietTables.map(table => <li key={table.id} className="workspace-panel">
                <strong>{bill("table", { number: table.number })}</strong>
                <p className="text-sm">{table.waiter ?? t("unassigned")}</p>
              </li>)}
            </ul>
          </details>}
        </section>
      </div>
    </div>
  );
}
