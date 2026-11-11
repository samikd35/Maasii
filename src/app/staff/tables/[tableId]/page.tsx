import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getMyTableOrders, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { StaffHeader } from "@/ui/staff-header";
import { MyTables } from "../../my-tables";

export default async function TablePage({ params }: PageProps<"/staff/tables/[tableId]">) {
  const { tableId } = await params;
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
  const [{ StaffOrders, StaffErrors, Bills }, t] = await Promise.all([getMessages(), getTranslations("StaffWaiter")]);
  return (
    <>
      <StaffHeader home="/staff" label={t("waiter")} />
      <main className="mx-auto max-w-2xl px-5 pb-16">
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Bills }}>
          <MyTables tableId={tableId} tableNumber={table.tableNumber} />
        </NextIntlClientProvider>
      </main>
    </>
  );
}
