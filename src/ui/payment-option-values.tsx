import { useTranslations } from "next-intl";
import type { PaymentOption } from "@/core";

export function PaymentOptionValues({ option }: { option: PaymentOption | null }) {
  const t = useTranslations("PaymentOptions");
  if (!option) return <p className="text-sm text-ink-muted">{t("noValue")}</p>;
  const fields = [
    [t("kind"), t(option.kind)],
    [t("provider"), option.provider],
    [t("recipientName"), option.recipientName],
    [t("accountOrMerchantCode"), option.accountOrMerchantCode],
    [t("displayOrder"), option.displayOrder],
    [t("status"), t(option.active ? "active" : "inactive")],
  ];
  return (
    <>
      <dl className="mt-2 space-y-1 text-sm">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-all">{value ?? t("noValue")}</dd>
          </div>
        ))}
      </dl>
      {option.qrImage && (
        // The uploaded raster QR is already a bounded data URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.qrImage} alt={t("qrAlt")} width={128} height={128} loading="lazy" className="mt-2 h-auto max-w-full border border-rule" />
      )}
    </>
  );
}
