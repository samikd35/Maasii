"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { getMyTableOrders, PreparedBill } from "@/core";
import { formatBirr } from "@/ui/price";

type Method = Awaited<ReturnType<typeof getMyTableOrders>>["paymentOptions"][number];
type Target = { venueId: string; visitId: string };
type Action = { action: "prepare" | "reopen" }
  | { action: "confirm"; paymentOptionId: string | null; receiptAmountSantim: number };

const primary = "min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50";
const secondary = "min-h-11 rounded-lg border border-ink/30 px-4 text-sm font-semibold disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base";

function toSantim(input: string): number | null {
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(input)) return null;
  const [birr, fraction = ""] = input.split(".");
  const santim = Number(birr + fraction.padEnd(2, "0"));
  return Number.isSafeInteger(santim) ? santim : null;
}

export function BillControls({
  target, bill, methods, refresh, partyPending = false,
}: {
  target: Target;
  bill?: Omit<PreparedBill, "preparedAt">;
  methods: Method[];
  partyPending?: boolean;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("Bills");
  const [confirming, setConfirming] = useState(false);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const receiptAmountSantim = toSantim(amount);
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
          <p className="text-sm font-semibold">{t("total", { amount: formatBirr(bill.totalSantim) })}</p>
          {bill.reminder && <p role="status" className="text-sm font-semibold">{t("paidQuestion")}</p>}
          <div className="flex flex-wrap gap-2">
            {!confirming && (
              <button type="button" className={primary} disabled={working} onClick={() => setConfirming(true)}>
                {t(partyPending ? "previousPartyPaid" : "confirm")}
              </button>
            )}
            <button type="button" className={secondary} disabled={working} onClick={() => void change({ action: "reopen" })}>
              {t(partyPending ? "sameParty" : "reopen")}
            </button>
          </div>
          {confirming && (
            <form className="space-y-3 border-t border-rule pt-3" onSubmit={(event) => {
              event.preventDefault();
              if (receiptAmountSantim !== null && method) {
                void change({ action: "confirm", receiptAmountSantim, paymentOptionId: method === "cash" ? null : method });
              }
            }}>
              <label className="block text-sm font-medium">
                {t("method")}
                <select className={field} value={method} onChange={(event) => setMethod(event.target.value)} required>
                  <option value="" disabled>{t("selectMethod")}</option>
                  {!methods.some(({ kind, provider }) => kind === "cash" && !provider) && <option value="cash">{t("cash")}</option>}
                  {methods.map(({ id, kind, provider, accountOrMerchantCode }) => (
                    <option key={id} value={id}>{[provider ?? t(kind), accountOrMerchantCode].filter(Boolean).join(" · ")}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("amount")}
                <input className={field} inputMode="decimal" autoComplete="off" required
                  value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              {amount && receiptAmountSantim === null && <p className="text-sm" role="status">{t("invalidAmount")}</p>}
              {difference !== 0 && (
                <p className="text-sm" role="status">
                  {t("difference", { amount: (difference < 0 ? "−" : "+") + formatBirr(Math.abs(difference)) })}
                </p>
              )}
              <button type="submit" className={primary} disabled={working || !method || receiptAmountSantim === null}>
                {t("record")}
              </button>
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
