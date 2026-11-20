import { useTranslations } from "next-intl";
import type { PaymentOption } from "@/core";

export function PaymentOptionValues({ option, compact = false, showQrState = false }: {
  option: Omit<PaymentOption, "id" | "venueId" | "revision"> | null; compact?: boolean; showQrState?: boolean;
}) {
  const t = useTranslations("PaymentOptions");
  if (!option) return <p className="text-sm text-ink-muted">{t("noValue")}</p>;
  const fields: [string, string | number | null][] = [
    [t("kind"), compact && !option.provider ? null : t(option.kind)],
    [t("recipientName"), option.recipientName],
    [t("accountOrMerchantCode"), option.accountOrMerchantCode],
  ];
  if (!compact) {
    fields.splice(1, 0, [t("provider"), option.provider]);
    fields.push([t("displayOrder"), option.displayOrder], [t("status"), t(option.active ? "active" : "inactive")]);
  }
  const shown = compact ? fields.filter(([, value]) => value) : fields;
  const qr = option.qrImage &&
    // The uploaded raster QR is already a bounded data URL.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={option.qrImage} alt={t("qrAlt")} width={128} height={128} loading="lazy" className="mt-2 h-auto max-w-full border border-rule" />;
  return (
    <>
      {shown.length > 0 && <dl className={compact ? "manager-payment-method" : "mt-2 space-y-1 text-sm"}>
        {shown.map(([label, value]) => (
          <div key={label}>
            <dt className="text-ink-muted">{label}</dt>
            <dd className="wrap-anywhere">{value ?? t("noValue")}</dd>
          </div>
        ))}
      </dl>}
      {qr ? (compact ? <details><summary className="workspace-summary">{t("showQr")}</summary>{qr}</details> : qr)
        : showQrState && <p className="text-sm text-ink-muted mt-1">{t("noQr")}</p>}
    </>
  );
}
