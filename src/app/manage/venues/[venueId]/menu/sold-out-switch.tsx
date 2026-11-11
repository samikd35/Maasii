"use client";

import { useFormStatus } from "react-dom";

export function SoldOutSwitch({ label, status, soldOut }: { label: string; status: string; soldOut: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={soldOut}
      aria-label={label}
      disabled={pending}
      className="group flex min-h-11 min-w-11 items-center gap-2 rounded-md border border-rule px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className="flex w-8 rounded-full border border-ink/60 bg-paper-deep p-0.5 group-aria-checked:justify-end group-aria-checked:bg-ink"
      >
        <span className="size-3 rounded-full bg-ink group-aria-checked:bg-paper" />
      </span>
      {status}
    </button>
  );
}
