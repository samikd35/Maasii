import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getMyTableOrders, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { MyTables } from "../../my-tables";
import { WaiterHeader } from "../../waiter-header";
import { WaiterIcon } from "@/ui/waiter-icon";
import { WaiterFeed } from "../../waiter-feed";

export default async function TablePage({ params, searchParams }: PageProps<"/staff/tables/[tableId]">) {
  const { tableId } = await params;
  const { from, number } = await searchParams;
  const query = from === "tables" && typeof number === "string" && /^\d{1,9}$/.test(number) ? `&number=${number}` : "";
  if (!z.uuid().safeParse(tableId).success) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect("/staff");
  const table = await getMyTableOrders(actor, { tableId, unlockToken: await waiterUnlockToken() }).catch((error) => {
    if (error instanceof MaasiiError) {
      if (error.code === "not_allowed") redirect(`/staff?table=${tableId}`);
      notFound();
    }
    throw error;
  });
  if (table.tableNumber === undefined) notFound();
  const [{ StaffOrders, StaffErrors, Bills, Price }, t] = await Promise.all([getMessages(), getTranslations("StaffWaiter")]);
  return (
    <>
      <WaiterHeader scope={table.scope} />
      <main id="workspace-content" tabIndex={-1} className="workspace-frame workspace-waiter">
        <Link href={`/staff${from === "tables" ? `?view=tables${query}` : ""}#table-link-${tableId}`} className="workspace-link waiter-back">
          <WaiterIcon name="back" />{t(from === "tables" ? "backTables" : "backQueue")}
        </Link>
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Bills, Price }}>
          <WaiterFeed><MyTables tableId={tableId} tableNumber={table.tableNumber} tableQuery={from === "tables" ? `?from=tables${query}` : ""} /></WaiterFeed>
        </NextIntlClientProvider>
      </main>
    </>
  );
}
