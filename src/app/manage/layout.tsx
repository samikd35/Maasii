import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getMyAccess } from "@/core";
import { requireStaff } from "@/lib/session";
import { StaffFormMessages, StaffHeader } from "@/ui/staff-header";
import { WorkspaceNav } from "./workspace-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: `${t("manage")} · Maasii` };
}

export default async function ManageLayout({ children }: LayoutProps<"/manage">) {
  const [access, t, manage] = await Promise.all([
    getMyAccess(await requireStaff()), getTranslations("Staff"), getTranslations("StaffManage"),
  ]);
  const preferred = (await cookies()).get("maasii-owner-brand")?.value;
  const brand = access.brands.find(option => option.id === preferred) ?? access.brands[0];
  const venue = brand?.venues[0];
  return (
    <>
      <StaffHeader home="/manage" label={t(brand ? "owner" : access.venues.length ? "manager" : "manage")} workspace />
      <StaffFormMessages>
        <div className="workspace-frame workspace-management">
          {brand && <WorkspaceNav className="owner-nav" label={manage("ownerOverview")} links={[
            { href: "/manage", label: manage("overviewNav") },
            { href: "/manage#venues", label: manage("yourVenues") },
            { href: `/manage/brands/${brand.id}/menu`, label: manage("brandMenuNav") },
            { href: brand.venues.length === 1 && venue ? `/manage/venues/${venue.id}/insights` : "/manage#weekly-finding", label: manage("insightsNav") },
            { href: `/manage/brands/${brand.id}/branding`, label: manage("brandSettings") },
            ...(venue || access.venues.length ? [{ href: "/manage/operations", label: manage("operations") }] : []),
          ]} />}
          <main id="workspace-content" tabIndex={-1}>{children}</main>
        </div>
      </StaffFormMessages>
    </>
  );
}
