"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type FormState = { error?: string; done?: string; link?: string } | undefined;

/**
 * A management form that runs a server action and shows its outcome below the fields: a refusal in
 * words, a confirmation, or a link to share (such as an invitation link).
 */
export function ActionForm({
  action,
  children,
  className,
  linkLabel = "Invitation link",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  linkLabel?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 basis-full text-sm font-medium text-red-800">
          {state.error}
        </p>
      )}
      {state?.done && (
        <p role="status" className="mt-2 basis-full text-sm text-ink-muted">
          {state.done}
        </p>
      )}
      {state?.link && <CopyField label={linkLabel} value={state.link} />}
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
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
