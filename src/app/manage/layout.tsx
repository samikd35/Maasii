import type { Metadata } from "next";
import { StaffHeader } from "@/ui/staff-header";

export const metadata: Metadata = { title: "Manage · Maasii" };

export default function ManageLayout({ children }: LayoutProps<"/manage">) {
  return (
    <>
      <StaffHeader home="/manage" label="Manage" />
      <main className="mx-auto max-w-2xl px-5 pt-6 pb-16">{children}</main>
    </>
  );
}
