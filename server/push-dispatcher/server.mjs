import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import webPush from "web-push";

const MAX_BODY_BYTES = 512 * 1024;
const MAX_SUBSCRIPTIONS_PER_JOB = 200;
const JOB_CACHE_TTL_MS = 5 * 60 * 1000;
const JOB_CACHE_LIMIT = 10000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    return false;
  }
  const host = endpoint.hostname.toLowerCase();
  const allowedHost =
    host === "fcm.googleapis.com" ||
    host === "push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  return (
    endpoint.protocol === "https:" &&
    endpoint.username === "" &&
    endpoint.password === "" &&
    (endpoint.port === "" || endpoint.port === "443") &&
    endpoint.hash === "" &&
    allowedHost
  );
}

function parseSubscription(value) {
  if (!isRecord(value) || !isRecord(value.keys)) return null;
  if (
    !isSafeEndpoint(value.endpoint) ||
    typeof value.keys.p256dh !== "string" ||
    !/^[A-Za-z0-9_-]{80,120}$/.test(value.keys.p256dh) ||
    typeof value.keys.auth !== "string" ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(value.keys.auth) ||
    (value.expirationTime !== null &&
      value.expirationTime !== undefined &&
      (!Number.isFinite(value.expirationTime) || value.expirationTime <= 0))
  ) {
    return null;
  }
  return {
    endpoint: value.endpoint,
    expirationTime:
      typeof value.expirationTime === "number" ? value.expirationTime : null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth }
  };
}

function parseJob(value) {
  if (
    !isRecord(value) ||
    typeof value.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9:_-]{1,180}$/.test(value.idempotencyKey) ||
    typeof value.matchId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.matchId) ||
    !Number.isSafeInteger(value.turn) ||
    value.turn < 1 ||
    !Array.isArray(value.subscriptions) ||
    value.subscriptions.length > MAX_SUBSCRIPTIONS_PER_JOB
  ) {
    return null;
  }
  const subscriptions = [];
  const seen = new Set();
  for (const entry of value.subscriptions) {
    if (
      !isRecord(entry) ||
      typeof entry.userId !== "string" ||
      !/^[A-Za-z0-9-]{1,80}$/.test(entry.userId) ||
      typeof entry.deviceId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(entry.deviceId) ||
      (entry.locale !== "en" && entry.locale !== "es")
    ) {
      return null;
    }
    const subscription = parseSubscription(entry.subscription);
    if (!subscription) return null;
    if (seen.has(entry.deviceId)) continue;
    seen.add(entry.deviceId);
    subscriptions.push({
      userId: entry.userId,
      deviceId: entry.deviceId,
      subscription,
      locale: entry.locale
    });
  }
  return {
    idempotencyKey: value.idempotencyKey,
    matchId: value.matchId,
    turn: value.turn,
    subscriptions
  };
}

function authorized(request, expectedSecret) {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedSecret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("payload_too_large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getHttpStatus(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : null;
}

async function deliverJob(job, sendNotification) {
  const expiredDeviceIds = [];
  let retryableFailure = false;
  const outcomes = await Promise.allSettled(
    job.subscriptions.map(async (entry) => {
      try {
        const payload = JSON.stringify({
          matchId: job.matchId,
          turn: job.turn,
          locale: entry.locale
        });
        await sendNotification(entry.subscription, payload, {
          TTL: 3600,
          urgency: "normal"
        });
      } catch (error) {
        const statusCode = getHttpStatus(error);
        if (statusCode === 404 || statusCode === 410) {
          expiredDeviceIds.push(entry.deviceId);
        } else {
          retryableFailure = true;
        }
      }
    })
  );
  if (outcomes.some((result) => result.status === "rejected")) {
    retryableFailure = true;
  }
  return { ok: !retryableFailure, expiredDeviceIds };
}

export function createPushDispatcherHandler(options) {
  const { secret, enabled, sendNotification } = options;
  const inFlight = new Map();
  const completed = new Map();

  return async function handle(request, response) {
    const url = new URL(request.url ?? "/", "http://push-dispatcher");
    if (request.method === "GET" && url.pathname === "/healthcheck") {
      sendJson(response, 200, { ok: true, enabled });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/send") {
      sendJson(response, 404, { ok: false });
      return;
    }
    if (!secret || !authorized(request, secret)) {
      sendJson(response, 401, { ok: false });
      return;
    }
    if (!enabled) {
      sendJson(response, 503, { ok: false, error: "push_not_configured" });
      return;
    }

    let job;
    try {
      job = parseJob(await readJson(request));
    } catch {
      sendJson(response, 400, { ok: false, error: "invalid_payload" });
      return;
    }
    if (!job) {
      sendJson(response, 400, { ok: false, error: "invalid_payload" });
      return;
    }

    const now = Date.now();
    for (const [key, item] of completed) {
      if (item.expiresAtMs <= now) completed.delete(key);
    }
    const cached = completed.get(job.idempotencyKey);
    if (cached) {
      sendJson(response, 200, cached.result);
      return;
    }
    const existing = inFlight.get(job.idempotencyKey);
    if (existing) {
      const result = await existing;
      sendJson(response, result.ok ? 200 : 503, result);
      return;
    }

    const task = deliverJob(job, sendNotification);
    inFlight.set(job.idempotencyKey, task);
    const result = await task;
    inFlight.delete(job.idempotencyKey);
    if (result.ok) {
      completed.set(job.idempotencyKey, {
        result,
        expiresAtMs: Date.now() + JOB_CACHE_TTL_MS
      });
      while (completed.size > JOB_CACHE_LIMIT) {
        const oldest = completed.keys().next().value;
        if (typeof oldest !== "string") break;
        completed.delete(oldest);
      }
    }
    sendJson(response, result.ok ? 200 : 503, result);
  };
}

export function startPushDispatcher(env = process.env) {
  const secret = env.PUSH_DISPATCH_SECRET ?? "";
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "";
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "";
  const subject = env.WEB_PUSH_VAPID_SUBJECT ?? "";
  let enabled = false;
  if (secret.length >= 32 && publicKey && privateKey && subject) {
    try {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      enabled = true;
    } catch {
      console.error("Web Push configuration is invalid");
    }
  }
  if (!enabled) {
    console.warn("Web Push dispatcher is disabled; configure server secrets");
  }

  const server = createServer(
    createPushDispatcherHandler({
      secret,
      enabled,
      sendNotification: webPush.sendNotification.bind(webPush)
    })
  );
  const port = Number.parseInt(env.PORT ?? "7355", 10);
  server.listen(port, "0.0.0.0", () => {
    console.info(`Push dispatcher listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPushDispatcher();
}
