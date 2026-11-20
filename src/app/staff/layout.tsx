import "../staff.css";
import "./waiter.css";
import type { Metadata, Viewport } from "next";
import { StaffAudio } from "./order-chime";

export const metadata: Metadata = {
  manifest: "/staff/manifest.webmanifest",
  icons: { apple: "/staff/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#233bab",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return <><StaffAudio />{children}</>;
}
