import type { Metadata } from "next";
import { StaffAudio } from "./order-chime";

export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  icons: { apple: "/staff/icon-192.png" },
};

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return <><StaffAudio />{children}</>;
}
