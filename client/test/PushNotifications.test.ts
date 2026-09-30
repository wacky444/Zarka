import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindExistingPushSubscription,
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState
} from "../src/services/pushNotifications";
import type { TurnService } from "../src/services/turnService";

const calls: string[] = [];
const pushSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
  expirationTime: null,
  toJSON: () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    expirationTime: null,
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) }
  }),
  unsubscribe: async () => {
    calls.push("unsubscribe");
    return true;
  }
} as unknown as PushSubscription;
let existingSubscription: PushSubscription | null = pushSubscription;
let permission: NotificationPermission = "granted";
let permissionRequestCount = 0;
let subscribeOptions: PushSubscriptionOptionsInit | null = null;
const registration = {
  pushManager: {
    getSubscription: async () => existingSubscription,
    subscribe: async (options: PushSubscriptionOptionsInit) => {
      calls.push("subscribe");
      subscribeOptions = options;
      existingSubscription = pushSubscription;
      return pushSubscription;
    }
  }
} as unknown as ServiceWorkerRegistration;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    isSecureContext: true,
    Notification: {},
    PushManager: class PushManager {},
    location: { origin: "https://example.test" }
  }
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    serviceWorker: {
      register: async (scriptUrl: string, options: RegistrationOptions) => {
        assert.equal(scriptUrl, "https://example.test/Zarka/service-worker.js");
        assert.equal(options.scope, "https://example.test/Zarka/");
        calls.push("register-worker");
        return registration;
      }
    }
  }
});
Object.defineProperty(globalThis, "Notification", {
  configurable: true,
  value: {
    get permission() {
      return permission;
    },
    requestPermission: async () => {
      permissionRequestCount += 1;
      calls.push("request-permission");
      permission = "granted";
      return permission;
    }
  }
});
const localValues = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) =>
      key === "device_id"
        ? "11111111-1111-4111-8111-111111111111"
        : localValues.get(key) ?? null,
    setItem: (key: string, value: string) => localValues.set(key, value),
    removeItem: (key: string) => localValues.delete(key)
  }
});

function createTurnService(label: string) {
  return {
    registerPushSubscription: async (deviceId: string) => {
      calls.push(`register:${label}:${deviceId}`);
      return { payload: JSON.stringify({ ok: true }) };
    },
    unregisterPushSubscription: async (deviceId: string) => {
      calls.push(`unregister:${label}:${deviceId}`);
      return { payload: JSON.stringify({ ok: true }) };
    }
  } as unknown as TurnService;
}

test("unsupported browser reports no push support", async () => {
  const browserWindow = window as unknown as Record<string, unknown>;
  delete browserWindow.PushManager;
  assert.equal(await getPushNotificationState(), "unsupported");
  browserWindow.PushManager = class PushManager {};
});

test("denied permission does not prompt again", async () => {
  permission = "denied";
  const before = permissionRequestCount;
  assert.equal(await getPushNotificationState(), "denied");
  permission = "granted";
  assert.equal(permissionRequestCount, before);
});

test("existing subscription binds to each authenticated account without a prompt", async () => {
  permission = "granted";
  existingSubscription = pushSubscription;
  const before = permissionRequestCount;
  assert.equal(await bindExistingPushSubscription(createTurnService("first")), true);
  assert.equal(await bindExistingPushSubscription(createTurnService("second")), true);
  assert.ok(calls.includes("register:first:11111111-1111-4111-8111-111111111111"));
  assert.ok(calls.includes("register:second:11111111-1111-4111-8111-111111111111"));
  assert.equal(permissionRequestCount, before);
});

test("enable prompts only on request and sends the browser subscription", async () => {
  calls.length = 0;
  permission = "default";
  existingSubscription = null;
  assert.equal(await enablePushNotifications(createTurnService("enable")), "enabled");
  assert.equal(permissionRequestCount, 1);
  assert.ok(calls.indexOf("request-permission") < calls.indexOf("subscribe"));
  assert.ok(calls.some((call) => call.startsWith("register:enable:")));
  assert.equal(subscribeOptions?.userVisibleOnly, true);
  assert.ok(subscribeOptions?.applicationServerKey instanceof Uint8Array);
});

test("disable unregisters server association before browser subscription", async () => {
  calls.length = 0;
  existingSubscription = pushSubscription;
  await disablePushNotifications(createTurnService("disable"));
  assert.equal(calls[0], "unregister:disable:11111111-1111-4111-8111-111111111111");
  assert.equal(calls[1], "unsubscribe");
  assert.equal(await bindExistingPushSubscription(createTurnService("after-opt-out")), false);
  assert.ok(calls.includes("unregister:after-opt-out:11111111-1111-4111-8111-111111111111"));
  assert.equal(
    calls.some((call) => call.startsWith("register:after-opt-out:")),
    false
  );
});
