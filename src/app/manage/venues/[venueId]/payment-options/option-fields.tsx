"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { PaymentOption, PaymentOptionKind } from "@/core";
import { Field } from "@/ui/field";

export function OptionFields({
  option,
  kinds,
  defaultOrder,
  qrAccept,
  maxQrBytes,
}: {
  option?: Omit<PaymentOption, "qrImage"> & { qrImage: boolean };
  kinds: readonly PaymentOptionKind[];
  defaultOrder: number;
  qrAccept: string;
  maxQrBytes: number;
}) {
  const t = useTranslations("PaymentOptions");
  const errors = useTranslations("StaffErrors");
  const orderHelp = useId();
  const [kind, setKind] = useState<PaymentOptionKind>(option?.kind ?? "bank_transfer");
  const [code, setCode] = useState(option?.accountOrMerchantCode ?? "");
  const needsDestination = kind !== "cash";
  const previous = option?.accountOrMerchantCode ?? "";
  const next = code.trim();

  return (
    <>
      <label className="block text-sm font-medium">
        {t("kind")}
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as PaymentOptionKind)}
          className="mt-1 min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base font-normal"
        >
          {kinds.map((value) => <option key={value} value={value}>{t(value)}</option>)}
        </select>
      </label>
      <Field label={t("provider")} name="provider" maxLength={120} defaultValue={option?.provider ?? ""} required={needsDestination} />
      <Field label={t("recipientName")} name="recipientName" maxLength={160} defaultValue={option?.recipientName ?? ""} required={needsDestination} />
      <Field
        label={t("accountOrMerchantCode")}
        name="accountOrMerchantCode"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        maxLength={100}
        required={needsDestination}
        autoComplete="off"
        spellCheck={false}
      />
      {option && next !== previous && (
        <fieldset className="min-w-0 space-y-2 rounded-md border border-rule px-3 pb-2">
          <legend className="px-1 text-sm font-semibold">{t("confirmAccount")}</legend>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="min-w-0">
              <dt className="text-ink-muted">{t("previous")}</dt>
              <dd className="font-semibold break-all">{previous || t("noValue")}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ink-muted">{t("new")}</dt>
              <dd className="font-semibold break-all">{next || t("noValue")}</dd>
            </div>
          </dl>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
            <input key={next} name="confirmAccountCode" type="checkbox" value={next} required className="size-5" />
            {t("confirm")}
          </label>
        </fieldset>
      )}
      <Field
        label={t("qrImage")}
        name="qrImage"
        type="file"
        accept={qrAccept}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          const invalid = file && (file.size > maxQrBytes || !qrAccept.split(",").includes(file.type));
          input.setCustomValidity(invalid ? errors("invalidPaymentQr") : "");
          if (invalid) input.reportValidity();
        }}
      />
      {option?.qrImage && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
          <input name="removeQr" type="checkbox" className="size-5" />
          {t("removeQr")}
        </label>
      )}
      <Field
        label={t("displayOrder")}
        name="displayOrder"
        type="number"
        inputMode="numeric"
        min={1}
        max={2_147_483_647}
        defaultValue={option?.displayOrder ?? defaultOrder}
        aria-describedby={orderHelp}
        required
      />
      <p id={orderHelp} className="text-sm text-ink-muted">{t("displayOrderHelp")}</p>
    </>
  );
}
