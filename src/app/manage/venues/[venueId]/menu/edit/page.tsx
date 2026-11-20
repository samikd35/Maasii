import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { brandArtworkMimeTypes, deriveBrandTheme, getVenueMenuDraft, MaasiiError, MAX_BRAND_ARTWORK_BYTES } from "@/core";
import { messages } from "@/i18n/messages";
import { requireStaff } from "@/lib/session";
import { WaiterIcon } from "@/ui/waiter-icon";
import { MenuEditor } from "../../../../brands/[brandId]/menu/menu-editor";
import { persistVenueMenu, prepareVenueDishPhoto, prepareVenueDishVideo } from "./actions";

function guestMessages({ GuestMenu, LanguageSwitch, Ordering, Price }: typeof messages.en) {
  return { GuestMenu, LanguageSwitch, Ordering, Price };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("VenueMenu");
  return { title: `${t("editMenu")} · Maasii` };
}

export default async function EditVenueMenu({ params }: PageProps<"/manage/venues/[venueId]/menu/edit">) {
  const { venueId } = await params;
  const actor = await requireStaff();
  if (actor.kind !== "staff") notFound();
  const { draft, inherited, missing, published } = await getVenueMenuDraft(actor, { venueId }).catch((error: unknown) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const [{ MenuEditor: editorMessages, StaffErrors, Price }, t] = await Promise.all([getMessages(), getTranslations("MenuEditor")]);
  return (
    <>
      <Link href={"/manage/venues/" + venueId + "/menu"} className="workspace-link manager-back">
        <WaiterIcon name="back" />{t("liveAvailability")}
      </Link>
      <NextIntlClientProvider messages={{ MenuEditor: editorMessages, StaffErrors, Price }}>
        <MenuEditor initialDraft={draft} recoveryKey={`maasii:editor:${actor.userId}:${venueId}`} theme={deriveBrandTheme(draft.brand.colour)}
          guestMessages={{ am: guestMessages(messages.am), en: guestMessages(messages.en) }}
          maxImportPhotos={0} artwork={{ accept: brandArtworkMimeTypes.join(","), maxFileBytes: MAX_BRAND_ARTWORK_BYTES }}
          venue={{ uploadVideo: prepareVenueDishVideo.bind(null, venueId), inherited, missing, published, persist: persistVenueMenu.bind(null, venueId), upload: prepareVenueDishPhoto.bind(null, venueId) }} />
      </NextIntlClientProvider>
    </>
  );
}
