import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ethiopic } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: "Maasii", description: t("description") };
}

export const viewport: Viewport = {
  themeColor: "#fbf7f0",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={await getLocale()} className={ethiopic.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
