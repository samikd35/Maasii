import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { brandArtworkMimeTypes, getBranding, getBrandSocialLinks, MaasiiError, MAX_BRAND_ARTWORK_BYTES, socialLinkLimits } from "@/core";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";
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
  const { StaffBranding, StaffSocialLinks, StaffForms, StaffErrors, GuestMenu, Ordering, Price, OwnerWorkspace } = messages;

  return (
    <>
      <div className="owner-page-head">
        <h1>{t("brandSettings")}</h1>
        <p>{OwnerWorkspace.appliesToVenues}</p>
      </div>
      <a className="workspace-link owner-settings-links" href="#social-links">{StaffSocialLinks.heading}<WaiterIcon name="down" /></a>
      <NextIntlClientProvider messages={{ StaffBranding, StaffSocialLinks, StaffForms, StaffErrors, GuestMenu, Ordering, Price, OwnerWorkspace }}>
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
