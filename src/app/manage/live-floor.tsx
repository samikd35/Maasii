"use client";

import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { getLiveFloor } from "@/core";
import { formatBirr } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";

type Floor = Awaited<ReturnType<typeof getLiveFloor>>;
type FloorTable = Floor["tables"][number];
const filters = { all: "tables", sent: "queue", prepared: "receipt", unassigned: "account", difference: "alert" } as const;
type Filter = keyof typeof filters;

export function LiveFloor({ venueId, floor: initial, focus }: { venueId: string; floor: Floor; focus?: string }) {
  const t = useTranslations("Floor");
  const bills = useTranslations("Bills");
  const manage = useTranslations("StaffManage");
  const format = useFormatter();
  const router = useRouter();
  const [floor, setFloor] = useState(initial);
  const [filter, setFilter] = useState<Filter>(focus && Object.hasOwn(filters, focus) ? focus as Filter : "all");
  const [search, setSearch] = useState("");
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const venue = "/manage/venues/" + venueId;
  const refresh = useCallback(async () => {
    if (request.current || document.hidden) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { setStale(true); controller.abort(); }, 8000);
    request.current = controller;
    try {
      const result = await fetch(venue + "/floor/live", { cache: "no-store", signal: controller.signal });
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
      window.clearTimeout(timeout);
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
      const id = location.hash.slice(1);
      if (!id.startsWith("floor-visit-")) return;
      const node = document.getElementById(id);
      if (node instanceof HTMLDetailsElement) {
        node.open = true;
        node.querySelector("summary")?.focus({ preventScroll: true });
        node.scrollIntoView({ block: "start" });
      }
    }
    openLinkedTable();
    window.addEventListener("hashchange", openLinkedTable);
    return () => window.removeEventListener("hashchange", openLinkedTable);
  }, []);

  const pending = floor.tables.filter(table => table.pendingOrders.length)
    .sort((a, b) => Number(!!a.waiter) - Number(!!b.waiter) || (b.oldestSentMinutes ?? 0) - (a.oldestSentMinutes ?? 0));
  const prepared = floor.tables.filter(table => table.status === "prepared");
  const coverage = floor.exceptions.filter(item => item.kind === "unassigned");
  const differences = floor.exceptions.filter(item => item.kind === "difference");
  const overdue = new Map(floor.exceptions.filter(item => item.kind === "prepared").map(item => [item.id, item.minutes]));
  const counts = { all: null, sent: pending.length, prepared: prepared.length, unassigned: coverage.length, difference: differences.length };
  const waitingRows = filter === "all" || filter === "sent" ? pending : [];
  const billRows = filter === "prepared" ? prepared : filter === "all" ? prepared.filter(table => overdue.has(table.visitId)) : [];
  const uncoveredWithoutOrders = coverage.filter(item => !pending.some(table => table.id === item.id));
  const groupCoverage = filter === "all" && uncoveredWithoutOrders.length > 3;
  const otherRows = [...coverage, ...differences].filter(item => (item.kind === filter || filter === "all")
    && !(filter === "all" && item.kind === "unassigned" && (groupCoverage || !uncoveredWithoutOrders.includes(item))));
  const q = search.trim();
  const activeTables = floor.tables.filter(table => String(table.number).includes(q));
  const quiet = floor.quietTables.filter(table => String(table.number).includes(q));
  const { service } = floor;
  const active = !!service.shiftStartedAt;
  const uncovered = active && service.assigned === 0;
  const assignHref = (tableId: string) => venue + "/shifts?table=" + tableId + "&from=floor#assignment-picker";
  const closeHref = (visitId: string) => venue + "/closing#visit-" + visitId;

  return <div data-live-floor>
    <div className="manager-floor-summary">
      <div>
        <span className="manager-chip" data-tone={uncovered ? "waiting" : active ? "live" : undefined}>
          <WaiterIcon name={uncovered ? "alert" : active ? "check" : "clock"} />
          {t(uncovered ? "shiftUncovered" : active ? "shiftRunning" : "shiftStopped")}
        </span>
        <p className="manager-muted mt-1">{active ? t("coverage", { assigned: service.assigned, total: service.active, waiters: service.waiters }) : t("tableCount", { count: service.active })}</p>
      </div>
      {!active && <Link className="workspace-button workspace-primary" href={venue + "/shifts"}>{manage("startServiceAction")}</Link>}
      {active && service.assigned < service.active && <Link className="workspace-link" href={venue + "/shifts#assignments"}>
        {manage("assignTablesAction")}
      </Link>}
    </div>
    <div className="manager-floor-toolbar">
      <label className="manager-search">
        <WaiterIcon name="search" />
        <span className="sr-only">{t("searchTable")}</span>
        <input type="search" inputMode="numeric" placeholder={t("searchPlaceholder")} value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <button className="workspace-button manager-refresh" type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await refresh(); } finally { setBusy(false); }
      }}>{t(busy ? "refreshing" : "refresh")}</button>
    </div>
    <p className="manager-muted manager-floor-health" role={stale ? "status" : undefined}>
      {stale && <strong>{t("stale")} · </strong>}
      {t("lastUpdated", { time: format.dateTime(new Date(floor.updatedAt), { timeStyle: "short" }) })}
    </p>

    <div className="floor-layout">
      {!q && <section aria-labelledby="floor-attention">
        <div className="manager-section-heading"><h2 id="floor-attention">{t("exceptions")}</h2></div>
        <div className="manager-switches manager-floor-filters" aria-label={t("exceptions")}>
          {(Object.keys(filters) as Filter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            <WaiterIcon name={filters[value]} /><span className="manager-filter-label">{t(`filter_${value}`)}</span>
            {counts[value] !== null && <span className="manager-count">{counts[value]}</span>}
          </button>)}
        </div>
        <ul className="manager-list manager-floor-exceptions">
          {waitingRows.map(table => <li key={table.id} data-priority={table.waiter ? "order" : "uncovered"}>
            <div className="manager-row-heading">
              <h3>{bills("table", { number: table.number })}</h3>
              <span className="manager-chip" data-tone="waiting"><WaiterIcon name="clock" />
                {table.oldestSentMinutes ? t("waitingTime", { minutes: table.oldestSentMinutes }) : t("justArrived")}
              </span>
            </div>
            <div className="manager-actions manager-floor-row">
              <p className="manager-muted"><WaiterIcon name="account" />{table.waiter ?? t("unassigned")} · {t("pendingCount", { count: table.pendingOrders.length })}</p>
              {!table.waiter && active && <Link className="workspace-button workspace-primary" href={assignHref(table.id)}>{t("unassignedAction")}</Link>}
            </div>
            <details className="manager-floor-order" id={"floor-visit-" + table.visitId} name="floor-order-review">
              <summary className="workspace-summary">{t("viewPending", { number: table.number })}<WaiterIcon name="down" /></summary>
              <OrderDetails table={table} closing={closeHref(table.visitId)} />
            </details>
          </li>)}
          {billRows.map(table => <li key={"bill-" + table.visitId} data-priority="bill">
            <div className="manager-row-heading">
              <h3>{bills("table", { number: table.number })}</h3>
              <span className="manager-chip" data-tone={overdue.has(table.visitId) ? "waiting" : "bill"}>
                <WaiterIcon name="receipt" />{overdue.has(table.visitId) ? t("overdueTime", { minutes: overdue.get(table.visitId)! }) : t("preparedStatus")}
              </span>
            </div>
            <div className="manager-actions manager-floor-row">
              <p className="manager-muted">{table.waiter ?? t("unassigned")} · <strong>{formatBirr(table.totalSantim)} ETB</strong></p>
              <Link className="workspace-link" href={closeHref(table.visitId)} prefetch={false}>{t("preparedAction")}</Link>
            </div>
          </li>)}
          {otherRows.map(item => <li key={item.kind + ":" + item.id}>
            <div className="manager-row-heading">
              <div>
                <h3>{bills("table", { number: item.tableNumber })}</h3>
                <span className="manager-chip" data-tone="waiting"><WaiterIcon name={item.kind === "unassigned" ? "account" : "receipt"} />{t(item.kind)}</span>
              </div>
              {item.kind === "unassigned"
                ? <Link className="workspace-link" href={active ? assignHref(item.id) : venue + "/shifts"}>{active ? t("unassignedAction") : manage("startServiceAction")}</Link>
                : <Link className="workspace-link" prefetch={false} href={venue + "/closing?tab=payments&filter=differences#payment-" + item.id}>{t("differenceAction")}</Link>}
            </div>
          </li>)}
          {groupCoverage && <li className="manager-row-heading">
            <span className="manager-chip" data-tone="waiting"><WaiterIcon name="account" />
              {t("uncoveredCount", { count: uncoveredWithoutOrders.length })}
            </span>
            <button className="workspace-button" type="button" onClick={() => setFilter("unassigned")}>{t("reviewCoverage")}</button>
          </li>}
          {!waitingRows.length && !billRows.length && !otherRows.length && !groupCoverage && <li className="manager-empty">{t("none")}</li>}
        </ul>
      </section>}
      <section aria-labelledby="floor-tables">
        <div className="manager-section-heading"><h2 id="floor-tables">{t(q ? "tableSearchResults" : "openTables")}</h2></div>
        {!activeTables.length && !q && <p className="manager-empty">{t("noneOpen")}</p>}
        {!activeTables.length && !quiet.length && q && <p className="manager-empty">{t("noTableMatch")}</p>}
        <ul className="floor-tables manager-floor-tables">
          {activeTables.map(table => <li key={table.id} className="workspace-panel">
            <details id={waitingRows.includes(table) && !q ? undefined : "floor-visit-" + table.visitId}>
              <summary className="workspace-summary">
                <span className="manager-row-heading">
                  <strong>{bills("table", { number: table.number })}</strong><WaiterIcon name="down" />
                </span>
                {(!q || table.status !== "sent") && <span className="manager-chip" data-tone={table.status === "prepared" ? "bill" : table.status === "sent" ? "waiting" : "live"}>
                  {t(`${table.status}Status`)}
                </span>}
                {q && table.oldestSentMinutes !== null && <span className="manager-chip" data-tone="waiting">
                  <WaiterIcon name="clock" />{table.oldestSentMinutes ? t("waitingTime", { minutes: table.oldestSentMinutes }) : t("justArrived")}
                </span>}
                <span className="manager-muted">{table.waiter ?? t("unassigned")}</span>
              </summary>
              <OrderDetails table={table} closing={closeHref(table.visitId)} />
            </details>
            {q && active && !table.waiter && <Link className="workspace-button workspace-primary mt-2" href={assignHref(table.id)}>{t("unassignedAction")}</Link>}
          </li>)}
        </ul>
        {!!quiet.length && <details className="manager-quiet-tables" open={q ? true : undefined} key={q ? "search" : "browse"}>
          <summary className="workspace-summary">{t("quietTables", { count: quiet.length })}</summary>
          <ul className="quiet-tables">
            {quiet.map(table => <li key={table.id} className="workspace-panel">
              <strong>{bills("table", { number: table.number })}</strong>
              <p className="manager-muted">{table.waiter ?? t("unassigned")}</p>
              {q && active && !table.waiter && <Link className="workspace-link" href={assignHref(table.id)}>{t("unassignedAction")}</Link>}
            </li>)}
          </ul>
        </details>}
      </section>
    </div>
  </div>;
}

