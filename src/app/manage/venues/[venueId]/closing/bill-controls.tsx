"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { BillControls, ReceiptEntry, signedBirr, type Receipt, type RecordedReceipt } from "@/app/staff/bill-controls";
import { WaiterTask } from "@/app/staff/waiter-task";
import { formatBirr } from "@/ui/price";
import { WaiterIcon } from "@/ui/waiter-icon";

const OpenReceipt = createContext<(receipt: Receipt) => void>(() => {});

export function ClosingReceipts({ root, children }: { root: string; children: ReactNode }) {
  const t = useTranslations("Bills");
  const closing = useTranslations("Closing");
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt>();
  const [recorded, setRecorded] = useState<{ receipt: Receipt; record: RecordedReceipt }>();

  return <OpenReceipt.Provider value={setReceipt}>
    {recorded && <div className="manager-notice" data-tone="live" role="status">
      <WaiterIcon name="circleCheck" />
      <div>
        <strong>{t("recordedForTable", { number: recorded.receipt.tableNumber! })}</strong>
        <p>{t("recordedDetails", {
          amount: formatBirr(recorded.record.receiptAmountSantim),
          method: recorded.record.method.provider ?? t(recorded.record.method.kind),
          difference: signedBirr(recorded.record.differenceSantim),
        })}</p>
        <Link className="workspace-link" href={`${root}?tab=payments#payment-${recorded.receipt.target.visitId}`}>{closing("viewReceipt")}</Link>
      </div>
    </div>}
    {children}
    {receipt && <ReceiptEntry receipt={receipt} refresh={async () => router.refresh()}
      onClose={() => setReceipt(undefined)} onRecorded={record => {
        setRecorded({ receipt, record });
        setReceipt(undefined);
      }} />}
  </OpenReceipt.Provider>;
}

export function ClosingBillControls({ venueId, visitId, ...props }: Omit<ComponentProps<typeof BillControls>, "target" | "refresh" | "onReceipt"> & {
  venueId: string;
  visitId: string;
}) {
  const router = useRouter();
  const open = useContext(OpenReceipt);
  return <BillControls {...props} target={{ venueId, visitId }} refresh={async () => router.refresh()} onReceipt={open} />;
}

export function ClosingTask({ label, title, children, destructive = false }: {
  label: string; title: string; children: ReactNode; destructive?: boolean;
}) {
  const t = useTranslations("Bills");
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`workspace-button${destructive ? " workspace-danger" : ""}`}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>{label}</button>
    {open && <WaiterTask open title={title} busy={false} closeLabel={t("cancel")} onClose={() => setOpen(false)}>
      {children}
    </WaiterTask>}
  </>;
}
