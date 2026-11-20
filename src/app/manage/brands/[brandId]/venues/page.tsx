import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { WaiterIcon } from "@/ui/waiter-icon";
import { addVenue } from "../../../actions";
import { ownerBrand } from "../../../owner-scope";
import { OwnerVenues, ownerVenueStatus } from "../../../owner-venues";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OwnerWorkspace");
  return { title: `${t("venues")} · Maasii` };
}

export default async function BrandVenues({ params }: PageProps<"/manage/brands/[brandId]/venues">) {
  const { brandId } = await params;
  const [actor, brand, t] = await Promise.all([requireStaff(), ownerBrand(brandId), getTranslations("StaffManage")]);
  const venues = await ownerVenueStatus(actor, brand.venues, new Date());
  return <>
    <div className="owner-page-head"><h1>{t("yourVenues")}</h1></div>
    <details id="add-venue" className="owner-add-venue" open={!venues.length || undefined}>
      <summary className="workspace-button manager-disclosure"><WaiterIcon name="plus" />{t("addVenue")}</summary>
      <ActionForm action={addVenue.bind(null, brandId)} className="workspace-panel workspace-actions items-end">
        <Field name="name" label={t("venueName")} required />
        <SubmitButton>{t("addVenue")}</SubmitButton>
      </ActionForm>
    </details>
    <OwnerVenues venues={venues} />
  </>;
}
