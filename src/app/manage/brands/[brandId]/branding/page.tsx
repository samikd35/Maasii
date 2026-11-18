import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { brandArtworkMimeTypes, getBranding, getBrandSocialLinks, MaasiiError, MAX_BRAND_ARTWORK_BYTES, socialLinkLimits } from "@/core";
import { requireStaff } from "@/lib/session";
import { BrandingForm } from "./branding-form";
import { saveBranding, saveSocialLinks } from "./actions";
import { SocialLinksForm } from "./social-links-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("brandSettings")} · Maasii` };
}

export default async function BrandingPage({ params }: PageProps<"/manage/brands/[brandId]/branding">) {
  const { brandId } = await params;
  const actor = await requireStaff();
  const [brand, socialLinks] = await Promise.all([getBranding(actor, { brandId }), getBrandSocialLinks(actor, { brandId })]).catch((error) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [t, messages] = await Promise.all([getTranslations("StaffManage"), getMessages()]);
  const { StaffBranding, StaffSocialLinks, StaffForms, StaffErrors, GuestMenu, Ordering, Price } = messages;

  return (
    <>
      <p className="text-sm text-ink-muted">{brand.name}</p>
      <h1 className="mt-1">{t("brandSettings")}</h1>
      <NextIntlClientProvider messages={{ StaffBranding, StaffSocialLinks, StaffForms, StaffErrors, GuestMenu, Ordering, Price }}>
        <BrandingForm
          brand={brand}
          save={saveBranding.bind(null, brand.id)}
          accept={brandArtworkMimeTypes.join(",")}
          maxFileBytes={MAX_BRAND_ARTWORK_BYTES}
        />
        <SocialLinksForm links={socialLinks} limits={socialLinkLimits} save={saveSocialLinks.bind(null, brand.id)} />
      </NextIntlClientProvider>
    </>
  );
}
