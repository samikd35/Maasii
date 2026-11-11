import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getInvitation, publicActor, type Invitation } from "@/core";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { accept } from "./actions";

export const metadata: Metadata = { title: "Your invitation · Maasii" };

const roleNames = { owner: "Owner", manager: "Manager" } as const;

const unusable: Record<Exclude<Invitation["status"], "pending">, string> = {
  accepted: "This invitation has already been used.",
  expired: "This invitation has expired. Ask for a new one.",
  revoked: "This invitation was replaced by a newer one. Use the latest link you were sent.",
};

export default async function InvitationPage({ params }: PageProps<"/invite/[token]">) {
  await connection();
  const { token } = await params;
  const invitation = await getInvitation(publicActor, { token });

  const refusal = !invitation
    ? "This invitation link is not valid."
    : invitation.status === "pending"
      ? null
      : unusable[invitation.status];
  if (!invitation || refusal) {
    return (
      <main className="mx-auto max-w-sm px-5 py-12">
        <h1 className="font-display text-3xl">Invitation</h1>
        <p className="mt-3">{refusal}</p>
        <Link href="/sign-in" className="mt-6 inline-flex min-h-11 items-center font-semibold underline">
          Go to sign in
        </Link>
      </main>
    );
  }

  const place = invitation.venue ? `${invitation.brand.name} · ${invitation.venue.name}` : invitation.brand.name;
  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <p className="text-sm text-ink-muted">Maasii</p>
      <h1 className="mt-1 font-display text-3xl">Join {place}</h1>
      <p className="mt-3">
        {invitation.name}, you are invited as {roleNames[invitation.role]} of {place}. You will sign in with{" "}
        <strong className="break-all">{invitation.contact}</strong> and the password you choose here.
      </p>
      <ActionForm action={accept.bind(null, token)} className="mt-8 space-y-4">
        <Field
          label="Choose a password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-sm text-ink-muted">
          At least 8 characters. If you already have a Maasii account, enter its password.
        </p>
        <SubmitButton>Accept invitation</SubmitButton>
      </ActionForm>
    </main>
  );
}
