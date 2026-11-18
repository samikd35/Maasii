"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useRef, useState, type ReactNode, type RefObject } from "react";
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
  confirmMessage,
  confirmLabel,
  confirmWhenEmptyPrefix,
  qrAction,
  "aria-labelledby": labelledBy,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
  confirmLabel?: string;
  confirmWhenEmptyPrefix?: string;
  qrAction?: { show: string; regenerate: string };
  "aria-labelledby"?: string;
}) {
  const t = useTranslations("StaffForms");
  const errors = useTranslations("StaffErrors");
  const [state, formAction] = useActionState(action, undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitter = useRef<HTMLElement | null>(null);
  const confirmed = useRef(false);
  return (
    <><form ref={form} action={formAction} className={className} aria-labelledby={labelledBy} onSubmit={event => {
      if (!confirmMessage || confirmed.current) return;
      if (confirmWhenEmptyPrefix && [...new FormData(event.currentTarget)].some(([name, value]) => name.startsWith(confirmWhenEmptyPrefix) && value)) return;
      event.preventDefault();
      submitter.current = (event.nativeEvent as SubmitEvent).submitter;
      dialog.current?.showModal();
    }}>
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
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt={t("waiterJoinQr")} width={240} height={240} className="h-auto max-w-full border border-rule bg-white" />
        </div>
      )}
      {qrAction && <SubmitButton>{state?.qr ? qrAction.regenerate : qrAction.show}</SubmitButton>}
      {state?.link && <CopyField key={state.link} label={t("invitationLink")} value={state.link} />}
    </form>
    {confirmMessage && <ConfirmationDialog dialog={dialog} title={confirmLabel ?? t("continue")} cancel={t("cancel")}
      onConfirm={() => {
        dialog.current?.close();
        confirmed.current = true;
        try { form.current?.requestSubmit(submitter.current ?? undefined); } finally { confirmed.current = false; }
      }}>{confirmMessage}</ConfirmationDialog>}
    </>
  );
}

export function ConfirmationDialog({ dialog, title, cancel, children, onConfirm }: {
  dialog: RefObject<HTMLDialogElement | null>; title: string; cancel: string; children: ReactNode; onConfirm: () => void;
}) {
  const heading = useId();
  return <dialog ref={dialog} className="workspace-dialog" aria-labelledby={heading}>
    <h2 id={heading} className="text-xl font-semibold">{title}?</h2>
    <div className="my-4">{children}</div>
    <div className="workspace-actions">
      <button type="button" autoFocus className="workspace-button" onClick={() => dialog.current?.close()}>{cancel}</button>
      <button type="button" className="workspace-button workspace-primary" onClick={onConfirm}>{title}</button>
    </div>
  </dialog>;
}

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "secondary" | "quiet" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        variant === "destructive"
          ? "min-h-11 min-w-11 rounded-xl border border-red-800 px-4 font-medium text-red-800 disabled:opacity-60"
          : variant === "primary"
          ? "min-h-11 min-w-11 rounded-xl bg-ink px-4 font-semibold text-paper disabled:opacity-60"
          : variant === "quiet" ? "min-h-11 min-w-11 rounded-xl px-4 font-medium underline underline-offset-4 disabled:opacity-60"
          : "min-h-11 min-w-11 rounded-xl border border-ink/30 px-4 font-medium disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

/** A read-only link with a Copy button, to send by WhatsApp, SMS or email. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("StaffForms");
  const [copyStatus, setCopyStatus] = useState("");
  return (
    <div className="mt-3 basis-full">
      <label className="block text-sm font-medium">
        {label}
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 min-h-11 w-full rounded-xl border border-ink/30 bg-paper-deep px-3 text-sm"
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          let message;
          try {
            await navigator.clipboard.writeText(value);
            message = t("copied");
          } catch {
            message = t("copyFailed");
          }
          setCopyStatus((previous) => previous === message ? `${message}\u00a0` : message);
        }}
        className="mt-2 min-h-11 min-w-11 rounded-xl border border-ink/30 px-4 font-medium"
      >
        {t("copyLink")}
      </button>
      <p role="status" className="mt-1 text-sm">{copyStatus}</p>
    </div>
  );
}
