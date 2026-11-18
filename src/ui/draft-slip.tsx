import { useTranslations } from "next-intl";
import { formatBirr } from "./price";

export const draftSlipClass = "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-brand-readable px-5 py-2.5 text-left text-paper shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function DraftSlipContents({ dishCount, linesNeedingAttention = 0, totalSantim, tableLabel, status }: {
  dishCount: number;
  linesNeedingAttention?: number;
  totalSantim: number;
  tableLabel?: string;
  status?: string;
}) {
  const t = useTranslations("Ordering");
  const price = useTranslations("Price");
  return (
    <>
      <span className="flex flex-col">
        <span className="font-semibold">
          {dishCount ? `${t("yourDraft")} · ${t("dishCount", { count: dishCount })}` : tableLabel ? `${t("yourTable")} · ${tableLabel}` : t("yourTable")}
        </span>
        {linesNeedingAttention > 0 && (
          <span className="text-sm">{t("needAttention", { count: linesNeedingAttention })}</span>
        )}
        {status && <span className="text-sm" aria-live="polite">{status}</span>}
      </span>
      {dishCount > 0 && (
        <span className="font-semibold whitespace-nowrap tabular-nums">{formatBirr(totalSantim)} {price("currency")}</span>
      )}
    </>
  );
}
