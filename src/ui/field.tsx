import type { InputHTMLAttributes } from "react";

/** A labelled text input for management screens, sized for thumbs. */
export function Field({ label, className, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block text-sm font-medium ${className ?? ""}`}>
      {label}
      <input
        {...input}
        className="mt-1 min-h-11 w-full rounded-md border border-ink/30 bg-white px-3 text-base font-normal"
      />
    </label>
  );
}
