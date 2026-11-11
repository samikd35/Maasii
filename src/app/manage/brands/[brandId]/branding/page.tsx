import Link from "next/link";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { brandArtworkMimeTypes, getBranding, MaasiiError, MAX_BRAND_ARTWORK_BYTES } from "@/core";
import { requireStaff } from "@/lib/session";
import { BrandingForm } from "./branding-form";
import { saveBranding } from "./actions";

export default async function BrandingPage({ params }: PageProps<"/manage/brands/[brandId]/branding">) {
  const { brandId } = await params;
  const actor = await requireStaff();
  const brand = await getBranding(actor, { brandId }).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, staff, messages] = await Promise.all([getTranslations("StaffBranding"), getTranslations("Staff"), getMessages()]);
  const { StaffBranding, StaffForms, StaffErrors, GuestMenu, Ordering, Price } = messages;

  return (
    <>
      <Link href="/manage" className="inline-flex min-h-11 items-center text-sm font-medium underline">
        {staff("manage")}
      </Link>
      <p className="mt-2 text-sm text-ink-muted">{brand.name}</p>
      <h1 className="mt-1 font-display text-3xl">{t("heading")}</h1>
      <NextIntlClientProvider messages={{ StaffBranding, StaffForms, StaffErrors, GuestMenu, Ordering, Price }}>
        <BrandingForm
          brand={brand}
          save={saveBranding.bind(null, brand.id)}
          accept={brandArtworkMimeTypes.join(",")}
          maxFileBytes={MAX_BRAND_ARTWORK_BYTES}
        />
      </NextIntlClientProvider>
    </>
  );
}
