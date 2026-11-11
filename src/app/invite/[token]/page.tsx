import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getInvitation, publicActor } from "@/core";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { StaffEntry } from "@/ui/staff-header";
import { accept } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("StaffInvitation");
  return { title: `${t("title")} · Maasii` };
}

const unusable = {
  accepted: "invitationAccepted",
  expired: "invitationExpired",
  revoked: "invitationRevoked",
} as const;

export default async function InvitationPage({ params }: PageProps<"/invite/[token]">) {
  await connection();
  const { token } = await params;
  const invitation = await getInvitation(publicActor, { token });
  const t = await getTranslations("StaffInvitation");

  if (invitation?.status !== "pending") {
    const errors = await getTranslations("StaffErrors");
    const staff = await getTranslations("Staff");
    const reason = invitation?.status;
    return (
      <StaffEntry>
        <h1 className="font-display text-3xl">{t("heading")}</h1>
        <p className="mt-3">{errors(reason ? unusable[reason] : "invitationNotFound")}</p>
        <Link href="/sign-in" className="mt-6 inline-flex min-h-11 items-center font-semibold underline">
          {staff("goToSignIn")}
        </Link>
      </StaffEntry>
    );
  }

  const place = invitation.venue ? `${invitation.brand.name} · ${invitation.venue.name}` : invitation.brand.name;
  return (
    <StaffEntry>
      <p className="text-sm text-ink-muted">Maasii</p>
      <h1 className="mt-1 font-display text-3xl">{t("join", { place })}</h1>
      <p className="mt-3">
        {t.rich(invitation.role === "owner" ? "ownerIntro" : "managerIntro", {
          name: invitation.name,
          place,
          address: invitation.contact,
          contact: (text) => <strong className="break-all">{text}</strong>,
        })}
      </p>
      <ActionForm action={accept.bind(null, token)} className="mt-8 space-y-4">
        <Field
          label={t("choosePassword")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-sm text-ink-muted">{t("passwordHelp")}</p>
        <SubmitButton>{t("accept")}</SubmitButton>
      </ActionForm>
    </StaffEntry>
  );
}
