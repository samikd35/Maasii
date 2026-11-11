import type { Metadata } from "next";
import { StaffHeader } from "@/ui/staff-header";

export const metadata: Metadata = { title: "Platform admin · Maasii" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <StaffHeader home="/admin" label="Platform admin" />
      <main className="mx-auto max-w-2xl px-5 pt-6 pb-16">{children}</main>
    </>
  );
}
