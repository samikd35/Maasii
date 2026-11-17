"use client";

import { useState } from "react";

export function GuestCopyPaymentCode({ code, labels }: {
  code: string;
  labels: { copyCode: string; copied: string; copyFailed: string };
}) {
  const [status, setStatus] = useState("");
  async function copy() {
    let message: string;
    try {
      await navigator.clipboard.writeText(code);
      message = labels.copied;
    } catch {
      message = labels.copyFailed;
    }
    // VoiceOver can skip an announcement that's identical to the last one.
    setStatus((previous) => previous === message ? `${message}\u00a0` : message);
  }
  return (
    <>
      <p dir="ltr" className="break-all text-start font-mono select-text">{code}</p>
      <button type="button" onClick={() => void copy()}
        className="min-h-11 min-w-11 rounded-md border border-ink/40 px-3 font-medium">
        {labels.copyCode}
      </button>
      <p role="status">{status}</p>
    </>
  );
}
