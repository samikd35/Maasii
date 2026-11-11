import { notFound } from "next/navigation";
import { getMessages } from "next-intl/server";
import { deriveBrandTheme, getMenuDraft, MaasiiError } from "@/core";
import { messages } from "@/i18n/messages";
import { requireStaff } from "@/lib/session";
import { NextIntlClientProvider } from "next-intl";
import { MenuEditor } from "./menu-editor";

const guestMessages = {
  am: pickGuestMessages(messages.am),
  en: pickGuestMessages(messages.en),
};

function pickGuestMessages({ GuestMenu, LanguageSwitch, Ordering, Price }: typeof messages.en) {
  return { GuestMenu, LanguageSwitch, Ordering, Price };
}

export default async function BrandMenuPage({ params }: PageProps<"/manage/brands/[brandId]/menu">) {
  const { brandId } = await params;
  const actor = await requireStaff();
  const draft = await getMenuDraft(actor, { brandId }).catch((error: unknown) => {
    if (error instanceof MaasiiError) notFound();
    throw error;
  });
  const { MenuEditor: editorMessages, StaffErrors } = await getMessages();

  return (
    <NextIntlClientProvider messages={{ MenuEditor: editorMessages, StaffErrors }}>
      <MenuEditor initialDraft={draft} theme={deriveBrandTheme(draft.brand.colour)} guestMessages={guestMessages} />
    </NextIntlClientProvider>
  );
}
