import type { ComponentProps } from "react";

/** A labelled text input for management screens, sized for thumbs. */
export function Field({ label, className, ...input }: { label: string } & ComponentProps<"input">) {
  return (
    <label className={`block text-sm font-medium ${className ?? ""}`}>
      {label}
      <input
        {...input}
        className="mt-1 min-h-11 w-full rounded-xl border border-ink/30 bg-white px-3 text-base font-normal"
      />
    </label>
  );
}

export function PinField({ label, setup = false, legacy = false }: { label: string; setup?: boolean; legacy?: boolean }) {
  return <Field label={label} name="pin" type="password" inputMode="numeric" pattern={legacy ? "(?:[0-9]{4}|[0-9]{6})" : "[0-9]{6}"} maxLength={6}
    autoComplete={setup ? "new-password" : "current-password"} required />;
}
