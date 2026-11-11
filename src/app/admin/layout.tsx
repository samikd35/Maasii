import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffFormMessages, StaffHeader } from "@/ui/staff-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: `${t("platformAdmin")} · Maasii` };
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const t = await getTranslations("Staff");
  return (
    <>
      <StaffHeader home="/admin" label={t("platformAdmin")} />
      <StaffFormMessages>
        <main className="mx-auto max-w-2xl px-5 pt-6 pb-16">{children}</main>
      </StaffFormMessages>
    </>
  );
}
