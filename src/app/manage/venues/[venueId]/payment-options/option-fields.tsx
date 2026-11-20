"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import type { PaymentOption, PaymentOptionKind } from "@/core";
import type { FormState } from "@/lib/session";
import { Field } from "@/ui/field";
import { PaymentOptionValues } from "@/ui/payment-option-values";
import { ConfirmationDialog } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { changeActive, savePaymentOption } from "./actions";

type Snapshot = Omit<PaymentOption, "id" | "venueId" | "revision">;
type Review = { data: FormData; after: Snapshot; previewUrl?: string };

export function OptionForm({ venueId, venueName, option, kinds, defaultOrder, qrAccept, maxQrBytes, reviewFields, activate = false }: {
  venueId: string;
  venueName: string;
  option?: PaymentOption;
  kinds: readonly PaymentOptionKind[];
  defaultOrder: number;
  qrAccept: string;
  maxQrBytes: number;
  reviewFields: readonly (keyof Snapshot)[];
  activate?: boolean;
}) {
  const t = useTranslations("PaymentOptions");
  const staff = useTranslations("StaffForms");
  const errors = useTranslations("StaffErrors");
  const router = useRouter();
  const [selection, setSelection] = useState<{ kind: PaymentOptionKind; revision?: string }>();
  const kind = selection && selection.revision === option?.revision ? selection.kind : option?.kind ?? "bank_transfer";
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<FormState>();
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const orderHelp = useId();
  const target = option ? { paymentOptionId: option.id, revision: option.revision } : null;
  const previewUrl = review?.previewUrl;
  const changes = option && review ? reviewFields.filter(field => option[field] !== review.after[field])
    .map(field => t(field === "active" ? "status" : field === "qrImage" ? "qrLabel" : field)) : [];
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function reviewChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setResult(undefined);
    const data = new FormData(event.currentTarget);
    const file = data.get("qrImage");
    const previewUrl = file instanceof File && file.size > 0 ? URL.createObjectURL(file) : undefined;
    const after = activate && option ? { ...option, active: true } : {
      kind,
      provider: String(data.get("provider") ?? "").trim() || null,
      recipientName: String(data.get("recipientName") ?? "").trim() || null,
      accountOrMerchantCode: String(data.get("accountOrMerchantCode") ?? "").trim() || null,
      displayOrder: Number(data.get("displayOrder")),
      active: option?.active ?? true,
      qrImage: previewUrl ?? (data.get("removeQr") === "on" ? null : option?.qrImage ?? null),
    };
    setReview({ data, after, previewUrl });
    dialog.current?.showModal();
  }

  function save() {
    if (!review || pending) return;
    const { data } = review;
    dialog.current?.close();
    startTransition(async () => {
      try {
        const state = activate && target
          ? await changeActive({ ...target, venueId }, true, true)
          : await savePaymentOption(venueId, target, true, data);
        setResult(state);
      } catch {
        setResult({ error: "paymentSaveInterrupted" });
      }
    });
  }

  return <>
    <form method="post" onSubmit={reviewChanges} className={activate ? "" : "payment-option-edit"}>
      <fieldset key={option?.revision} disabled={pending} className={activate ? "" : "space-y-3"}>
        {!activate && <>
          <label className="block text-sm font-medium">
            {t("kind")}
            <select name="kind" value={kind} className="workspace-input mt-1" onChange={event => setSelection({
              revision: option?.revision, kind: event.target.value as PaymentOptionKind,
            })}>
              {kinds.map(value => <option key={value} value={value}>{t(value)}</option>)}
            </select>
          </label>
          <Field label={t("provider")} name="provider" maxLength={120} defaultValue={option?.provider ?? ""} required={kind !== "cash"} />
          <Field label={t("recipientName")} name="recipientName" maxLength={160} defaultValue={option?.recipientName ?? ""} required={kind !== "cash"} />
          <Field label={t("accountOrMerchantCode")} name="accountOrMerchantCode" maxLength={100}
            defaultValue={option?.accountOrMerchantCode ?? ""} required={kind !== "cash"} autoComplete="off" spellCheck={false} />
          <Field label={t("qrImage")} name="qrImage" type="file" accept={qrAccept} onChange={event => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            const invalid = file && (file.size > maxQrBytes || !qrAccept.split(",").includes(file.type));
            input.setCustomValidity(invalid ? errors("invalidPaymentQr") : "");
            if (invalid) input.reportValidity();
          }} />
          {option?.qrImage && <label className="flex min-h-11 items-center gap-2 text-sm">
            <input name="removeQr" type="checkbox" />{t("removeQr")}
          </label>}
          <Field label={t("displayOrder")} name="displayOrder" type="number" inputMode="numeric" min={1} max={2_147_483_647}
            defaultValue={option?.displayOrder ?? defaultOrder} aria-describedby={orderHelp} required />
          <p id={orderHelp} className="manager-muted">{t("displayOrderHelp")}</p>
        </>}
        <button type="submit" className={`workspace-button${activate ? "" : " workspace-primary"}`} aria-haspopup="dialog" aria-busy={pending}>
          <WaiterIcon name={activate ? "check" : "receipt"} />{t(pending ? "saving" : activate ? "reactivate" : "review")}
        </button>
      </fieldset>
      {result?.done && <p role="status" className="manager-notice" data-tone="live">{staff(result.done.key, result.done.values)}</p>}
      {result?.error && <div className="manager-notice" data-tone="urgent">
        <div>
          <p role="alert">{errors(result.error)}</p>
          {(result.error === "paymentOptionChanged" || result.error === "paymentSaveInterrupted") &&
            <button type="button" className="workspace-button mt-2" onClick={() => { router.refresh(); setResult(undefined); }}>{t("refreshOptions")}</button>}
        </div>
      </div>}
    </form>
    <ConfirmationDialog dialog={dialog} title={t("reviewTitle")} scrollable confirmLabel={
      t(activate ? "reactivate" : !option ? "add" : "save")
    } cancel={staff("cancel")} onConfirm={save} onClose={() => setReview(null)}>
      {review && <>
        <p className="mb-3 font-semibold">{t(review.after.active ? "reviewVisible" : "reviewInactive", { venue: venueName })}</p>
        {changes.length > 0 && <p className="manager-notice" data-tone="waiting">{t("reviewChanged", { fields: changes.join(" · ") })}</p>}
        <div className="payment-review-grid">
          {option && <section><h3>{t("before")}</h3><PaymentOptionValues option={option} showQrState /></section>}
          <section className="payment-proposed"><h3>{t("after")}</h3><PaymentOptionValues option={review.after} showQrState /></section>
        </div>
      </>}
    </ConfirmationDialog>
  </>;
}
