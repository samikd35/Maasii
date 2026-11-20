"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MAX_QUANTITY } from "@/core/browser";
import type { Messages } from "@/i18n/messages";
import type { LiveOrder } from "@/lib/supabase/order-feed";
import { formatBirr, Price } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";
import { BillControls, ReceiptEntry, signedBirr, type Receipt, type RecordedReceipt } from "./bill-controls";
import { useWaiterFeed } from "./waiter-feed";
import { WaiterTask } from "./waiter-task";

type Action = { action: "accept"; soldOutLineIndices: number[] }
  | { action: "decline" }
  | { action: "undo"; decisionId: string }
  | { action: "correct"; lineIndex: number; quantity: number | null; reason: string }
  | { action: "moveOrder"; tableId: string }
  | { action: "moveVisit"; visitId: string; tableId: string };
type UndoableOrder = LiveOrder & { decisionId: string; undoUntil: string };
type ErrorReason = keyof Messages["StaffErrors"] | "decisionError" | "decisionUncertain";

export function MyTables({ tableId, tableNumber, tables = false, number = "", tableQuery = "" }: {
  tableId?: string; tableNumber?: number; tables?: boolean; number?: string; tableQuery?: string;
}) {
  const t = useTranslations("StaffOrders");
  const errors = useTranslations("StaffErrors");
  const billing = useTranslations("Bills");
  const format = useFormatter();
  const locale = useLocale();
  const other = locale === "am" ? "en" : "am";
  const heading = useId();
  const { feed, setFeed, updatedAt, stale, refresh, accessLost } = useWaiterFeed();
  const restoredLink = useRef("");
  const receiptTrigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [tableSearch, setTableSearch] = useState(number);
  const [working, setWorking] = useState<{ orderId: string; action: Action["action"] }>();
  const [failure, setFailure] = useState<{ id: string; reason: ErrorReason }>();
  const [soldOut, setSoldOut] = useState<Record<string, number[]>>({});
  const [undoable, setUndoable] = useState<UndoableOrder[]>([]);
  const [reviewed, setReviewed] = useState<string>();
  const [task, setTask] = useState<{ orderId: string; view: "actions" | "availability" }>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [recorded, setRecorded] = useState<{ tableNumber?: number; record: RecordedReceipt }>();
  const showWaitingTimes = !tables && !!feed?.orders.some(order => order.state === "sent" && (!tableId || order.tableId === tableId));

  useEffect(() => {
    if (!showWaitingTimes) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showWaitingTimes]);

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

  async function decide(orderId: string, command: Action): Promise<boolean> {
    if (inFlight.current || failure?.reason === "decisionUncertain" || stale) return false;
    inFlight.current = true;
    setWorking({ orderId, action: command.action });
    setFailure(undefined);
    try {
      const response = await fetch("/staff/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...command }),
        signal: AbortSignal.timeout?.(12_000),
      });
      if (response.status === 403) {
        accessLost();
        setUndoable([]);
        setReceipt(undefined);
        return false;
      }
      if (response.status >= 500) throw new Error("Order outcome unknown");
      if (!response.ok) {
        const { reason }: { reason?: ErrorReason } = await response.json().catch(() => ({}));
        setFailure({ id: orderId, reason: reason ?? "decisionError" });
      } else {
        setTask(current => current?.orderId === orderId ? undefined : current);
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
      void refresh();
      return response.ok;
    } catch {
      const checked = await refresh();
      const latest = checked?.orders.find(order => order.id === orderId);
      if (command.action === "accept" && latest?.state === "accepted") {
        setTask(undefined);
        return true;
      }
      const reason = !checked ? "decisionUncertain" : !latest ? "orderAlreadyDecided" : "decisionError";
      setFailure({ id: orderId, reason });
      return false;
    } finally {
      inFlight.current = false;
      setWorking(undefined);
    }
  }

  async function refreshQueue() {
    const checked = await refresh();
    if (!checked) return;
    setFailure(current => {
      if (current?.reason !== "decisionUncertain") return current;
      const order = checked.orders.find(order => order.id === current.id);
      if (order?.state === "accepted") return undefined;
      return { id: current.id, reason: order ? "decisionError" : "orderAlreadyDecided" };
    });
  }

  function closeReceipt() {
    setReceipt(undefined);
    requestAnimationFrame(() => {
      const trigger = receiptTrigger.current;
      (trigger?.isConnected ? trigger : document.getElementById(heading))?.focus();
    });
  }

  const orders = feed?.orders ?? [];
  const visible = tableId ? orders.filter(order => order.tableId === tableId) : orders;
  const undos = new Map(undoable.filter(order => !tableId || order.tableId === tableId).map(order => [order.id, order]));
  const waiting = [...visible.filter(order => order.state === "sent" && !undos.has(order.id)), ...undos.values()]
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const accepted = visible.filter(order => order.state === "accepted" && !undos.has(order.id));
  const bills = new Map(feed?.bills.map(bill => [bill.visitId, bill]));
  const visitsWithWaitingOrders = new Set(orders.filter(order => order.state === "sent" && !order.partyPending).map(order => order.visitId));
  const visits = (feed?.tableBills ?? []).filter(visit => !tableId || visit.tableId === tableId);
  const assigned = new Set(feed?.assignedTables.map(table => table.id));
  const correctable = new Set(feed?.correctableOrderIds);
  const firstOrder = new Map([...visible].reverse().map(order => [order.visitId, order.id]));
  const pendingParties = new Map([...waiting].reverse().filter(order => order.partyPending).map(order => [order.visitId, order.id]));
  const activeVisit = visits[0];
  const canAdd = tableId && feed?.runningShift && assigned.has(tableId) && !feed.bills.some(bill => bill.tableId === tableId);
  const expanded = waiting.find(({ id }) => id === reviewed)
    ?? waiting.find(order => !order.partyPending)
    ?? waiting[0];
  const reviewedOrder = accepted.find(({ id }) => id === reviewed);

  function billControls(visitId: string, number: number, partyPending = false) {
    const bill = bills.get(visitId);
    return feed && <BillControls key={bill?.preparedAt ?? visitId} target={{ venueId: feed.venueId, visitId }}
      bill={bill} tableNumber={number} waiting={visitsWithWaitingOrders.has(visitId)} disabled={stale}
      onReceipt={(next, trigger) => {
        trigger.focus({ preventScroll: true });
        receiptTrigger.current = trigger;
        setReceipt(next);
      }}
      partyPending={partyPending} methods={feed.paymentOptions} refresh={refresh} />;
  }

  function compact(order: LiveOrder) {
    return !tableId && expanded?.id !== order.id && !undos.has(order.id) && failure?.id !== order.id && task?.orderId !== order.id;
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
    const blocked = !!working || stale || failure?.reason === "decisionUncertain";
    const canAccept = !undo && order.state === "sent" && !order.partyPending;
    const canMoveOrder = !!destinations.length && !bill && !order.partyPending;
    const canMoveVisit = !!destinations.length && visits.some(visit => visit.visitId === order.visitId) && firstOrder.get(order.visitId) === order.id;
    const inTask = task?.orderId === order.id;
    const availability = inTask && task?.view === "availability";
    const ageBadge = <span role="timer" className="workspace-badge waiter-status" data-tone={order.escalatedAt ? "urgent" : "waiting"}>
      <WaiterIcon name={order.escalatedAt ? "alert" : "clock"} />{t("waiting", { time: age })}
    </span>;
    const accept = canAccept && <>
      {droppedQuantity > 0 && <p role="status" className="text-sm font-semibold">{t("acceptSummary", { count: quantity - droppedQuantity, dropped: droppedQuantity })}</p>}
      {quantity === droppedQuantity && <p className="text-sm">{errors("orderAllLinesDropped")}</p>}
      <button type="button" className="workspace-button workspace-primary order-accept" disabled={blocked || !!bill || quantity === droppedQuantity}
        onClick={() => { setReviewed(order.id); void decide(order.id, { action: "accept", soldOutLineIndices: drops }); }}>
        <WaiterIcon name="check" />
        {working?.orderId === order.id && working.action === "accept" ? t("accepting")
          : droppedQuantity ? t("acceptCount", { count: quantity - droppedQuantity }) : t("accept")}
      </button>
    </>;
    const issue = problem && <>
      <p role="alert" className="text-sm font-medium text-red-800">
        {problem === "decisionError" || problem === "decisionUncertain" ? t(problem)
          : problem === "billPrepared" ? t("billPrepared") : errors(problem)}
      </p>
      {problem === "decisionUncertain" && <button type="button" className="workspace-button" onClick={() => void refreshQueue()}>{t("refresh")}</button>}
    </>;
    if (compact(order)) {
      return (
        <li key={order.id} className="waiter-compact-order">
          <button type="button" className="waiter-review-order" aria-label={t("reviewAtTable", { number: order.tableNumber })}
            onClick={() => {
              setReviewed(order.id);
              requestAnimationFrame(() => document.getElementById(`waiter-order-${order.id}`)?.focus());
            }}>
            <span><strong>{t("table", { number: order.tableNumber })}</strong>
              <small>{order.partyPending ? t("tableNeedsReview") : t("dishQuantity", { count: quantity })}</small></span>
            {ageBadge}<WaiterIcon name="down" />
          </button>
        </li>
      );
    }
    return (
      <li key={order.id} className="order-row" id={`waiter-order-${order.id}`} tabIndex={-1}>
        {(undo || order.state === "sent") && <div className="order-row-heading">
          <p className="text-sm font-semibold">{t("newOrder")} · {t("dishQuantity", { count: quantity })}</p>
          {!undo && ageBadge}
        </div>}
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
                  <CorrectionForm quantity={line.quantity} disabled={blocked} busy={working?.orderId === order.id}
                    dish={line.name[locale] || line.name[other]} title={t("correctAtTable", { number: order.tableNumber })} issue={issue}
                    submit={(quantity, reason) => decide(order.id, { action: "correct", lineIndex: index, quantity, reason })} />
                )}
              </div>
            </li>;
          })}
        </ul>
        {!undo && order.state === "accepted" && <p className="waiter-order-meta">
          <WaiterIcon name="circleCheck" />
          <span>{t("accepted", { name: order.acceptedByName ?? "" })}</span>
          <span aria-hidden="true">·</span>
          <span>{t(order.source === "waiter" ? "waiterSource" : "guestSource")}</span>
        </p>}
        {pendingParties.get(order.visitId) === order.id && bill && feed?.billVisitIds.includes(order.visitId) && (
          <div className="waiter-party-bill">
            <p className="font-semibold">{billing("total", { amount: formatBirr(bill.totalSantim) })}</p>
            {billControls(order.visitId, order.tableNumber, true)}
          </div>
        )}
        {canAccept && bill && <p className="waiter-help">{t("billPrepared")}</p>}
        {undo && (
          <div className="workspace-actions">
            <p role="status" className="waiter-order-meta">
              <WaiterIcon name={undo.state === "declined" ? "alert" : "circleCheck"} />
              {t(undo.state === "declined" ? "declined" : "accepted", { name: undo.acceptedByName ?? "" })}
            </p>
            <button type="button" className="workspace-button" disabled={blocked}
              onClick={() => void decide(order.id, { action: "undo", decisionId: undo.decisionId })}><WaiterIcon name="undo" />{t("undo")}</button>
          </div>
        )}
        {!inTask && accept}
        {!undo && (canMoveOrder || canMoveVisit || canAccept) && (
          <>
            <div className="waiter-order-options">
              {canAccept && !bill && <button type="button" className="workspace-button waiter-quiet-action" aria-haspopup="dialog" onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setTask({ orderId: order.id, view: "availability" });
              }}><WaiterIcon name="alert" />{t("itemUnavailable")}</button>}
              <button type="button" className="workspace-button waiter-quiet-action" aria-haspopup="dialog" onClick={event => {
                event.currentTarget.focus({ preventScroll: true });
                setTask({ orderId: order.id, view: "actions" });
              }}><WaiterIcon name="more" />{t("decisions")}</button>
            </div>
            <WaiterTask open={inTask} busy={!!working} title={t(availability ? "availabilityAtTable" : "actionsAtTable", { number: order.tableNumber })}
              closeLabel={billing("cancel")} onClose={() => {
                setTask(current => current?.orderId === order.id ? undefined : current);
                setSoldOut(current => {
                  if (!current[order.id]) return current;
                  const next = { ...current };
                  delete next[order.id];
                  return next;
                });
              }}>
              {availability && canAccept && <>
                <p className="waiter-help">{t("soldOutScope")}</p>
                <fieldset className="waiter-options" disabled={blocked || !!bill}>
                  <legend className="font-semibold">{t("soldOut")}</legend>
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
                <div className="waiter-task-footer">{accept}</div>
              </>}
              {!availability && canMoveOrder && <MoveControl label={t("moveOrder")} tables={destinations} disabled={blocked}
                submit={tableId => void decide(order.id, { action: "moveOrder", tableId })} />}
              {!availability && canMoveVisit && <MoveControl label={t("moveVisit")} tables={destinations} disabled={blocked}
                submit={tableId => void decide(order.id, { action: "moveVisit", visitId: order.visitId, tableId })} />}
              {issue}
              {!availability && canAccept && <div className="waiter-task-footer">
                <button type="button" className="workspace-button workspace-danger" disabled={blocked || !!bill}
                  onClick={() => void decide(order.id, { action: "decline" })}>{t("decline")}</button>
              </div>}
            </WaiterTask>
          </>
        )}
        {!inTask && issue}
      </li>
    );
  }

  const groupRows = [...Map.groupBy(waiting, order => order.tableId)];
  const visitRows = visits.filter(visit => !pendingParties.has(visit.visitId)
    && (bills.has(visit.visitId) || visible.some(order => order.visitId === visit.visitId && order.state === "accepted")));
  const query = tableSearch.trim().replace(/^0+(?=\d)/, "");
  const assignedTables = (feed?.assignedTables ?? []).filter(table => String(table.number).startsWith(query));
  const preparedRows = visitRows.filter(visit => bills.has(visit.visitId));
  const waitingCount = waiting.filter(order => order.state === "sent" && !undos.has(order.id)).length;
  const ready = feed?.runningShift && assigned.size > 0;
  const tableBill = bills.get(activeVisit?.visitId ?? "");
  const tableState = waiting.some(order => order.partyPending) ? "tableNeedsReview"
    : waitingCount ? "tableWaiting" : tableBill ? "tableBill" : activeVisit ? "tableInUse" : "noVisit";

  return (
    <section className="waiter-queue" aria-labelledby={heading}>
      <div className="waiter-view-heading">
        <div>
          <h1 id={heading} tabIndex={-1}>{t(tableId ? "table" : tables ? "heading" : "queueHeading", { number: tableNumber ?? 0 })}</h1>
          {tableId && feed && <TableStatus state={tableState} />}
        </div>
        <p className="waiter-connection" data-live={!!updatedAt && !stale}>
          {stale ? t("reconnecting") : updatedAt ? t("live") : t("loading")}
        </p>
      </div>
      {stale && <div className="waiter-notice" data-tone="warning">
        <p role="status">{t("refreshError")}{updatedAt && <> · <time dateTime={new Date(updatedAt).toISOString()}>{t("updated", { time: format.dateTime(updatedAt, { timeStyle: "short" }) })}</time></>}</p>
        <button type="button" className="workspace-button" onClick={() => void refreshQueue()}>{t("refresh")}</button>
      </div>}
      {feed && !ready && (
        <p className="waiter-notice" data-tone="warning"><WaiterIcon name="alert" />{t(!feed.runningShift ? "noShift" : "noAssignments")}</p>
      )}
      {recorded && <div className="waiter-notice waiter-payment-result" role="status">
        <WaiterIcon name="circleCheck" />
        <div>
          <strong>{recorded.tableNumber === undefined ? billing("recorded") : billing("recordedForTable", { number: recorded.tableNumber })}</strong>
          <p>{billing("recordedDetails", {
            amount: formatBirr(recorded.record.receiptAmountSantim),
            method: recorded.record.method.provider ?? billing(recorded.record.method.kind),
            difference: signedBirr(recorded.record.differenceSantim),
          })}</p>
        </div>
      </div>}
      {tables ? (
        <div className="waiter-table-list">
          <div role="search">
            <label className="waiter-search text-sm font-medium">
              <span>{t("findTable")}</span>
              <span className="waiter-search-field"><WaiterIcon name="search" />
                <input type="search" inputMode="numeric" name="number" value={tableSearch} onChange={event => setTableSearch(event.target.value)} className="workspace-input" />
              </span>
            </label>
          </div>
          {feed && query && !assignedTables.length && <p className="text-ink-muted" role="status">{t("noTableMatch")}</p>}
          <ul className="waiter-table-grid">
            {assignedTables.map(table => {
              const pending = orders.filter(order => order.tableId === table.id && order.state === "sent");
              const bill = feed?.bills.find(bill => bill.tableId === table.id);
              const status = pending.some(order => order.partyPending) ? "tableNeedsReview"
                : pending.length ? "tableWaiting"
                : bill ? "tableBill"
                : feed?.tableBills.some(visit => visit.tableId === table.id) ? "tableInUse" : "noVisit";
              return <li key={table.id}><Link id={`table-link-${table.id}`} href={`/staff/tables/${table.id}?from=tables${/^\d{1,9}$/.test(query) ? `&number=${query}` : ""}`}
                data-state={status} className="waiter-table-tile">
                <strong>{t("table", { number: table.number })}</strong>
                <TableStatus state={status} />
                {bill && <Price santim={bill.totalSantim} />}
              </Link></li>;
            })}
          </ul>
        </div>
      ) : (
        <>
          {tableId && tableNumber !== undefined && (visitRows.length > 0 || canAdd) && <div className="waiter-table-visit workspace-panel">
            {visitRows.map(visit => <div className="waiter-visit-amount" key={visit.visitId}>
              <span>{billing(bills.has(visit.visitId) ? "billTotalLabel" : "runningTotalLabel")}</span>
              <Price santim={visit.totalSantim} />
            </div>)}
            {waitingCount > 0 && <a href="#table-waiting-orders" className="workspace-button workspace-primary">
              <WaiterIcon name="queue" />{t("reviewNewOrders", { count: waitingCount })}
            </a>}
            {visitRows.map(visit => billControls(visit.visitId, tableNumber))}
            {canAdd && <Link href={`/staff/tables/${tableId}/quick-add${tableQuery}`}
              className={waitingCount ? "workspace-button" : "workspace-button workspace-primary"}><WaiterIcon name="plus" />{t("quickAdd")}</Link>}
          </div>}
          {(!tableId || groupRows.length > 0) && <div className="workspace-section waiter-order-lane" id={tableId ? "table-waiting-orders" : undefined} tabIndex={tableId ? -1 : undefined}>
            {((!tableId && feed && (waitingCount > 0 || preparedRows.length > 0)) || (tableId && waitingCount > 0)) && <div className="waiter-queue-heading">
              <h2>{t("waitingCount", { count: waitingCount })}</h2>
              {!tableId && preparedRows.length > 0 && <a className="waiter-status" data-tone="bill" href="#waiter-prepared-bills">
                <WaiterIcon name="receipt" />{billing("readyCount", { count: preparedRows.length })}
              </a>}
            </div>}
            {!tableId && !waitingCount && ready && !stale && !groupRows.length && !preparedRows.length && <div className="waiter-empty">
              <WaiterIcon name="circleCheck" />
              <p className="font-semibold">{t("caughtUp")}</p>
              <Link href="/staff?view=tables" className="workspace-link">{t("openMyTables")}</Link>
            </div>}
            {!tableId && reviewedOrder && <div className="waiter-notice">
              <p role="status">{t("table", { number: reviewedOrder.tableNumber })} · {reviewedOrder.acceptedByName
                ? t("accepted", { name: reviewedOrder.acceptedByName }) : t("acceptedOrder")}</p>
              <Link href={`/staff/tables/${reviewedOrder.tableId}`} className="workspace-link">{t("openTable")}</Link>
            </div>}
            {!tableId && failure?.reason === "orderAlreadyDecided" && !reviewedOrder && !waiting.some(order => order.id === failure.id)
              && <p role="status" className="waiter-notice">{errors("orderAlreadyDecided")}</p>}
            <ul className="table-queue">
              {groupRows.map(([id, group]) => {
                const collapsed = group.every(compact);
                return <li className="workspace-panel table-queue-group" key={id} data-compact={collapsed}
                  id={!tableId && collapsed ? `table-link-${id}` : undefined} tabIndex={!tableId && collapsed ? -1 : undefined}>
                  {!tableId && <h3 className={collapsed ? "sr-only" : undefined}>
                    {collapsed ? t("table", { number: group[0].tableNumber }) :
                      <Link id={`table-link-${id}`} href={`/staff/tables/${id}`} className="waiter-table-link">
                        {t("table", { number: group[0].tableNumber })}<WaiterIcon name="next" />
                      </Link>}
                  </h3>}
                  {!assigned.has(id) && <p className="waiter-unassigned text-sm font-medium">{t("unassignedTable")}</p>}
                  <ul className="divide-y divide-rule">{group.map(orderRow)}</ul>
                </li>;
              })}
            </ul>
          </div>}
          {!tableId && preparedRows.length > 0 && <section id="waiter-prepared-bills" tabIndex={-1} className="workspace-section" aria-label={billing("heading")}>
            <h2>{billing("heading")}</h2>
            <ul className="table-queue">
              {preparedRows.map(visit => {
                const table = feed?.moveTables.find(table => table.id === visit.tableId);
                return table && <li className="workspace-panel" key={visit.visitId}>
                  <h3><Link href={`/staff/tables/${visit.tableId}`} className="waiter-table-link">
                    {t("table", { number: table.number })}<WaiterIcon name="next" />
                  </Link></h3>
                  <div className="waiter-visit-amount"><span>{billing("billTotalLabel")}</span><Price santim={visit.totalSantim} /></div>
                  {billControls(visit.visitId, table.number)}
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
      {feed && receipt && <ReceiptEntry receipt={receipt} focused refresh={refresh} onClose={closeReceipt} onRecorded={record => {
        setRecorded({ tableNumber: receipt.tableNumber, record });
        closeReceipt();
      }} />}
    </section>
  );
}

type TableState = "tableNeedsReview" | "tableWaiting" | "tableBill" | "tableInUse" | "noVisit";
function TableStatus({ state }: { state: TableState }) {
  const t = useTranslations("StaffOrders");
  const tone = { tableNeedsReview: "urgent", tableWaiting: "waiting", tableBill: "bill", tableInUse: "service", noVisit: "neutral" } as const;
  const icon = { tableNeedsReview: "alert", tableWaiting: "clock", tableBill: "receipt", tableInUse: "circleCheck" } as const;
  return <span className="waiter-status" data-tone={tone[state]}>{state !== "noVisit" && <WaiterIcon name={icon[state]} />}{t(state)}</span>;
}

function CorrectionForm({ quantity, dish, title, disabled, busy, issue, submit }: {
  quantity: number;
  dish: string;
  title: string;
  disabled: boolean;
  busy: boolean;
  issue: ReactNode;
  submit: (quantity: number | null, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("StaffOrders");
  const billing = useTranslations("Bills");
  const [open, setOpen] = useState(false);
  const field = "mt-1 block min-h-11 w-full rounded-xl border border-rule bg-white px-3 text-base";
  return (
    <>
      <button type="button" className="workspace-button waiter-quiet-action text-sm" aria-haspopup="dialog"
        onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setOpen(true); }}>{t("correctLine")}</button>
      <WaiterTask open={open} busy={busy} title={title} closeLabel={billing("cancel")} onClose={() => setOpen(false)}>
        <p className="font-semibold">{dish}</p>
        <form className="waiter-task-form" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
          const quantity = form.get("correction") === "remove" ? null : Number(form.get("quantity"));
          if (await submit(quantity, String(form.get("reason")))) setOpen(false);
        }}>
          <label className="block text-sm">{t("quantity")}
            <input className={field} type="number" inputMode="numeric" name="quantity" min="1" max={MAX_QUANTITY} defaultValue={quantity} required />
          </label>
          <label className="block text-sm">{t("correctionReason")}
            <input className={field} name="reason" maxLength={300} required />
          </label>
          {issue}
          <div className="waiter-task-footer">
            <button type="submit" name="correction" value="save" disabled={disabled} className="workspace-button workspace-primary">{t("saveQuantity")}</button>
            <button type="submit" name="correction" value="remove" disabled={disabled} className="workspace-button workspace-danger">{t("removeLine")}</button>
          </div>
        </form>
      </WaiterTask>
    </>
  );
}

function MoveControl({ label, tables, disabled, submit }: {
  label: string;
  tables: { id: string; number: number }[];
  disabled: boolean;
  submit: (tableId: string) => void;
}) {
  const t = useTranslations("StaffOrders");
  const [selected, setSelected] = useState("");
  const destination = tables.find(table => table.id === selected);
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{label}</summary>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        submit(String(new FormData(event.currentTarget).get("tableId")));
      }}>
        <select name="tableId" aria-label={label} value={selected} onChange={event => setSelected(event.target.value)} required disabled={disabled}
          className="min-h-11 rounded-xl border border-rule bg-white px-3 text-base">
          <option value="" disabled>{t("chooseTable")}</option>
          {tables.map(({ id, number }) => <option key={id} value={id}>{t("table", { number })}</option>)}
        </select>
        <button type="submit" disabled={disabled || !destination} className="workspace-button">
          {destination ? t("moveTo", { number: destination.number }) : t("move")}
        </button>
      </form>
    </details>
  );
}
