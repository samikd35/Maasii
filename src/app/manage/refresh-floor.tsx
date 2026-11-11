"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RefreshFloor() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    // ponytail: poll active management tabs. Use private Broadcast if request volume grows.
    const interval = window.setInterval(refresh, 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
