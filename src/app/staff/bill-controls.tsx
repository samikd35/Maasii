"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import type { getMyTableOrders, PreparedBill } from "@/core";
import { formatBirr, parseBirr } from "@/ui/price";

type Method = Awaited<ReturnType<typeof getMyTableOrders>>["paymentOptions"][number];
type Target = { venueId: string; visitId: string };
type Action = { action: "prepare" | "reopen" }
  | { action: "confirm"; paymentOptionId: string | null; receiptAmountSantim: number };

const primary = "min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-ink/30 px-4 text-sm font-semibold disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-xl border border-ink/30 bg-white px-3 text-base";


export function BillControls({
  target, bill, methods, refresh, tableNumber, partyPending = false,
}: {
  target: Target;
  bill?: Omit<PreparedBill, "preparedAt">;
  methods: Method[];
  tableNumber?: number;
  partyPending?: boolean;
  refresh: () => Promise<unknown>;
}) {
  const t = useTranslations("Bills");
  const [confirming, setConfirming] = useState(false);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [invalidAmount, setInvalidAmount] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const receiptButton = useRef<HTMLButtonElement>(null);
  const amountId = useId();
  const errorId = useId();
  const receiptAmountSantim = parseBirr(amount);
  const difference = bill && receiptAmountSantim !== null ? receiptAmountSantim - bill.totalSantim : 0;

  async function change(command: Action) {
    setWorking(true);
    setFailed(false);
    try {
      const response = await fetch("/staff/bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, ...command }),
      });
      await refresh();
      if (!response.ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {bill ? (
        <>
          <p className="font-semibold tabular-nums">{t("total", { amount: formatBirr(bill.totalSantim) })}</p>
          {bill.reminder && <p className="workspace-badge" data-tone="waiting">{t("paidQuestion")}</p>}
          {!confirming && (
            <div className="workspace-actions">
              <button ref={receiptButton} type="button" className="workspace-button workspace-primary" disabled={working}
                onClick={() => { setFailed(false); setConfirming(true); }}>
                {t(partyPending ? "previousPartyPaid" : "enterReceipt")}
              </button>
              {partyPending ? <button type="button" className={secondary} disabled={working} onClick={() => void change({ action: "reopen" })}>
                {t("sameParty")}
              </button> : <details className="workspace-disclosure">
                <summary className="workspace-summary">{t("actions")}</summary>
                <button type="button" className={secondary} disabled={working} onClick={() => void change({ action: "reopen" })}>{t("reopen")}</button>
              </details>}
            </div>
          )}
          {confirming && (
            <form className="space-y-3 border-t border-rule pt-3" onSubmit={(event) => {
              event.preventDefault();
              if (receiptAmountSantim === null) {
                setInvalidAmount(true);
                amountRef.current?.focus();
                return;
              }
              if (receiptAmountSantim !== null && method) {
                void change({ action: "confirm", receiptAmountSantim, paymentOptionId: method === "cash" ? null : method });
              }
            }}>
              <h3>{tableNumber === undefined ? t("enterReceipt") : t("receiptAt", { number: tableNumber })}</h3>
              <label className="block text-sm font-medium">
                {t("method")}
                <select autoFocus className={field} value={method} onChange={(event) => setMethod(event.target.value)} required>
                  <option value="" disabled>{t("selectMethod")}</option>
                  {!methods.some(({ kind, provider }) => kind === "cash" && !provider) && <option value="cash">{t("cash")}</option>}
                  {methods.map(({ id, kind, provider, accountOrMerchantCode }) => (
                    <option key={id} value={id}>{[provider ?? t(kind), accountOrMerchantCode].filter(Boolean).join(" · ")}</option>
                  ))}
                </select>
              </label>
              <label htmlFor={amountId} className="block text-sm font-medium">
                {t("amount")}
                <input ref={amountRef} id={amountId} name="receiptAmount" className={field} inputMode="decimal" autoComplete="off" required
                  aria-invalid={invalidAmount || undefined} aria-describedby={invalidAmount ? errorId : undefined}
                  onBlur={() => setInvalidAmount(amount !== "" && receiptAmountSantim === null)}
                  value={amount} onChange={(event) => {
                    setAmount(event.target.value);
                    if (parseBirr(event.target.value) !== null) setInvalidAmount(false);
                  }} />
              </label>
              {invalidAmount && <p id={errorId} className="text-sm" role="alert">{t("invalidAmount")}</p>}
              {receiptAmountSantim !== null && (
                <p className="text-sm">
                  {t("difference", { amount: (difference < 0 ? "−" : difference > 0 ? "+" : "") + formatBirr(Math.abs(difference)) })}
                </p>
              )}
              <div className="workspace-actions">
                <button type="button" className="workspace-button" disabled={working} onClick={() => {
                  setConfirming(false);
                  setInvalidAmount(false);
                  setFailed(false);
                  setAmount("");
                  setMethod("");
                  requestAnimationFrame(() => receiptButton.current?.focus());
                }}>{t("cancel")}</button>
                <button type="submit" className="workspace-button workspace-primary" disabled={working}>{t(working ? "recording" : "record")}</button>
              </div>
            </form>
          )}
        </>
      ) : (
        <button type="button" className={primary} disabled={working} onClick={() => void change({ action: "prepare" })}>
          {t("prepare")}
        </button>
      )}
      {failed && <p role="alert" className="text-sm">{t("error")}</p>}
    </div>
  );
}
