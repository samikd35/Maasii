import { useTranslations } from "next-intl";

const birr = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

/** A price in santim as a figure in birr, such as "240" or "12.5". */
export function formatBirr(santim: number): string {
  return birr.format(santim / 100);
}

/** An ETB price, set as an indivisible figure and adjacent currency. */
export function Price({ santim }: { santim: number }) {
  const t = useTranslations("Price");
  return (
    <data value={santim / 100} data-testid="price" className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap leading-none">
      <span className="text-base font-semibold tabular-nums">{formatBirr(santim)}</span>{" "}
      <span className="text-xs font-medium tracking-wide text-ink-muted">{t("currency")}</span>
    </data>
  );
}

export function parseBirr(input: string): number | null {
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(input)) return null;
  const [birr, fraction = ""] = input.split(".");
  const santim = Number(birr + fraction.padEnd(2, "0"));
  return Number.isSafeInteger(santim) ? santim : null;
}
