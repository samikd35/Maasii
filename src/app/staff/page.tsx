import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getWaiterSession } from "@/core";
import { orderPushConfig } from "@/lib/order-push-config";
import { getSessionActor, waiterUnlockToken } from "@/lib/session";
import { Field, PinField } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry } from "@/ui/staff-header";
import { signIn, unlock } from "./actions";
import { MyTables } from "./my-tables";
import { MenuReference } from "./menu-reference";
import { Notifications } from "./notifications";
import { WaiterHeader } from "./waiter-header";
import { WaiterFeed } from "./waiter-feed";
import { WaiterNav } from "./waiter-nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffWaiter");
  return { title: `${t("waiter")} · Maasii`, robots: { index: false } };
}

export default async function WaiterPage({ searchParams }: PageProps<"/staff">) {
  const params = await searchParams;
  const showMenu = params.view === "menu";
  const showTables = params.view === "tables";
  const current = showMenu ? "menu" : showTables ? "tables" : "queue";
  const number = typeof params.number === "string" && /^\d{1,9}$/.test(params.number) ? params.number : "";
  const table = z.uuid().safeParse(params.table);
  const actor = await getSessionActor();
  const device = actor && await getWaiterSession(actor, { unlockToken: await waiterUnlockToken(), includeMenu: showMenu });
  const t = await getTranslations("StaffWaiter");

  if (device?.status === "locked") {
    return (
      <StaffEntry waiter>
        <h1 className="font-sans text-3xl">{t("unlockHeading")}</h1>
        <ActionForm action={unlock} className="waiter-entry-form mt-6 space-y-4">
          {table.success && <input name="tableId" type="hidden" value={table.data} />}
          <PinField label={t("pin")} legacy />
          <SubmitButton>{t("unlock")}</SubmitButton>
        </ActionForm>
      </StaffEntry>
    );
  }

  if (device?.status !== "unlocked") {
    const errors = await getTranslations("StaffErrors");
    return (
      <StaffEntry waiter>
        <h1 className="font-sans text-3xl">{t("rejoinHeading")}</h1>
        <ActionForm action={signIn} className="waiter-entry-form mt-6 space-y-4">
          {table.success && <input name="tableId" type="hidden" value={table.data} />}
          <Field label={t("phone")} name="phone" type="tel" autoComplete="username" maxLength={40} required />
          <PinField label={t("pin")} />
          <SubmitButton>{t("signIn")}</SubmitButton>
        </ActionForm>
        <p className="mt-5 text-sm">{t("signInHelp")}</p>
        <p className="mt-1 text-sm" role={device?.status === "rejoin" ? "alert" : undefined}>{errors("waiterRejoin")}</p>
      </StaffEntry>
    );
  }

  if (table.success) redirect(`/staff/tables/${table.data}`);

  const [locale, { StaffOrders, StaffErrors, StaffWaiter, Bills, Price }] = await Promise.all([getLocale(), getMessages()]);

  const push = orderPushConfig();
  const vapidKey = push?.waiterIds && !push.waiterIds.includes(device.waiterId) ? undefined : push?.publicKey;

  return (
    <NextIntlClientProvider messages={{ StaffOrders, StaffErrors, StaffWaiter, Bills, Price }}>
    <WaiterFeed key={device.waiterId}>
      <WaiterHeader scope={`${device.venue.name} · ${device.name}`} accountTools={
        <Notifications vapidKey={vapidKey} subscribed={device.hasPush} />
      } />
      <main id="workspace-content" tabIndex={-1} className="workspace-frame workspace-waiter waiter-home">
        {showMenu ? <MenuReference sections={device.menu} locale={locale} /> : <MyTables tables={showTables} key={current} number={number} />}
      </main>
      <WaiterNav current={current} />
    </WaiterFeed>
    </NextIntlClientProvider>
  );
}
