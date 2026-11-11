import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signedInUserId } from "@/lib/session";
import { Field } from "@/ui/field";
import { ActionForm, SubmitButton } from "@/ui/staff-forms";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in · Maasii" };

export default async function SignInPage() {
  if (await signedInUserId()) redirect("/manage");

  return (
    <main className="mx-auto max-w-sm px-5 py-12">
      <h1 className="font-display text-3xl">Sign in to Maasii</h1>
      <p className="mt-2 text-ink-muted">For owners and managers. Use the email or phone you were invited with.</p>
      <ActionForm action={signIn} className="mt-8 space-y-4">
        <Field label="Email or phone" name="contact" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton>Sign in</SubmitButton>
      </ActionForm>
    </main>
  );
}
