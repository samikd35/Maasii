"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { getMyTableOrders, PaymentConfirmation, PreparedBill } from "@/core";
import { formatBirr, parseBirr } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";
import { WaiterTask } from "./waiter-task";

type Method = Awaited<ReturnType<typeof getMyTableOrders>>["paymentOptions"][number];
type Target = { venueId: string; visitId: string };
type DeskBill = Omit<PreparedBill, "preparedAt"> & { preparedAt: string };
type BillSnapshot = Pick<DeskBill, "preparedAt" | "totalSantim">;
type BillIssue = "error" | "ordersWaiting" | "changed";
export type Receipt = {
  target: Target;
  bill: DeskBill;
  methods: Method[];
  tableNumber?: number;
  partyPending?: boolean;
};
export type RecordedReceipt = Pick<PaymentConfirmation, "receiptAmountSantim" | "billTotalSantim" | "differenceSantim"> & {
  method: Pick<PaymentConfirmation["method"], "kind" | "provider">;
};

const field = "mt-1 block min-h-11 w-full rounded-xl border border-ink/30 bg-white px-3 text-base";

async function billIssue(response: Response): Promise<BillIssue> {
  const result = await response.json().catch(() => null);
  if (result?.reason === "billOrdersWaiting") return "ordersWaiting";
  if (result?.reason === "billChanged") return "changed";
  return "error";
}

export function BillControls({ target, bill, methods, refresh, tableNumber, partyPending, onReceipt, waiting = false, disabled = false }: {
  target: Target;
  bill?: DeskBill;
  methods: Method[];
  tableNumber?: number;
  partyPending?: boolean;
  waiting?: boolean;
  disabled?: boolean;
  onReceipt: (receipt: Receipt, trigger: HTMLButtonElement) => void;
  refresh: () => Promise<unknown>;
}) {
  const t = useTranslations("Bills");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<BillIssue>();
  const inFlight = useRef(false);

  async function change(action: "prepare" | "reopen") {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setFailure(undefined);
    try {
      const response = await fetch("/staff/bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, action }), signal: AbortSignal.timeout?.(12_000),
      });
      if (!response.ok) setFailure(await billIssue(response));
    } catch {
      setFailure("error");
    } finally {
      await refresh();
      inFlight.current = false;
      setWorking(false);
    }
  }

  const reopen = (label: string) => <button type="button" className="workspace-button"
    disabled={disabled || working} onClick={() => void change("reopen")}>{label}</button>;

  return (
    <div className="waiter-bill-controls">
      {bill ? (
        <>
          {bill.reminder && <p className="workspace-badge" data-tone="waiting">{t("paidQuestion")}</p>}
          {waiting ? <>
            <p className="waiter-help">{t("ordersWaiting")}</p>
            {reopen(t("reopen"))}
          </> : (
            <div className="workspace-actions">
              <button type="button" className="workspace-button workspace-primary" disabled={disabled || working}
                aria-haspopup="dialog" onClick={event => {
                  setFailure(undefined);
                  onReceipt({ target, bill, methods, tableNumber, partyPending }, event.currentTarget);
                }}>
                <WaiterIcon name="receipt" />
                {t(partyPending ? "previousPartyPaid" : "enterReceipt")}
              </button>
              {partyPending ? reopen(t("sameParty")) : <details className="workspace-disclosure waiter-bill-actions">
                <summary className="workspace-summary"><WaiterIcon name="more" />{t("actions")}</summary>
                {reopen(t("reopen"))}
              </details>}
            </div>
          )}
        </>
      ) : !waiting && (
        <button type="button" className="workspace-button workspace-primary" disabled={disabled || working}
          onClick={() => void change("prepare")}>
          <WaiterIcon name="receipt" />{t("prepare")}
        </button>
      )}
      {failure && <p role="alert" className="text-sm text-red-800">{t(failure)}</p>}
    </div>
  );
}

