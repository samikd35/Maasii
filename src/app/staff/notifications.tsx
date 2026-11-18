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

type Status = "available" | "notificationEnabled" | "notificationUnconfigured" | "notificationUnsupported"
  | "notificationDenied" | "notificationDismissed" | "notificationError";

function supportsPush() {
  return window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
}

export function Notifications({ vapidKey, subscribed }: { vapidKey?: string; subscribed: boolean }) {
  const t = useTranslations("StaffOrders");
  const [status, setStatus] = useState<Status | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkDevice(): Promise<Status> {
      if (!vapidKey) return "notificationUnconfigured";
      if (!supportsPush()) return "notificationUnsupported";
      const registration = await readyWorker();
      if (Notification.permission === "denied") return "notificationDenied";
      // A saved registration can outlive the browser subscription.
      if (subscribed && Notification.permission === "granted" && await registration.pushManager.getSubscription()) {
        return "notificationEnabled";
      }
      return "available";
    }
    void checkDevice().catch(() => "notificationError" as const).then((next) => {
      if (active) setStatus(next);
    });
    return () => { active = false; };
  }, [vapidKey, subscribed]);

  async function enable() {
    if (!vapidKey) return;
    if (!supportsPush()) {
      setStatus("notificationUnsupported");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "notificationDenied" : "notificationDismissed");
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

  const canEnable = vapidKey && (status === "available" || status === "notificationDenied"
    || status === "notificationDismissed" || status === "notificationError");

  return (
    <details className="workspace-device-alerts text-sm">
      <summary className="workspace-summary">{t("deviceAlerts")}</summary>
      {canEnable && <p>{t("installHint")}</p>}
      {canEnable && (
        <button className="min-h-11 underline" type="button" disabled={busy} onClick={() => void enable()}>
          {t("enableNotifications")}
        </button>
      )}
      <p role="status">{status && status !== "available" && t(status)}</p>
    </details>
  );
}
