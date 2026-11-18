"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MAX_QUANTITY } from "@/core/browser";
import type { getMyTableOrders, PreparedBill } from "@/core";
import type { Messages } from "@/i18n/messages";
import { watchOrders, type LiveOrder, type OrderFeed } from "@/lib/supabase/order-feed";
import { formatBirr } from "@/ui/price";
import { BillControls } from "./bill-controls";
import { playOrderChime } from "./order-chime";

type StaffOrderFeed = OrderFeed & Omit<Awaited<ReturnType<typeof getMyTableOrders>>, "orders" | "topic" | "bills"> & {
  bills: (Omit<PreparedBill, "preparedAt"> & { preparedAt: string })[];
};
type Action = { action: "accept"; soldOutLineIndices: number[] }
  | { action: "decline" }
  | { action: "undo"; decisionId: string }
  | { action: "correct"; lineIndex: number; quantity: number | null; reason: string }
  | { action: "moveOrder"; tableId: string }
  | { action: "moveVisit"; visitId: string; tableId: string };
type UndoableOrder = LiveOrder & { decisionId: string; undoUntil: string };
type ErrorReason = keyof Messages["StaffErrors"] | "decisionError" | "decisionUncertain";

export function MyTables({ tableId, tableNumber, tables = false, number = "", tableQuery = "", tools }: {
  tableId?: string; tableNumber?: number; tables?: boolean; number?: string; tableQuery?: string; tools?: ReactNode;
}) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const billing = useTranslations("Bills");
  const format = useFormatter();
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const router = useRouter();
  const heading = useId();
  const [feed, setFeed] = useState<StaffOrderFeed>();
  const restoredLink = useRef("");
  const refresh = useRef<() => Promise<boolean>>(async () => false);
  const inFlight = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [working, setWorking] = useState<{ orderId: string; action: Action["action"] }>();
  const [failure, setFailure] = useState<{ id: string; reason: ErrorReason }>();
  const [soldOut, setSoldOut] = useState<Record<string, number[]>>({});
  const [undoable, setUndoable] = useState<UndoableOrder[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let previous: Map<string, string | null> | undefined;
    const watcher = watchOrders<StaffOrderFeed>("/staff/orders", (data) => {
      const pending = data.orders.filter(({ state }) => state === "sent");
      const seen = previous;
      if (seen && pending.some(({ id, escalatedAt }) => seen.get(id) !== escalatedAt)) playOrderChime();
      previous = new Map(pending.map(({ id, escalatedAt }) => [id, escalatedAt]));
      setFeed(data);
      setUpdatedAt(Date.now());
      setStale(false);
      setFailure(current => current?.reason === "decisionUncertain" ? { id: current.id, reason: "decisionError" } : current);
    }, (status) => {
      if (status === 403) {
        setFeed(undefined);
        setUndoable([]);
        router.refresh();
      } else {
        setStale(true);
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
    const anchor = location.hash.slice(1);
    if (!feed || !anchor.startsWith("table-link-") || anchor === restoredLink.current) return;
    restoredLink.current = anchor;
    (document.getElementById(anchor) ?? document.getElementById(heading))?.focus();
  }, [feed, heading]);

  useEffect(() => {
    if (!undoable.length) return;
    const expiry = Math.min(...undoable.map(({ undoUntil }) => Date.parse(undoUntil)));
    const timer = window.setTimeout(() => {
      setUndoable(current => current.filter(({ undoUntil }) => Date.parse(undoUntil) > Date.now()));
    }, Math.max(0, expiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undoable]);

  async function decide(orderId: string, command: Action) {
    if (inFlight.current || failure?.reason === "decisionUncertain") return;
    inFlight.current = true;
    setWorking({ orderId, action: command.action });
    setFailure(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...command }),
      });
      if (response.status === 403) {
        setFeed(undefined);
        setUndoable([]);
        router.refresh();
        return;
      }
      if (response.status >= 500) throw new Error("Order outcome unknown");
      if (!response.ok) {
        const { reason }: { reason?: ErrorReason } = await response.json().catch(() => ({}));
        setFailure({ id: orderId, reason: reason ?? "decisionError" });
      } else {
        if (response.status !== 204) {
          const order: UndoableOrder | LiveOrder = await response.json();
          setUndoable(current => [...current.filter(({ id }) => id !== orderId), ...("decisionId" in order ? [order] : [])]);
          setFeed(current => current && ({
            ...current, orders: order.state === "declined" ? current.orders.filter(({ id }) => id !== orderId)
              : current.orders.map(previous => previous.id === orderId ? order : previous),
          }));
        }
        setSoldOut(current => {
          const next = { ...current };
          delete next[orderId];
          return next;
        });
      }
      void refresh.current();
    } catch {
      const checked = await refresh.current();
      setFailure({ id: orderId, reason: checked ? "decisionError" : "decisionUncertain" });
    } finally {
      inFlight.current = false;
      setWorking(undefined);
    }
  }

  const orders = feed?.orders ?? [];
  const visible = tableId ? orders.filter(order => order.tableId === tableId) : orders;
  const undos = new Map(undoable.filter(order => !tableId || order.tableId === tableId).map(order => [order.id, order]));
  const waiting = [...visible.filter(order => order.state === "sent" && !undos.has(order.id)), ...undos.values()]
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const accepted = visible.filter(order => order.state === "accepted" && !undos.has(order.id));
  const bills = new Map(feed?.bills.map(bill => [bill.visitId, bill]));
  const visits = (feed?.tableBills ?? []).filter(visit => !tableId || visit.tableId === tableId);
  const assigned = new Set(feed?.assignedTables.map(table => table.id));
  const correctable = new Set(feed?.correctableOrderIds);
  const firstOrder = new Map([...visible].reverse().map(order => [order.visitId, order.id]));
  const pendingParties = new Map([...waiting].reverse().filter(order => order.partyPending).map(order => [order.visitId, order.id]));
  const activeVisit = visits[0];
  const canAdd = tableId && assigned.has(tableId) && !feed?.bills.some(bill => bill.tableId === tableId);

  function billControls(visitId: string, partyPending = false) {
    const bill = bills.get(visitId);
    return feed && <BillControls key={bill?.preparedAt ?? visitId} target={{ venueId: feed.venueId, visitId }}
      bill={bill} tableNumber={tableNumber ?? visible.find(order => order.visitId === visitId)?.tableNumber}
      partyPending={partyPending} methods={feed.paymentOptions} refresh={() => refresh.current()} />;
  }

  function orderRow(order: LiveOrder) {
    const undo = undos.get(order.id);
    const bill = bills.get(order.visitId);
    const destinations = feed?.moveTables.filter(table => table.id !== order.tableId) ?? [];
    const drops = soldOut[order.id] ?? [];
    const droppedQuantity = order.lines.reduce((total, line, index) => total + (drops.includes(index) ? line.quantity : 0), 0);
    const quantity = order.lines.reduce((total, line) => total + line.quantity, 0);
    const seconds = Math.max(0, Math.floor((now - Date.parse(order.sentAt)) / 1000));
    const age = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const problem = failure?.id === order.id ? failure.reason : undefined;
    const blocked = !!working || failure?.reason === "decisionUncertain";
    const canAccept = !undo && order.state === "sent" && !order.partyPending;
    const canMoveOrder = !!destinations.length && !bill && !order.partyPending;
    const canMoveVisit = !!destinations.length && visits.some(visit => visit.visitId === order.visitId) && firstOrder.get(order.visitId) === order.id;
    return (
      <li key={order.id} className="order-row">
        <div className="order-row-heading">
          <p className="text-sm font-semibold">{(undo || order.state === "sent") ? `${t("newOrder")} · ${t("dishQuantity", { count: quantity })}` : t("accepted", { name: order.acceptedByName ?? "" })}</p>
          {(undo || order.state === "sent") && <span role="timer" className="workspace-badge" data-tone={order.escalatedAt ? "urgent" : "waiting"}>{t("waiting", { time: age })}</span>}
        </div>
        {tableId && <p className="text-sm text-ink-muted">{t(order.source === "waiter" ? "waiterSource" : "guestSource")}</p>}
        {order.carriedOver && <p className="text-sm font-semibold">{order.carriedFrom ? t("carriedFrom", { name: order.carriedFrom }) : t("carriedOver")}</p>}
        {order.partyPending && <p role="status" className="font-semibold">{t("newParty", { number: order.tableNumber })}</p>}
        {!order.partyPending && order.state === "sent" && order.escalatedAt && <p className="text-sm font-medium">{t("escalatedOrder")}</p>}
        <ul className="space-y-2">
          {order.lines.map((line, index) => {
            const removed = line.dropReason === "waiter_removed" || activeVisit?.removedLines.includes(`${order.id}:${index}`);
            return <li key={index} className="flex items-start gap-2">
              <span className="shrink-0 tabular-nums">{line.quantity} ×</span>
              <div className="min-w-0">
                {line.name[locale] && <p lang={locale} className="font-semibold">{line.name[locale]}</p>}
                {line.name[other] && line.name[other] !== line.name[locale] && <p lang={other}
                  className={line.name[locale] ? "text-sm text-ink-muted" : "font-semibold"}>{line.name[other]}</p>}
                {line.choices.map(choice => <p key={choice.id} className="text-sm text-ink-muted">
                  {([locale, other] as const).map(lang => choice.name[lang] && <span key={lang} lang={lang} className="me-2">{choice.name[lang]}</span>)}
                </p>)}
                {line.note && <p className="text-sm italic">“{line.note}”</p>}
                {(line.dropReason === "sold_out" || drops.includes(index)) && <p className="text-sm font-medium">{t("soldOut")}</p>}
                {removed && <p className="text-sm font-medium">{t("removedLine")}</p>}
                {tableId && !undo && correctable.has(order.id) && !bill && !line.dropReason && !removed && (
                  <CorrectionForm key={line.quantity} quantity={line.quantity} disabled={blocked}
                    submit={(quantity, reason) => void decide(order.id, { action: "correct", lineIndex: index, quantity, reason })} />
                )}
              </div>
            </li>;
          })}
        </ul>
        {pendingParties.get(order.visitId) === order.id && bill && feed?.billVisitIds.includes(order.visitId) && billControls(order.visitId, true)}
        {undo && (
          <div className="workspace-actions">
            <p role="status" className="font-medium">{t(undo.state === "declined" ? "declined" : "accepted", { name: undo.acceptedByName ?? "" })}</p>
            <button type="button" className="workspace-button" disabled={blocked}
              onClick={() => void decide(order.id, { action: "undo", decisionId: undo.decisionId })}>{t("undo")}</button>
          </div>
        )}
        {canAccept && <>
          {droppedQuantity > 0 && <p role="status" className="text-sm font-semibold">{t("acceptSummary", { count: quantity - droppedQuantity, dropped: droppedQuantity })}</p>}
          {quantity === droppedQuantity && <p className="text-sm">{errors("orderAllLinesDropped")}</p>}
          <button type="button" className="workspace-button workspace-primary order-accept" disabled={blocked || !!bill || quantity === droppedQuantity}
            onClick={() => void decide(order.id, { action: "accept", soldOutLineIndices: drops })}>
            {working?.orderId === order.id && working.action === "accept" ? t("accepting")
              : droppedQuantity ? t("acceptCount", { count: quantity - droppedQuantity }) : t("accept")}
          </button>
        </>}
        {!undo && (canMoveOrder || canMoveVisit || canAccept) && (
          <details className="order-actions">
            <summary className="workspace-summary">{t("decisions")}</summary>
            {canAccept && <>
              <fieldset className="space-y-1" disabled={blocked || !!bill}>
                <legend className="text-sm font-medium">{t("soldOut")}</legend>
                {order.lines.map((line, index) => <label key={index} className="flex min-h-12 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 shrink-0" checked={drops.includes(index)}
                    onChange={event => {
                      const next = event.target.checked ? [...drops, index] : drops.filter(lineIndex => lineIndex !== index);
                      setSoldOut(current => ({ ...current, [order.id]: next }));
                    }} />
                  <span>{t("markSoldOut", { dish: line.name[locale] || line.name[other] })}
                    <span className="block text-ink-muted">{[line.quantity + " ×", ...line.choices.map(choice => choice.name[locale] || choice.name[other]), line.note].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>)}
              </fieldset>
              <button type="button" className="workspace-button workspace-danger mt-2" disabled={blocked}
                onClick={() => void decide(order.id, { action: "decline" })}>{t("decline")}</button>
            </>}
            {canMoveOrder && <MoveControl label={t("moveOrder")} tables={destinations} disabled={blocked}
              submit={tableId => void decide(order.id, { action: "moveOrder", tableId })} />}
            {canMoveVisit && <MoveControl label={t("moveVisit")} tables={destinations} disabled={blocked}
              submit={tableId => void decide(order.id, { action: "moveVisit", visitId: order.visitId, tableId })} />}
          </details>
        )}
        {problem && <p role="alert" className="text-sm font-medium text-red-800">
          {problem === "decisionError" || problem === "decisionUncertain" ? t(problem)
            : problem === "billPrepared" ? t("billPrepared") : errors(problem)}
        </p>}
        {problem === "decisionUncertain" && <button type="button" className="workspace-button" onClick={() => void refresh.current()}>{t("refresh")}</button>}
      </li>
    );
  }

  const groupRows = [...Map.groupBy(waiting, order => order.tableId)];
  const visitRows = visits.filter(visit => !pendingParties.has(visit.visitId)
    && (bills.has(visit.visitId) || visible.some(order => order.visitId === visit.visitId && order.state === "accepted")));
  const assignedTables = (feed?.assignedTables ?? []).filter(table => !number || String(table.number) === number);

  return (
    <section className="waiter-queue" aria-labelledby={heading}>
      <div className="workspace-title">
        <div>
          <h1 id={heading} tabIndex={-1}>{t(tableId ? "table" : tables ? "heading" : "queueHeading", { number: tableNumber ?? 0 })}</h1>
          {tableId && feed && <p className="mt-1 font-medium">{bills.has(activeVisit?.visitId ?? "") ? billing("heading")
            : activeVisit ? billing("runningTotal", { amount: formatBirr(activeVisit.totalSantim) }) : t("noVisit")}</p>}
        </div>
        {canAdd && <Link href={`/staff/tables/${tableId}/quick-add${tableQuery}`} className="workspace-button workspace-primary">{t("quickAdd")}</Link>}
      </div>
      <div className="workspace-health">
        <p role={stale ? "status" : undefined} className="text-sm">
          {stale ? t("refreshError") : updatedAt ? t("live") : t("loading")}
          {updatedAt && <> · <time dateTime={new Date(updatedAt).toISOString()}>{t("updated", { time: format.dateTime(updatedAt, { timeStyle: "short" }) })}</time></>}
        </p>
        {stale && <button type="button" className="workspace-button" onClick={() => void refresh.current()}>{t("refresh")}</button>}
        {tools}
      </div>
      {feed && !orders.length && (!feed.runningShift || !feed.assignedTables.length) && (
        <p className="workspace-panel">{t(!feed.runningShift ? "noShift" : "noAssignments")}</p>
      )}
      {tables ? (
        <div className="workspace-panel">
          <form action="/staff" role="search" className="workspace-actions items-end mb-4">
            <input type="hidden" name="view" value="tables" />
            <label className="text-sm font-medium">{t("findTable")}
              <input type="search" inputMode="numeric" name="number" defaultValue={number} className="workspace-input" />
            </label>
            <button className="workspace-button" type="submit">{t("find")}</button>
          </form>
          {feed && number && !assignedTables.length && <p className="text-ink-muted">{t("noTableMatch")}</p>}
          <ul className="quiet-tables">
            {assignedTables.map(table => {
              const status = feed?.bills.some(bill => bill.tableId === table.id) ? "tableBill"
                : orders.some(order => order.tableId === table.id && order.state === "sent") ? "tableWaiting"
                : feed?.tableBills.some(visit => visit.tableId === table.id) ? "tableInUse" : "noVisit";
              return <li key={table.id}><Link id={`table-link-${table.id}`} href={`/staff/tables/${table.id}?from=tables${number ? `&number=${encodeURIComponent(number)}` : ""}`} className="table-choice">
                <strong>{t("table", { number: table.number })}</strong><small>{t(status)}</small>
              </Link></li>;
            })}
          </ul>
        </div>
      ) : (
        <>
          {tableId && visitRows.map(visit => <div className="workspace-panel" key={visit.visitId}>{billControls(visit.visitId)}</div>)}
          {(!tableId || groupRows.length > 0) && <div className="workspace-section">
            {!tableId && <h2>{t("waitingCount", { count: waiting.filter(order => order.state === "sent").length })}</h2>}
            {feed?.runningShift && !!assigned.size && !visible.length && !groupRows.length && <p className="workspace-panel text-ink-muted">{t("empty")}</p>}
            <ul className="table-queue">
              {groupRows.map(([id, group]) => <li className="workspace-panel table-queue-group" key={id}>
                {!tableId && <h3><Link id={`table-link-${id}`} href={`/staff/tables/${id}`} className="workspace-link">{t("table", { number: group[0].tableNumber })}</Link></h3>}
                {!assigned.has(id) && <p className="text-sm font-medium">{t("unassignedTable")}</p>}
                <ul className="divide-y divide-rule">{group.map(orderRow)}</ul>
              </li>)}
            </ul>
          </div>}
          {!tableId && visitRows.length > 0 && <section className="workspace-section" aria-label={t("visitActions")}>
            <h2>{t("visitActions")}</h2>
            <ul className="table-queue">
              {[...visitRows].sort((a, b) => Number(bills.has(b.visitId)) - Number(bills.has(a.visitId))).map(visit => {
                const table = visible.find(order => order.visitId === visit.visitId);
                return table && <li className="workspace-panel" key={visit.visitId}>
                  <h3><Link href={`/staff/tables/${visit.tableId}`} className="workspace-link">{t("visitForTable", { number: table.tableNumber })}</Link></h3>
                  {!bills.has(visit.visitId) && <p className="text-sm">{billing("runningTotal", { amount: formatBirr(visit.totalSantim) })}</p>}
                  {billControls(visit.visitId)}
                </li>;
              })}
            </ul>
          </section>}
          {tableId && accepted.length > 0 && <section className="workspace-section">
            <h2>{t("acceptedOrders")}</h2>
            <ul className="workspace-panel divide-y divide-rule">{accepted.map(orderRow)}</ul>
          </section>}
        </>
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
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-rule bg-white px-3 text-base";
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
          <button name="correction" value="save" disabled={disabled} className="min-h-11 rounded-xl border border-rule px-3 text-sm font-semibold disabled:opacity-50">{t("saveQuantity")}</button>
          <button name="correction" value="remove" disabled={disabled} className="min-h-11 rounded-xl border border-rule px-3 text-sm font-semibold disabled:opacity-50">{t("removeLine")}</button>
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
          className="min-h-11 rounded-xl border border-rule bg-white px-3 text-base">
          <option value="" disabled>{t("chooseTable")}</option>
          {tables.map(({ id, number }) => <option key={id} value={id}>{t("table", { number })}</option>)}
        </select>
        <button type="submit" disabled={disabled} className="min-h-11 rounded-xl border border-rule px-3 text-sm font-semibold disabled:opacity-50">
          {t("move")}
        </button>
      </form>
    </details>
  );
}
