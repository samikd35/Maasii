"use client";

import { GuestLink } from "@/ui/guest-navigation";
import { draftKey, useDraft } from "./draft-store";

export function GuestContinuation({ token, hasOrders, hasBill, orderLabel, billLabel }: {
  token: string;
  hasOrders: boolean;
  hasBill: boolean;
  orderLabel: string;
  billLabel: string;
}) {
  const draft = useDraft(draftKey(token));
  const menu = `/v/${encodeURIComponent(token)}/menu` as const;
  const shortcut = "inline-flex min-h-11 items-center rounded-md border border-brand-readable px-3 py-1 font-semibold text-brand-readable";
  if (!draft.length && !hasOrders && !hasBill) return null;
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {(draft.length > 0 || hasOrders) &&
        <GuestLink href={`${menu}?view=order`} className={shortcut}>{orderLabel}</GuestLink>}
      {hasBill && <GuestLink href={`${menu}?view=bill`} className={shortcut}>{billLabel}</GuestLink>}
    </div>
  );
}
