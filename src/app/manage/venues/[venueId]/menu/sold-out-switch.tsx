"use client";

import { useFormStatus } from "react-dom";

export function SoldOutButton({ label, name }: { label: string; name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-label={`${label} · ${name}`}
      disabled={pending}
      className="workspace-button"
    >
      {label}
    </button>
  );
}
