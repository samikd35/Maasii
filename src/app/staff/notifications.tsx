"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { allowNotifications } from "./actions";

async function readyWorker() {
  const registration = await navigator.serviceWorker.register("/staff-sw.js", { scope: "/staff", updateViaCache: "none" });
  if (!registration.active) {
    // A client-side transition from the join QR keeps the original document outside the staff scope.
    // Wait for this registration to activate, even if that document cannot be controlled.
    const worker = registration.installing ?? registration.waiting;
    if (!worker) throw new Error("Missing staff worker");
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (worker.state === "activated" || worker.state === "redundant") {
          worker.removeEventListener("statechange", check);
          if (worker.state === "activated") resolve();
          else reject(new Error("Staff worker did not activate"));
        }
      };
      worker.addEventListener("statechange", check);
      check();
    });
  }
  return registration;
}

type Status = "notificationEnabled" | "notificationUnsupported" | "notificationDenied" | "notificationError";

export function Notifications({ vapidKey, subscribed }: { vapidKey?: string; subscribed: boolean }) {
  const t = useTranslations("StaffOrders");
  const [status, setStatus] = useState<Status | undefined>(subscribed ? "notificationEnabled" : undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void readyWorker().catch(() => {});
  }, []);

  async function enable() {
    if (!vapidKey || !("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
      setStatus("notificationUnsupported");
      return;
    }
    setBusy(true);
    try {
      if (await Notification.requestPermission() !== "granted") {
        setStatus("notificationDenied");
        return;
      }
      const registration = await readyWorker();
      const current = await registration.pushManager.getSubscription();
      // An expired subscription may remain in the browser after its provider rejects it.
      if (!subscribed) await current?.unsubscribe();
      const subscription = subscribed && current ? current : await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: vapidKey,
      });
      const saved = await allowNotifications(subscription.toJSON());
      setStatus(saved ? "notificationEnabled" : "notificationError");
    } catch {
      setStatus("notificationError");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 text-sm">
      <p>{t("installHint")}</p>
      {vapidKey && status !== "notificationEnabled" && (
        <button className="min-h-11 underline" type="button" disabled={busy} onClick={() => void enable()}>
          {t("enableNotifications")}
        </button>
      )}
      <p role="status">{status && t(status)}</p>
    </div>
  );
}
