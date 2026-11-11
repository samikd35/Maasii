import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getWaiterJoinCode, publicActor } from "@/core";
import { Field, PinField } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry } from "@/ui/staff-header";
import { join } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffWaiter");
  return { title: `${t("joinTitle")} · Maasii`, referrer: "no-referrer", robots: { index: false } };
}

export default async function JoinWaiterPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const code = await getWaiterJoinCode(publicActor, { token });
  const t = await getTranslations("StaffWaiter");

  if (code?.status !== "pending") {
    const errors = await getTranslations("StaffErrors");
    const reason = code?.status === "used" ? "waiterJoinUsed" : code ? "waiterJoinExpired" : "waiterJoinInvalid";
    return (
      <StaffEntry>
        <h1 className="font-display text-3xl">{t("joinTitle")}</h1>
        <p className="mt-3" role="alert">{errors(reason)}</p>
      </StaffEntry>
    );
  }

  const staff = await getTranslations("Staff");
  return (
    <StaffEntry>
      <h1 className="font-display text-3xl">{t("joinVenue", { venue: code.venueName })}</h1>
      {code.waiterName && <p className="mt-3">{t("joinAgain", { name: code.waiterName })}</p>}
      <ActionForm action={join.bind(null, token)} className="mt-6 space-y-4">
        {!code.waiterName && <Field name="name" label={staff("name")} autoComplete="name" maxLength={80} required />}
        <PinField label={t("choosePin")} />
        <SubmitButton>{t("join")}</SubmitButton>
      </ActionForm>
    </StaffEntry>
  );
}
