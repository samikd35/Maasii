import { createTranslator, useLocale } from "next-intl";
import type { GuestPaymentOption } from "@/core";
import am from "../../messages/orders.am.json";
import en from "../../messages/orders.en.json";
import { GuestCopyPaymentCode } from "./guest-copy-payment-code";

/** Shared by the public Payment details and the guest's prepared Bill. */
export function GuestPaymentOptions({ options }: { options: GuestPaymentOption[] }) {
  const locale = useLocale();
  const t = createTranslator({ locale, messages: locale === "am" ? am : en });
  const copyLabels = { copyCode: t("copyCode"), copied: t("copied"), copyFailed: t("copyFailed") };
  return (
    <ul role="list" className="mt-3 space-y-3">
      {options.map((option, index) => (
        <li key={index} className="space-y-2 rounded-xl border border-rule bg-white p-4 text-sm">
          <p className="font-semibold">{option.provider ?? t(option.kind)}</p>
          {option.recipientName && <p className="text-ink-muted">{option.recipientName}</p>}
          {option.accountOrMerchantCode && (
            <GuestCopyPaymentCode key={option.accountOrMerchantCode} code={option.accountOrMerchantCode} labels={copyLabels} />
          )}
          {option.qrImage && (
            // Payment Options carry bounded raster images.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={option.qrImage} alt={t("paymentQr")} width={128} height={128} loading="lazy"
              className="h-auto max-w-full bg-white" />
          )}
        </li>
      ))}
    </ul>
  );
}
