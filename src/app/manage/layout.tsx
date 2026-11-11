import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffFormMessages, StaffHeader } from "@/ui/staff-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: `${t("manage")} · Maasii` };
}

export default async function ManageLayout({ children }: LayoutProps<"/manage">) {
  const t = await getTranslations("Staff");
  return (
    <>
      <StaffHeader home="/manage" label={t("manage")} />
      <StaffFormMessages>
        <main className="mx-auto max-w-2xl px-5 pt-6 pb-16 has-[#brand-menu-editor]:max-w-7xl has-[[data-live-floor]]:max-w-7xl">{children}</main>
      </StaffFormMessages>
    </>
  );
}
