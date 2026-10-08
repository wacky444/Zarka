import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createPushDispatcherHandler } from "./server.mjs";

const SECRET = "test-secret-that-is-long-enough-for-a-token";
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";

function createJob(overrides = {}) {
  return {
    idempotencyKey: "turn_match-1_2",
    event: "turn_advanced",
    matchId: "match-1",
    turn: 2,
    subscriptions: [
      {
        userId: "player-1",
        deviceId: DEVICE_ID,
        locale: "es",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/token",
          expirationTime: null,
          keys: {
            p256dh: "A".repeat(87),
            auth: "B".repeat(22)
          }
        }
      }
    ],
    ...overrides
  };
}

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

function makeHandler(sendNotification, options = {}) {
  return createPushDispatcherHandler({
    secret: SECRET,
    enabled: true,
    sendNotification,
    ...options
  });
}

test("push dispatcher requires server authentication", async () => {
  const handler = makeHandler(async () => undefined);
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createJob())
    });
    assert.equal(response.status, 401);
  });
});

test("push dispatcher rejects unsafe subscription endpoints", async () => {
  let sendCount = 0;
  const handler = makeHandler(async () => {
    sendCount += 1;
  });
  const job = createJob();
  job.subscriptions[0].subscription.endpoint = "http://127.0.0.1/admin";
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(job)
    });
    assert.equal(response.status, 400);
    assert.equal(sendCount, 0);
  });
});

test("push dispatcher sends valid payload and deduplicates idempotency key", async () => {
  let sendCount = 0;
  let sentPayload = "";
  const handler = makeHandler(async (_subscription, payload) => {
    sendCount += 1;
    sentPayload = payload;
  });
  await withServer(handler, async (baseUrl) => {
    const request = () =>
      fetch(`${baseUrl}/send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${SECRET}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(createJob())
      });
    const first = await request();
    const duplicate = await request();
    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal(sendCount, 1);
    assert.deepEqual(JSON.parse(sentPayload), {
      event: "turn_advanced",
      matchId: "match-1",
      turn: 2,
      locale: "es"
    });
  });
});

test("ranked-match start payload omits turn state and deduplicates by event key", async () => {
  let sendCount = 0;
  let sentPayload = "";
  const handler = makeHandler(async (_subscription, payload) => {
    sendCount += 1;
    sentPayload = payload;
  });
  const job = createJob({
    idempotencyKey: "ranked_match_started_match-1",
    event: "ranked_match_started",
    turn: undefined
  });
  await withServer(handler, async (baseUrl) => {
    const request = () =>
      fetch(`${baseUrl}/send`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${SECRET}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(job)
      });
    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 200);
    assert.equal(sendCount, 1);
    assert.deepEqual(JSON.parse(sentPayload), {
      event: "ranked_match_started",
      matchId: "match-1",
      locale: "es"
    });
  });
});

test("ranked-match push provider failures remain retryable", async () => {
  const handler = makeHandler(async () => {
    throw Object.assign(new Error("temporary"), { statusCode: 503 });
  });
  const job = createJob({
    idempotencyKey: "ranked_match_started_match-1",
    event: "ranked_match_started",
    turn: undefined
  });
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(job)
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, expiredDeviceIds: [] });
  });
});

test("expired subscriptions are returned for server-side cleanup", async () => {
  const handler = makeHandler(async () => {
    throw Object.assign(new Error("expired"), { statusCode: 410 });
  });
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(createJob())
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      expiredDeviceIds: [DEVICE_ID]
    });
  });
});

test("temporary provider failures request an outbox retry", async () => {
  const handler = makeHandler(async () => {
    throw Object.assign(new Error("temporary"), { statusCode: 503 });
  });
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(createJob())
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, expiredDeviceIds: [] });
  });
});
