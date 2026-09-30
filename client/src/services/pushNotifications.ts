import { getOrCreateDeviceId } from "./nakama";
import { getLocale } from "./i18n";
import type { TurnService } from "./turnService";

export type PushNotificationState =
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "disabled"
  | "enabled"
  | "error";

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
const PUSH_OPT_OUT_KEY = "zarka_push_opt_out";

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function decodeVapidPublicKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    result[index] = binary.charCodeAt(index);
  }
  return result;
}

function toSubscriptionPayload(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const endpoint = serialized.endpoint;
  const keys = serialized.keys;
  if (
    typeof endpoint !== "string" ||
    typeof keys?.p256dh !== "string" ||
    typeof keys.auth !== "string"
  ) {
    throw new Error("Browser returned an incomplete push subscription");
  }
  return {
    endpoint,
    expirationTime: serialized.expirationTime ?? null,
    keys: { p256dh: keys.p256dh, auth: keys.auth }
  };
}

export function isPushNotificationsConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported() || !isPushNotificationsConfigured()) {
    return null;
  }
  if (!registrationPromise) {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const scope = new URL(baseUrl, window.location.origin).toString();
    const scriptUrl = new URL("service-worker.js", scope).toString();
    registrationPromise = navigator.serviceWorker
      .register(scriptUrl, { scope })
      .catch((error: unknown) => {
        registrationPromise = null;
        throw error;
      });
  }
  return registrationPromise;
}

export async function getPushNotificationState(): Promise<PushNotificationState> {
  if (!isSupported()) return "unsupported";
  if (!isPushNotificationsConfigured()) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "disabled";
  try {
    const registration = await registerPushServiceWorker();
    if (!registration) return "error";
    return (await registration.pushManager.getSubscription())
      ? "enabled"
      : "disabled";
  } catch {
    return "error";
  }
}

export async function enablePushNotifications(
  turnService: TurnService
): Promise<PushNotificationState> {
  if (!isSupported()) return "unsupported";
  if (!isPushNotificationsConfigured()) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "disabled";
  }

  localStorage.removeItem(PUSH_OPT_OUT_KEY);
  const registration = await registerPushServiceWorker();
  if (!registration) return "error";
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(VAPID_PUBLIC_KEY)
    }));
  await turnService.registerPushSubscription(
    getOrCreateDeviceId(),
    toSubscriptionPayload(subscription),
    getLocale()
  );
  return "enabled";
}

export async function bindExistingPushSubscription(
  turnService: TurnService
): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  if (localStorage.getItem(PUSH_OPT_OUT_KEY) === "true") {
    await turnService.unregisterPushSubscription(deviceId);
    return false;
  }
  if (!isSupported()) {
    await turnService.unregisterPushSubscription(deviceId);
    return false;
  }
  if (!isPushNotificationsConfigured()) {
    await turnService.unregisterPushSubscription(deviceId);
    return false;
  }
  if (Notification.permission !== "granted") {
    await turnService.unregisterPushSubscription(deviceId);
    const registration = await registerPushServiceWorker();
    const staleSubscription = await registration?.pushManager.getSubscription();
    await staleSubscription?.unsubscribe();
    return false;
  }
  const registration = await registerPushServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  await turnService.registerPushSubscription(
    deviceId,
    toSubscriptionPayload(subscription),
    getLocale()
  );
  return true;
}

export async function disablePushNotifications(
  turnService: TurnService
): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  await turnService.unregisterPushSubscription(deviceId);
  localStorage.setItem(PUSH_OPT_OUT_KEY, "true");
  if (!isSupported() || !isPushNotificationsConfigured()) return;
  const registration = await registerPushServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

export async function unregisterPushDeviceAssociation(
  turnService: TurnService
): Promise<void> {
  await turnService.unregisterPushSubscription(getOrCreateDeviceId());
}
