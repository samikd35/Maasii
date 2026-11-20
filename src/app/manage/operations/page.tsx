import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLiveFloor, getMyAccess, getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";
import { VenueFloor, VenueNavigation } from "../venue-navigation";
import { WaiterAccess } from "../waiter-access";

const venueCookie = "maasii-operation-venue";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("operations")} · Maasii` };
}

export default async function OperationsHome({ searchParams }: PageProps<"/manage/operations">) {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) return <WaiterAccess workspace="venue" />;
  const access = await getMyAccess(actor);
  const venues = [...new Map([
    ...access.venues.map(venue => [venue.id, venue] as const),
    ...access.brands.flatMap(brand => brand.venues.map(venue => [venue.id, { ...venue, brandName: brand.name }] as const)),
  ]).values()];
  if (!venues.length) notFound();
  const query = await searchParams;
  const preferred = typeof query.venue === "string" ? query.venue : (await cookies()).get(venueCookie)?.value;
  const venue = venues.find(({ id }) => id === preferred) ?? venues[0];
  const [t, floor] = await Promise.all([
    getTranslations("StaffManage"), getLiveFloor(actor, { venueId: venue.id }),
  ]);

  async function selectVenue(form: FormData) {
    "use server";
    const id = String(form.get("venue") ?? "");
    const access = await getMyAccess(await requireStaff());
    if (access.venues.some(venue => venue.id === id) || access.brands.some(brand => brand.venues.some(venue => venue.id === id))) {
      (await cookies()).set(venueCookie, id, { path: "/manage", sameSite: "lax", httpOnly: true });
      redirect(`/manage/operations?venue=${id}`);
    }
  }

  return <>
    <div className="workspace-title">
      <div>
        <p className="text-sm text-ink-muted">{venue.brandName}</p>
        <h1>{t("operations")}</h1>
        <Link href={`/manage/venues/${venue.id}`} className="workspace-link">{venue.name}</Link>
      </div>
      {venues.length > 1 && <form action={selectVenue} className="workspace-actions items-end">
        <label className="text-sm font-medium">{t("selectVenue")}
          <select name="venue" key={venue.id} defaultValue={venue.id} className="workspace-input">
            {venues.map(option => <option key={option.id} value={option.id}>{option.name} · {option.brandName}</option>)}
          </select>
        </label>
        <button className="workspace-button" type="submit">{t("switchVenue")}</button>
      </form>}
    </div>
    <VenueNavigation venueId={venue.id} name={venue.name} />
    <VenueFloor venueId={venue.id} floor={floor} />
  </>;
}
