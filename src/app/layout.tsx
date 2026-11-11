import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maasii",
  description: "Table service for Ethiopian cafés and restaurants",
};

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
