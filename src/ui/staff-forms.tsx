"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/session";

/**
 * A management form that runs a server action and shows its outcome below the fields: a refusal in
 * words, a confirmation, or a link to share (such as an invitation link).
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("StaffForms");
  const errors = useTranslations("StaffErrors");
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 basis-full text-sm font-medium text-red-800">
          {errors(state.error)}
        </p>
      )}
      {state?.done && (
        <p role="status" className="mt-2 basis-full text-sm text-ink-muted">
          {t(state.done.key, state.done.values)}
        </p>
      )}
      {state?.qr && (
        // The short-lived QR is rendered once by the server action.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.qr} alt={t("waiterJoinQr")} width={240} height={240} className="mt-3 h-auto max-w-full border border-rule bg-white" />
      )}
      {state?.link && <CopyField key={state.link} label={t("invitationLink")} value={state.link} />}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "quiet" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        variant === "primary"
          ? "min-h-11 min-w-11 rounded-md bg-ink px-4 font-semibold text-paper disabled:opacity-60"
          : "min-h-11 min-w-11 rounded-md border border-ink/30 px-4 font-medium disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

/** A read-only link with a Copy button, to send by WhatsApp, SMS or email. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("StaffForms");
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 basis-full">
      <label className="block text-sm font-medium">
        {label}
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 min-h-11 w-full rounded-md border border-ink/30 bg-paper-deep px-3 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
        className="mt-2 min-h-11 min-w-11 rounded-md border border-ink/30 px-4 font-medium"
      >
        {t(copied ? "copied" : "copyLink")}
      </button>
    </div>
  );
}
