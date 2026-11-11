import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getWaiterSession } from "@/core";
import { getSessionActor } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry } from "@/ui/staff-header";
import { signIn } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Staff");
  return { title: `${t("signIn")} · Maasii` };
}

export default async function SignInPage() {
  const actor = await getSessionActor();
  if (actor) redirect(await getWaiterSession(actor) ? "/staff" : "/manage");
  const t = await getTranslations("StaffSignIn");
  const staff = await getTranslations("Staff");

  return (
    <StaffEntry>
      <h1 className="font-display text-3xl">{t("heading")}</h1>
      <p className="mt-2 text-ink-muted">{t("intro")}</p>
      <ActionForm action={signIn} className="mt-8 space-y-4">
        <Field label={staff("emailOrPhone")} name="contact" autoComplete="username" required />
        <Field label={staff("password")} name="password" type="password" autoComplete="current-password" required />
        <SubmitButton>{staff("signIn")}</SubmitButton>
      </ActionForm>
    </StaffEntry>
  );
}