export function ReceiptEntry({ receipt, onRecorded, onClose, refresh }: {
  receipt: Receipt;
  onRecorded: (record: RecordedReceipt) => void;
  onClose: () => void;
  refresh: () => Promise<unknown>;
}) {
  const t = useTranslations("Bills");
  const { methods, tableNumber, target } = receipt;
  const [bill, setBill] = useState<BillSnapshot>(receipt.bill);
  const [latest, setLatest] = useState<BillSnapshot>();
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"entry" | "saving" | "checking" | "uncertain" | "review" | "blocked">("entry");
  const [issue, setIssue] = useState<BillIssue | "notRecorded">();
  const [invalidAmount, setInvalidAmount] = useState(false);
  const inFlight = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<HTMLSelectElement>(null);
  const amountId = useId();
  const methodId = useId();
  const errorId = useId();
  const receiptAmountSantim = parseBirr(amount);
  const busy = phase === "saving" || phase === "checking";
  const title = tableNumber === undefined ? t("enterReceipt") : t(receipt.partyPending ? "previousReceiptAt" : "receiptAt", { number: tableNumber });

  function recorded(result: RecordedReceipt) {
    onRecorded(result);
    void refresh();
  }

  async function check() {
    setPhase("checking");
    setIssue(undefined);
    try {
      const response = await fetch("/staff/bills?" + new URLSearchParams(target), {
        cache: "no-store", signal: AbortSignal.timeout?.(10_000),
      });
      if (response.status === 403) {
        setPhase("blocked");
        setIssue("error");
        void refresh();
        return;
      }
      if (response.status >= 500) throw Error("Receipt status unavailable");
      if (!response.ok) {
        setPhase("blocked");
        setIssue(await billIssue(response));
        void refresh();
        return;
      }
      const result = await response.json();
      if (result.status === "recorded") {
        recorded(result.confirmation);
      } else if (result.status === "prepared") {
        if (bill.preparedAt === result.preparedAt && bill.totalSantim === result.totalSantim) {
          setPhase("entry");
          setIssue("notRecorded");
        } else {
          setLatest({ preparedAt: result.preparedAt, totalSantim: result.totalSantim });
          setPhase("review");
        }
      } else {
        setPhase("blocked");
        setIssue("changed");
        void refresh();
      }
    } catch {
      setPhase("uncertain");
    }
  }

  async function record(value: number) {
    if (inFlight.current || phase !== "entry") return;
    inFlight.current = true;
    setPhase("saving");
    setIssue(undefined);
    try {
      const response = await fetch("/staff/bills", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout?.(12_000),
        body: JSON.stringify({
          ...target, action: "confirm", receiptAmountSantim: value, paymentOptionId: method === "cash" ? null : method,
          billSnapshot: { totalSantim: bill.totalSantim, preparedAt: bill.preparedAt },
        }),
      });
      if (response.status >= 500) throw Error("Receipt outcome unknown");
      if (response.ok) {
        recorded(await response.json());
      } else {
        const failure = await billIssue(response);
        if (failure === "changed") await check();
        else {
          setIssue(failure);
          setPhase(failure === "error" && response.status !== 403 ? "entry" : "blocked");
          void refresh();
        }
      }
    } catch {
      await check();
    } finally {
      inFlight.current = false;
    }
  }

  const form = (
    <form className="waiter-task-form" onSubmit={event => {
      event.preventDefault();
      if (receiptAmountSantim === null) {
        setInvalidAmount(true);
        amountRef.current?.focus();
      } else if (method) {
        void record(receiptAmountSantim);
      }
    }}>
      <div className="waiter-receipt-total"><WaiterIcon name="receipt" />
        <p>{t("total", { amount: formatBirr(bill.totalSantim) })}</p>
      </div>
      <div>
        <label htmlFor={methodId} className="block text-sm font-medium">{t("method")}</label>
        <select ref={methodRef} id={methodId} className={field} value={method} disabled={phase !== "entry"} onChange={event => setMethod(event.target.value)} required>
          <option value="" disabled>{t("selectMethod")}</option>
          {!methods.some(({ kind, provider }) => kind === "cash" && !provider) && <option value="cash">{t("cash")}</option>}
          {methods.map(({ id, kind, provider, accountOrMerchantCode }) => (
            <option key={id} value={id}>{[provider ?? t(kind), accountOrMerchantCode].filter(Boolean).join(" · ")}</option>
          ))}
        </select>
      </div>
      <label htmlFor={amountId} className="block text-sm font-medium">
        {t("amount")}
        <input ref={amountRef} id={amountId} name="receiptAmount" className={field} inputMode="decimal" autoComplete="off" required readOnly={phase !== "entry"}
          aria-invalid={invalidAmount || undefined} aria-describedby={invalidAmount ? errorId : undefined}
          onBlur={() => setInvalidAmount(amount !== "" && receiptAmountSantim === null)}
          value={amount} onChange={event => {
            setAmount(event.target.value);
            if (parseBirr(event.target.value) !== null) setInvalidAmount(false);
          }} />
      </label>
      {invalidAmount && <p id={errorId} className="text-sm" role="alert">{t("invalidAmount")}</p>}
      {receiptAmountSantim !== null && <p className="waiter-receipt-difference">{t("difference", { amount: signedBirr(receiptAmountSantim - bill.totalSantim) })}</p>}
      {phase === "checking" && <p role="status" className="text-sm">{t("checking")}</p>}
      {phase === "uncertain" && <p role="alert" className="text-sm">{t("unknown")}</p>}
      {phase === "review" && latest && <p role="alert" className="text-sm font-medium">
        {t("changedAmounts", { previous: formatBirr(bill.totalSantim), current: formatBirr(latest.totalSantim) })}
      </p>}
      {issue && <p role="alert" className="text-sm text-red-800">{t(issue)}</p>}
      <div className="waiter-task-footer waiter-commit">
        {phase === "uncertain" ? <button key="check" type="button" className="workspace-button workspace-primary"
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            try { await check(); } finally { inFlight.current = false; }
          }}>{t("checkStatus")}</button>
          : phase === "review" && latest ? <button key="review" type="button" className="workspace-button workspace-primary"
            onClick={event => {
              event.preventDefault();
              setBill(latest);
              setPhase("entry");
              requestAnimationFrame(() => amountRef.current?.focus({ preventScroll: true }));
            }}>{t("reviewUpdated")}</button>
          : <button key="record" type="submit" className="workspace-button workspace-primary" disabled={phase !== "entry"}>
            <WaiterIcon name="check" />{t(phase === "saving" ? "recording" : "recordShort")}
          </button>}
      </div>
    </form>
  );

  return <WaiterTask open busy={busy} title={title} closeLabel={t("cancel")} initialFocus={methodRef} onClose={onClose}>{form}</WaiterTask>;
}

export function signedBirr(difference: number) {
  return (difference < 0 ? "−" : difference > 0 ? "+" : "") + formatBirr(Math.abs(difference));
}
