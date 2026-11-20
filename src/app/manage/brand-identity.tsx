"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MyAccess } from "@/core";
import { WaiterIcon } from "@/ui/waiter-icon";
import { switchOwnerBrand } from "./actions";

type Brand = Pick<MyAccess["brands"][number], "id" | "name">;

export function BrandIdentity({ brand, brands, managedVenues, roleLabel }: {
  brand: Brand; brands: Brand[]; managedVenues: MyAccess["venues"]; roleLabel: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("StaffManage");
  const owner = useTranslations("OwnerWorkspace");
  const root = `/manage/brands/${brand.id}`;
  const settings = pathname === root + "/branding";
  return <details className="manager-identity" key={brand.id} name="venue-header-actions">
    <summary className="manager-identity-trigger">
      <span className="manager-identity-icon"><WaiterIcon name="brand" /></span>
      <span><strong>{brand.name}</strong><small>{roleLabel}</small></span>
      <WaiterIcon name="down" />
    </summary>
    <div className="manager-venue-panel">
      {brands.length > 1 && <form action={switchOwnerBrand}>
        <p className="manager-menu-label">{owner("yourBrands")}</p>
        <input type="hidden" name="section" value={pathname.slice(root.length)} />
        {brands.map(option => <button type="submit" key={option.id} name="brandId" value={option.id}
          disabled={option.id === brand.id} className="manager-venue-option">
          <span>{option.name}</span>{option.id === brand.id && <WaiterIcon name="check" />}
        </button>)}
      </form>}
      <Link href={root + "/branding"} className="manager-venue-option" aria-current={settings ? "page" : undefined}
        onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}>
        <span>{t("brandSettings")}</span><WaiterIcon name="next" />
      </Link>
      {managedVenues.length > 0 && <>
        <p className="manager-menu-label">{t("managedVenues")}</p>
        {managedVenues.map(venue => <Link key={venue.id} href={`/manage/venues/${venue.id}/floor`} className="manager-venue-option">
          <span>{venue.name}<small>{venue.brandName}</small></span><WaiterIcon name="next" />
        </Link>)}
      </>}
    </div>
  </details>;
}
