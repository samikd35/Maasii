import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWaiterQuickAdd, MaasiiError } from "@/core";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { StaffHeader } from "@/ui/staff-header";
import { QuickAdd } from "./quick-add";

export default async function QuickAddPage({ params }: PageProps<"/staff/tables/[tableId]/quick-add">) {
  const { tableId } = await params;
  if (!z.uuid().safeParse(tableId).success) notFound();
  const actor = await getSessionActor();
  if (!actor) redirect("/staff");
  const menu = await getWaiterQuickAdd(actor, { tableId, unlockToken: await waiterUnlockToken() }).catch((error) => {
    if (error instanceof MaasiiError) redirect(`/staff?table=${tableId}`);
    throw error;
  });
  const [{ StaffOrders, StaffErrors, Price }, t, staff] = await Promise.all([
    getMessages(), getTranslations("StaffOrders"), getTranslations("StaffWaiter"),
  ]);
  return (
    <>
      <StaffHeader home="/staff" label={staff("waiter")} />
      <main className="mx-auto max-w-2xl px-5 py-6">
        <Link href={`/staff/tables/${tableId}`} className="inline-flex min-h-11 items-center font-medium underline">
          {t("table", { number: menu.table.number })}
        </Link>
        <h1 className="font-display text-3xl">{t("quickAdd")}</h1>
        <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, Price }}>
          <QuickAdd {...menu} />
        </NextIntlClientProvider>
      </main>
    </>
  );
}
