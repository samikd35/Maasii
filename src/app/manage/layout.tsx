import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffFormMessages } from "@/ui/staff-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: `${t("manage")} · Maasii` };
}

export default function ManageLayout({ children }: LayoutProps<"/manage">) {
  return <StaffFormMessages>{children}</StaffFormMessages>;
}
