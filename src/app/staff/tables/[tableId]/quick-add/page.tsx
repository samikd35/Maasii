import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWaiterQuickAdd, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { WaiterHeader } from "../../../waiter-header";
import { QuickAdd } from "./quick-add";

export default async function QuickAddPage({ params, searchParams }: PageProps<"/staff/tables/[tableId]/quick-add">) {
  const { tableId } = await params;
  const { from, number } = await searchParams;
  const query = from === "tables" ? `?from=tables${typeof number === "string" && /^\d{1,9}$/.test(number) ? `&number=${number}` : ""}` : "";
  const returnTo = `/staff/tables/${tableId}${query}`;
  if (!z.uuid().safeParse(tableId).success) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect("/staff");
  const menu = await getWaiterQuickAdd(actor, { tableId, unlockToken: await waiterUnlockToken() }).catch((error) => {
    if (error instanceof MaasiiError) redirect(`/staff?table=${tableId}`);
    throw error;
  });
  const [{ StaffOrders, StaffErrors, Price }, t] = await Promise.all([
    getMessages(), getTranslations("StaffOrders"),
  ]);
  return (
    <>
      <WaiterHeader scope={menu.scope} />
      <main id="workspace-content" tabIndex={-1} className="workspace-frame workspace-waiter">
        <Link href={returnTo} className="workspace-link">
          {t("backTable", { number: menu.table.number })}
        </Link>
        <h1 className="font-sans text-3xl">{t("quickAdd")}</h1>
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Price }}>
          <QuickAdd table={menu.table} dishes={menu.dishes} recent={menu.recent} returnTo={returnTo} />
        </NextIntlClientProvider>
      </main>
    </>
  );
}
