import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { GuestMenuDish } from "@/core/browser";
import { ServingPhoto } from "./serving-photo";
import { Price } from "./price";

export function GuestMenuHeader({ brand, children }: {
  brand: { name: string; logoUrl: string | null };
  children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-18 items-center justify-between gap-3 border-t-2 border-brand-accent bg-paper px-5 py-3">
      {brand.logoUrl ? (
        // A plain image keeps the guest page light.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt={brand.name} height={48} className="h-10 min-w-0 w-auto max-w-[55%] object-contain object-left" />
      ) : (
        <span className="min-w-0 flex-1 wrap-anywhere font-display text-xl font-semibold">{brand.name}</span>
      )}
      {children}
    </header>
  );
}

export function GuestDishRow({ dish, labelId = `dish-${dish.id}`, children }: {
  dish: Pick<GuestMenuDish, "id" | "name" | "description" | "fasting" | "priceSantim"> & { photoUrl?: string | null; thumbnailUrl?: string | null };
  labelId?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("Ordering");
  return (
    <li className="dish-row" data-dish-search>
      {dish.photoUrl ? (
        <ServingPhoto src={dish.thumbnailUrl || dish.photoUrl} alt="" width={88} height={104} loading="lazy" decoding="async" />
      ) : <span className="dish-placeholder" aria-hidden>◇</span>}
      <div className="min-w-0 flex-1">
        <h3 id={`${labelId}-name`} className="mr-2 inline text-[1.0625rem] leading-snug font-semibold">{dish.name}</h3>
        {dish.fasting && (
          <span id={`${labelId}-fasting`} className="inline-block rounded-full border border-brand-readable px-2 text-xs font-medium text-brand-readable">
            {t("fasting")}
          </span>
        )}
        {dish.description && (
          <p id={`${labelId}-description`} className="mt-0.5 text-sm leading-snug text-ink-muted">{dish.description}</p>
        )}
      </div>
      <div className="dish-price"><Price santim={dish.priceSantim} />{children && <span id={`${labelId}-choose`} className="dish-action">{t("chooseDish")}</span>}</div>
      {children}
    </li>
  );
}
