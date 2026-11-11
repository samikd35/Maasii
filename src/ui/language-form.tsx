"use client";

import { useRouter } from "next/navigation";
import { startTransition, type ComponentProps } from "react";
import { LANGUAGE_COOKIE_MAX_AGE } from "@/i18n/config";

/**
 * Sets the language cookie in the browser and refreshes the page in place. A Server Action would
 * also work, but Next.js scrolls to the top after one, and the guest would lose their place.
 * Without JavaScript the form posts to its `action` instead.
 */
export function LanguageForm({ cookieName, ...props }: ComponentProps<"form"> & { cookieName?: string }) {
  const router = useRouter();
  return (
    <form
      {...props}
      onSubmit={(event) => {
        if (!cookieName) return;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (!(submitter instanceof HTMLButtonElement) || !submitter.value) return;
        event.preventDefault();
        document.cookie = `${cookieName}=${submitter.value}; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
        startTransition(() => router.refresh());
      }}
    />
  );
}
