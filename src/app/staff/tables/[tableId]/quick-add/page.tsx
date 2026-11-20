import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWaiterQuickAdd, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { WaiterHeader } from "../../../waiter-header";
import { WaiterIcon } from "@/ui/waiter-icon";
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
      <main id="workspace-content" tabIndex={-1} className="workspace-frame workspace-waiter waiter-quick-add">
        <Link href={returnTo} className="workspace-link waiter-back">
          <WaiterIcon name="back" />{t("backTable", { number: menu.table.number })}
        </Link>
        <div className="waiter-view-heading">
          <h1>{t("quickAdd")}</h1>
          <span className="waiter-status" data-tone="selection"><WaiterIcon name="tables" />{t("table", { number: menu.table.number })}</span>
        </div>
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Price }}>
          <QuickAdd table={menu.table} waiterId={menu.waiterId} visitId={menu.visitId} dishes={menu.dishes} recent={menu.recent} returnTo={returnTo} />
        </NextIntlClientProvider>
      </main>
    </>
  );
}
