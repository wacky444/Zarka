import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVER_USER_ID, RANKED_DAILY_PRESENCE_COLLECTION } from "../src/constants";
import {
  countRankedDailyPresence,
  hasRecentRankedPresence,
  RANKED_DAILY_PRESENCE_WINDOW_MS,
  touchRankedPresence
} from "../src/services/rankedPresence";
import { touchRankedPresenceRpc } from "../src/rpc/touchRankedPresence";

type StoredPresence = {
  key: string;
  value: unknown;
  permissionRead?: number;
  permissionWrite?: number;
};

function createHarness() {
  const records = new Map<string, StoredPresence>();
  const users = new Map<string, { id: string; metadata: unknown }>();
  const writes: StoredPresence[] = [];
  const nakama = {
    storageRead: (requests: Array<{ key: string }>) =>
      requests.flatMap((request) => {
        const stored = records.get(request.key);
        return stored ? [{ key: stored.key, value: stored.value }] : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      permissionRead?: number;
      permissionWrite?: number;
    }>) => {
      for (const request of requests) {
        const stored: StoredPresence = {
          key: request.key,
          value: request.value,
          permissionRead: request.permissionRead,
          permissionWrite: request.permissionWrite
        };
        records.set(request.key, stored);
        writes.push(stored);
      }
    },
    storageList: (
      userId: string,
      collection: string,
      _limit?: number,
      _cursor?: string
    ) => ({
      objects:
        userId === SERVER_USER_ID && collection === RANKED_DAILY_PRESENCE_COLLECTION
          ? Array.from(records.values())
          : [],
      cursor: ""
    }),
    storageDelete: (requests: Array<{ key: string }>) => {
      for (const request of requests) {
        records.delete(request.key);
      }
    },
    usersGetId: (ids: string[]) =>
      ids.flatMap((id) => {
        const user = users.get(id);
        return user ? [user] : [];
      })
  } as unknown as nkruntime.Nakama;
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  return {
    nakama,
    logger,
    records,
    writes,
    setUser(userId: string, metadata: unknown): void {
      users.set(userId, { id: userId, metadata });
    }
  };
}

test("ranked presence deduplicates repeated heartbeats by user", () => {
  const harness = createHarness();
  const now = 1_700_000_000_000;
  touchRankedPresence(harness.nakama, "user-a", now - 1);
  touchRankedPresence(harness.nakama, "user-a", now);
  touchRankedPresence(harness.nakama, "user-b", now);

  assert.equal(countRankedDailyPresence(harness.nakama, now), 2);
  assert.equal(harness.records.size, 2);
  assert.deepEqual(harness.records.get("user-a")?.value, {
    userId: "user-a",
    lastSeenAtMs: now
  });
  assert.equal(harness.writes[1].permissionRead, 0);
  assert.equal(harness.writes[1].permissionWrite, 0);
});

test("recent ranked presence expires after 24 hours", () => {
  const harness = createHarness();
  const now = 1_700_000_000_000;
  const cutoff = now - RANKED_DAILY_PRESENCE_WINDOW_MS;
  touchRankedPresence(harness.nakama, "active-user", now);
  touchRankedPresence(harness.nakama, "boundary-user", cutoff);
  touchRankedPresence(harness.nakama, "stale-user", cutoff - 1);
  touchRankedPresence(harness.nakama, "future-user", now + 1);

  assert.equal(hasRecentRankedPresence(harness.nakama, "active-user", now), true);
  assert.equal(hasRecentRankedPresence(harness.nakama, "boundary-user", now), true);
  assert.equal(hasRecentRankedPresence(harness.nakama, "stale-user", now), false);
  assert.equal(hasRecentRankedPresence(harness.nakama, "future-user", now), false);
  assert.equal(hasRecentRankedPresence(harness.nakama, "missing-user", now), false);
});

test("ranked presence expires stale and future records at window boundaries", () => {
  const harness = createHarness();
  const now = 1_700_000_000_000;
  const cutoff = now - RANKED_DAILY_PRESENCE_WINDOW_MS;
  touchRankedPresence(harness.nakama, "boundary-user", cutoff);
  touchRankedPresence(harness.nakama, "stale-user", cutoff - 1);
  touchRankedPresence(harness.nakama, "future-user", now + 1);

  assert.equal(countRankedDailyPresence(harness.nakama, now), 1);
  assert.equal(harness.records.has("boundary-user"), true);
  assert.equal(harness.records.has("stale-user"), false);
  assert.equal(harness.records.has("future-user"), false);
});

test("daily presence excludes bot and system IDs", () => {
  const harness = createHarness();
  const now = 1_700_000_000_000;
  touchRankedPresence(harness.nakama, "bot1", now);
  touchRankedPresence(harness.nakama, "bot2", now);
  touchRankedPresence(harness.nakama, SERVER_USER_ID, now);

  assert.equal(countRankedDailyPresence(harness.nakama, now), 0);
  assert.equal(harness.records.size, 0);
});

test("touch_ranked_presence authenticates, gates tutorial, and ignores caller identity", () => {
  const harness = createHarness();
  const now = 1_700_000_000_000;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const unauthorized = JSON.parse(
      touchRankedPresenceRpc(
        {} as nkruntime.Context,
        harness.logger,
        harness.nakama,
        "{}"
      )
    ) as { error?: string };
    assert.equal(unauthorized.error, "unauthorized");

    harness.setUser("eligible-user", { zarka: { tutorialCompleted: true } });
    const touched = JSON.parse(
      touchRankedPresenceRpc(
        { userId: "eligible-user" } as nkruntime.Context,
        harness.logger,
        harness.nakama,
        JSON.stringify({ user_id: "another-user", daily_users: 999 })
      )
    ) as { ok?: boolean };
    assert.equal(touched.ok, true);
    assert.equal(harness.records.has("eligible-user"), true);
    assert.equal(harness.records.has("another-user"), false);

    harness.setUser("incomplete-user", { zarka: { tutorialCompleted: false } });
    const ineligible = JSON.parse(
      touchRankedPresenceRpc(
        { userId: "incomplete-user" } as nkruntime.Context,
        harness.logger,
        harness.nakama,
        "{}"
      )
    ) as { error?: string };
    assert.equal(ineligible.error, "ineligible");

    harness.setUser("bot1", { zarka: { tutorialCompleted: true } });
    const bot = JSON.parse(
      touchRankedPresenceRpc(
        { userId: "bot1" } as nkruntime.Context,
        harness.logger,
        harness.nakama,
        "{}"
      )
    ) as { error?: string };
    assert.equal(bot.error, "ineligible");
    assert.equal(countRankedDailyPresence(harness.nakama, now), 1);
  } finally {
    Date.now = originalNow;
  }
});
