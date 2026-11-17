import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyAccess, getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";

export default async function OperationsHome() {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) redirect("/staff");
  const access = await getMyAccess(actor);
  const venues = [
    ...access.venues.map(({ id, name, brandName }) => ({ id, name, brandName })),
    ...access.brands.flatMap((brand) => brand.venues.map((venue) => ({ ...venue, brandName: brand.name }))),
  ];
  if (!venues.length) notFound();
  const [t, floor, shifts, menu, waiter] = await Promise.all([
    getTranslations("StaffManage"), getTranslations("Floor"), getTranslations("Shifts"),
    getTranslations("VenueMenu"), getTranslations("StaffWaiter"),
  ]);
  const destinations = [
    ["/floor", floor("title")], ["/shifts", shifts("title")],
    ["#tables", t("tables")], ["#waiters", waiter("waiters")], ["/menu", menu("title")],
  ];
  return (
    <>
      {access.brands.length > 0 && (
        <Link href="/manage" className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("ownerOverview")}</Link>
      )}
      <h1 className="font-display text-3xl">{t("operations")}</h1>
      <ul className="mt-5 space-y-4">
        {venues.map((venue) => {
          const href = `/manage/venues/${venue.id}`;
          return (
            <li key={venue.id} className="rounded-md border border-rule p-4">
              <p className="text-sm text-ink-muted">{venue.brandName}</p>
              <h2 className="font-display text-2xl">
                <Link href={href} className="inline-flex min-h-11 items-center underline">{venue.name}</Link>
              </h2>
              <nav aria-label={t("venueOperations", { venue: venue.name })} className="flex flex-wrap gap-x-5">
                {destinations.map(([path, label]) => (
                  <Link key={path} href={href + path} className="inline-flex min-h-11 items-center text-sm font-medium underline">{label}</Link>
                ))}
              </nav>
            </li>
          );
        })}
      </ul>
    </>
  );
}
