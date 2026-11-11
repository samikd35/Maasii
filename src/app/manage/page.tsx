import Link from "next/link";
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getMyAccess, getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { addVenue } from "./actions";
import { OwnerHome } from "./owner-home";

export default async function ManageHome({ searchParams }: PageProps<"/manage">) {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) redirect("/staff");
  const access = await getMyAccess(actor);
  const t = await getTranslations("StaffManage");
  const staff = await getTranslations("Staff");
  const menu = await getTranslations("MenuEditor");
  const owned = access.brands.flatMap(({ venues }) => venues);
  const { findingVenue } = await searchParams;
  const nothing = access.brands.length === 0 && access.venues.length === 0;

  return (
    <>
      <h1 className="font-display text-3xl">{access.name ? t("greeting", { name: access.name }) : t("yourVenues")}</h1>

      {access.isPlatformAdmin && (
        <Link href="/admin" className="mt-4 inline-flex min-h-11 items-center font-semibold underline">
          {staff("platformAdmin")}
        </Link>
      )}

      {nothing && !access.isPlatformAdmin && (
        <p className="mt-4 text-ink-muted">{t("noAccess")}</p>
      )}

      {owned.length > 0 && <OwnerHome actor={actor} venues={owned} selected={typeof findingVenue === "string" ? findingVenue : undefined} />}

      {access.brands.map((brand) => (
        <section key={brand.id} aria-labelledby={`brand-${brand.id}`} className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink/70 pb-1.5">
            <h2 id={`brand-${brand.id}`} className="text-xl font-semibold">
              {brand.name}
            </h2>
            <span className="text-sm text-ink-muted">{staff("owner")}</span>
          </div>
          <div className="flex flex-wrap gap-x-5">
            <Link href={`/manage/brands/${brand.id}/menu`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
              {menu("nav")}
            </Link>
            <Link href={`/manage/brands/${brand.id}/branding`} className="inline-flex min-h-11 items-center text-sm font-medium underline">
              {t("branding")}
            </Link>
          </div>
          <VenueList venues={brand.venues} />
          <ActionForm action={addVenue.bind(null, brand.id)} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label={t("venueName")} name="name" required className="min-w-0 flex-1" />
            <SubmitButton>{t("addVenue")}</SubmitButton>
          </ActionForm>
        </section>
      ))}

      {access.venues.length > 0 && (
        <section aria-labelledby="managed-venues" className="mt-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink/70 pb-1.5">
            <h2 id="managed-venues" className="text-xl font-semibold">
              {t("managedVenues")}
            </h2>
            <span className="text-sm text-ink-muted">{staff("manager")}</span>
          </div>
          <VenueList venues={access.venues.map((v) => ({ id: v.id, name: v.name, detail: v.brandName }))} />
        </section>
      )}
    </>
  );
}

function VenueList({ venues }: { venues: { id: string; name: string; detail?: string }[] }) {
  const t = useTranslations("StaffManage");
  if (venues.length === 0) return <p className="py-3 text-ink-muted">{t("noVenues")}</p>;
  return (
    <ul>
      {venues.map((venue) => (
        <li key={venue.id} className="border-b border-rule">
          <Link href={`/manage/venues/${venue.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <span>
              <span className="font-semibold">{venue.name}</span>
              {venue.detail && <span className="block text-sm text-ink-muted">{venue.detail}</span>}
            </span>
            <span aria-hidden>›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
