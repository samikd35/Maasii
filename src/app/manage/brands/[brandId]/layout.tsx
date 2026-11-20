import "../../manager.css";
import "../../owner.css";
import "@/app/staff/waiter.css";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { StaffHeader } from "@/ui/staff-header";
import { BrandIdentity } from "../../brand-identity";
import { ownerNavigation } from "../../owner-navigation";
import { managementAccess, ownerBrand } from "../../owner-scope";
import { WorkspaceNav } from "../../workspace-nav";

export default async function BrandLayout({ children, params }: LayoutProps<"/manage/brands/[brandId]">) {
  const { brandId } = await params;
  const [brand, access, staff, { StaffManage, OwnerWorkspace }, navigation] = await Promise.all([
    ownerBrand(brandId), managementAccess(), getTranslations("Staff"), getMessages(), ownerNavigation(brandId),
  ]);
  const root = `/manage/brands/${brand.id}`;
  return <div className="manager-shell owner-shell">
    <StaffHeader home={root} label={staff("owner")} className="manager-header" workspace
      identity={<NextIntlClientProvider messages={{ StaffManage, OwnerWorkspace }}>
        <BrandIdentity brand={brand} brands={access.brands} managedVenues={access.venues} roleLabel={staff("owner")} />
      </NextIntlClientProvider>}
      accountTools={access.isPlatformAdmin && <Link className="workspace-link" href="/admin">{staff("platformAdmin")}</Link>} />
    <div className="workspace-frame manager-frame owner-frame">
      <WorkspaceNav className="manager-nav owner-nav" {...navigation} />
      <main id="workspace-content" className="manager-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
