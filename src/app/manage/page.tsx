import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getWaiterSession } from "@/core";
import { requireStaff } from "@/lib/session";
import { StaffHeader } from "@/ui/staff-header";
import { managementAccess, ownerBrandCookie } from "./owner-scope";
import { WaiterAccess } from "./waiter-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffManage");
  return { title: `${t("ownerOverview")} · Maasii` };
}

export default async function ManageHome({ searchParams }: PageProps<"/manage">) {
  const actor = await requireStaff();
  if (await getWaiterSession(actor)) return <WaiterAccess workspace="brand" />;
  const [access, query] = await Promise.all([managementAccess(), searchParams]);
  const preferred = typeof query.brand === "string" ? query.brand : (await cookies()).get(ownerBrandCookie)?.value;
  const selected = access.brands.find(option => option.id === preferred);
  if (access.brands.length && typeof query.brand === "string" && !selected) notFound();
  const brand = selected ?? access.brands[0];
  if (brand) {
    const root = `/manage/brands/${brand.id}`;
    redirect(typeof query.findingVenue === "string"
      ? root + "/insights?" + new URLSearchParams({ findingVenue: query.findingVenue })
      : root);
  }
  if (access.venues.length && !access.isPlatformAdmin) redirect("/manage/operations");
  const [t, staff] = await Promise.all([getTranslations("StaffManage"), getTranslations("Staff")]);
  return <>
    <StaffHeader home="/manage" label={staff("manage")} workspace />
    <main id="workspace-content" className="workspace-frame py-4" tabIndex={-1}>
      <h1>{access.name ? t("greeting", { name: access.name }) : t("yourVenues")}</h1>
      {access.isPlatformAdmin && <Link className="workspace-link" href="/admin">{staff("platformAdmin")}</Link>}
      {access.venues.length ? <Link className="workspace-link" href="/manage/operations">{t("operations")}</Link>
        : !access.isPlatformAdmin && <p className="mt-4 text-ink-muted">{t("noAccess")}</p>}
    </main>
  </>;
}
