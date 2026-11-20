import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StaffHeader, StaffNotFound } from "@/ui/staff-header";

export default async function ManageNotFound() {
  const t = await getTranslations("Staff");
  return <>
    <StaffHeader home="/manage" label={t("manage")} workspace />
    <main id="workspace-content" tabIndex={-1} className="workspace-frame py-4">
      <StaffNotFound />
      <Link href="/manage" className="workspace-link mt-3">{t("manage")}</Link>
    </main>
  </>;
}
