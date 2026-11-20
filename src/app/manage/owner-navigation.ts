import { getTranslations } from "next-intl/server";
import type { WorkspaceLink } from "./workspace-nav";

export async function ownerNavigation(brandId: string) {
  const [t, owner] = await Promise.all([getTranslations("StaffManage"), getTranslations("OwnerWorkspace")]);
  const root = `/manage/brands/${brandId}`;
  const links: WorkspaceLink[] = [
    { href: root, label: t("overviewNav"), icon: "overview" },
    { href: root + "/venues", label: owner("venues"), icon: "brand" },
    { href: root + "/menu", label: t("brandMenuNav"), icon: "menu" },
    { href: root + "/insights", label: t("insightsNav"), icon: "trend" },
    { href: root + "/branding", label: owner("settingsNav"), icon: "setup" },
  ];
  return { label: t("ownerOverview"), links };
}
