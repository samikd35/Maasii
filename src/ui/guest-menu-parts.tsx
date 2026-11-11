import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { GuestMenuDish } from "@/core/browser";
import { formatBirr, Price } from "./price";

export function GuestMenuHeader({ brand, children }: {
  brand: { name: string; logoUrl: string | null };
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-t-2 border-brand-accent bg-paper px-5 pt-3">
      {brand.logoUrl ? (
        // A plain image keeps the guest page light.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.name} height={48} className="h-12 w-auto max-w-[65%] object-contain object-left" />
      ) : (
        <span className="font-display text-xl font-semibold">{brand.name}</span>
      )}
      {children}
    </header>
  );
}

export function GuestMenuIntro({ label, coverUrl, heading: Heading = "h1" }: {
  label: string;
  coverUrl: string | null;
  heading?: "h1" | "h3";
}) {
  const t = useTranslations("GuestMenu");
  return (
    <div className="px-5 pt-6">
      <p className="text-sm text-ink-muted">{label}</p>
      <Heading className="mt-1 font-display text-4xl leading-tight text-brand-readable">{t("heading")}</Heading>
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" loading="lazy" decoding="async" className="mt-4 aspect-[3/1] w-full rounded-lg bg-paper-deep object-cover" />
      )}
    </div>
  );
}

export function GuestDishRow({ dish, children }: {
  dish: Pick<GuestMenuDish, "id" | "name" | "description" | "fasting" | "priceSantim">;
  children?: ReactNode;
}) {
  const t = useTranslations("Ordering");
  return (
    <li className="relative flex items-start justify-between gap-4 border-b border-rule py-3.5">
      <div className="min-w-0">
        <h3 id={`dish-${dish.id}-name`} className="mr-2 inline text-[1.0625rem] leading-snug font-semibold">{dish.name}</h3>
        {dish.fasting && (
          <span id={`dish-${dish.id}-fasting`} className="inline-block rounded-full border border-brand-readable px-2 text-xs font-medium text-brand-readable">
            {t("fasting")}
          </span>
        )}
        {dish.description && (
          <p id={`dish-${dish.id}-description`} className="mt-0.5 text-sm leading-snug text-ink-muted">{dish.description}</p>
        )}
      </div>
      <Price santim={dish.priceSantim} />
      {children}
    </li>
  );
}

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
          {dishCount ? `${t("yourDraft")} · ${t("dishCount", { count: dishCount })}` : `${t("yourTable")} · ${tableLabel}`}
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