function OrderDetails({ table, closing }: { table: FloorTable; closing: string }) {
  const t = useTranslations("Floor");
  const bills = useTranslations("Bills");
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  return <div className="manager-order-detail">
    {(table.status === "prepared" || table.hasAccepted) && <p className="font-semibold tabular-nums">
      {bills(table.status === "prepared" ? "total" : "runningTotal", { amount: formatBirr(table.totalSantim) })}
    </p>}
    {!!table.pendingOrders.length && <ul className="divide-y divide-rule">
      {table.pendingOrders.map(order => <li key={order.id} className="py-2">
        <p className="font-semibold text-sm">{t(order.partyPending ? "partyPending" : "pendingOrder")} · {t("age", { minutes: order.minutes })}</p>
        <ul className="text-sm">
          {order.lines.map((line, index) => <li key={index}>
            {line.quantity} × {line.name[locale] || line.name[other]}
            {line.choices.map(choice => <span key={choice.id}> · {choice.name[locale] || choice.name[other]}</span>)}
            {line.note && <span className="block manager-muted">“{line.note}”</span>}
          </li>)}
        </ul>
      </li>)}
    </ul>}
    {(table.status === "prepared" || table.hasAccepted) && <Link className="workspace-link" href={closing}>{t("preparedAction")}</Link>}
  </div>;
}
