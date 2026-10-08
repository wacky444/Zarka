import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_ASSIGNMENT_COLLECTION,
  RANKED_QUEUE_ENROLLMENT_COLLECTION,
  RANKED_QUEUE_TICKET_COLLECTION,
  RANKED_DAILY_PRESENCE_COLLECTION
} from "../src/constants";
import { processRankedQueue, recordRankedSlotPreference } from "../src/services/rankedQueue";
import { touchRankedPresence } from "../src/services/rankedPresence";
import { MATCH_COLLECTION } from "../src/constants";

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = { id: string; username: string; metadata: unknown };

function createHarness(userIds: string[]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const matches: Array<Record<string, string>> = [];
  let version = 0;
  let uuid = 0;
  let failNextMatchStorageWrite = false;
  const storageKey = (record: { collection: string; userId: string; key: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;

  for (const [index, userId] of userIds.entries()) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        zarka: {
          tutorialCompleted: true,
          rankedMatchSlots: 0,
          stats: { elo: 1000 + index * 10 }
        }
      }
    });
  }

  const nakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const record = records.get(storageKey(request));
        return record ? [record] : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) => {
      if (
        failNextMatchStorageWrite &&
        requests.some((request) => request.collection === MATCH_COLLECTION)
      ) {
        failNextMatchStorageWrite = false;
        throw new Error("simulated_match_storage_failure");
      }
      for (const request of requests) {
        const current = records.get(storageKey(request));
        const expectedVersion = request.version === "" ? undefined : request.version;
        if (request.version !== undefined && expectedVersion !== current?.version) {
          throw new Error("version conflict");
        }
      }
      for (const request of requests) {
        const record: Stored = {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: request.value,
          version: String(++version)
        };
        records.set(storageKey(record), record);
      }
    },
    storageList: (userId: string, collection: string, limit = 100, cursor = "") => {
      const start = Number.parseInt(cursor || "0", 10) || 0;
      const objects = Array.from(records.values()).filter(
        (record) => record.userId === userId && record.collection === collection
      );
      const page = objects.slice(start, start + limit);
      const next = start + limit < objects.length ? String(start + limit) : "";
      return { objects: page, cursor: next };
    },
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) records.delete(storageKey(request));
    },
    matchCreate: (_handler: string, params: Record<string, string>) => {
      matches.push(params);
      return `ranked-runtime-${matches.length}`;
    },
    matchList: () =>
      matches.map((params, index) => ({
        matchId: `ranked-runtime-${index + 1}`,
        label: JSON.stringify({ game_id: params.game_id })
      })),
    matchSignal: () => "",
    uuidv4: () => `assignment-${++uuid}`,
    usersGetId: (ids: string[]) => ids.flatMap((id) => {
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
    users,
    matches,
    setSlots(userId: string, value: number, nowMs: number): void {
      const user = users.get(userId)!;
      const metadata = user.metadata as { zarka: Record<string, unknown> };
      user.metadata = {
        ...metadata,
        zarka: { ...metadata.zarka, rankedMatchSlots: value }
      };
      recordRankedSlotPreference(nakama, userId, value, nowMs);
    },
    addDailyUsers(count: number, nowMs: number): void {
      for (let index = 0; index < count; index += 1) {
        const userId = userIds[index] ?? `daily-${index}`;
        if (!users.has(userId)) {
          users.set(userId, {
            id: userId,
            username: userId,
            metadata: { zarka: { tutorialCompleted: true, rankedMatchSlots: 0 } }
          });
        }
        touchRankedPresence(nakama, userId, nowMs);
      }
    },
    failNextMatchStorageWrite(): void {
      failNextMatchStorageWrite = true;
    },
    collection(collection: string): Stored[] {
      return Array.from(records.values()).filter(
        (record) => record.collection === collection
      );
    }
  };
}

const makeUsers = (count: number, prefix = "player"): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

test("low population assigns offline users and fills roster with bots", () => {
  const now = 1_700_000_000_000;
  const users = makeUsers(5);
  const harness = createHarness(users);
  harness.addDailyUsers(5, now);
  for (const userId of users.slice(0, 3)) harness.setSlots(userId, 1, now);

  processRankedQueue(harness.nakama, harness.logger, now);

  assert.equal(harness.matches.length, 1);
  assert.equal(harness.matches[0].size, "16");
  assert.equal(harness.matches[0].botPlayers, "13");
  const assignments = harness.collection(RANKED_ASSIGNMENT_COLLECTION);
  assert.equal(assignments.length, 1);
  const assignment = assignments[0].value as { state: string; humanIds: string[]; botCount: number };
  assert.equal(assignment.state, "active");
  assert.equal(assignment.humanIds.length, 3);
  assert.equal(assignment.botCount, 13);
  assert.equal(harness.collection(RANKED_QUEUE_TICKET_COLLECTION).length, 3);
  assert.equal(harness.collection(RANKED_QUEUE_ENROLLMENT_COLLECTION).length, 3);
  assert.equal(harness.collection(MATCH_COLLECTION).length, 1);
  assert.equal(harness.collection(RANKED_DAILY_PRESENCE_COLLECTION).length, 5);

  processRankedQueue(harness.nakama, harness.logger, now + 10_000);
  assert.equal(harness.matches.length, 1);
});

test("multi-slot users may enter separate matches but never repeat in one roster", () => {
  const now = 1_700_000_100_000;
  const users = makeUsers(5, "multi");
  const harness = createHarness(users);
  harness.addDailyUsers(5, now);
  for (const userId of users.slice(0, 3)) harness.setSlots(userId, 2, now);

  processRankedQueue(harness.nakama, harness.logger, now);

  assert.equal(harness.matches.length, 2);
  const assignments = harness.collection(RANKED_ASSIGNMENT_COLLECTION).map(
    (record) => record.value as { humanIds: string[] }
  );
  assert.equal(assignments.length, 2);
  for (const assignment of assignments) {
    assert.equal(new Set(assignment.humanIds).size, assignment.humanIds.length);
  }
  const participantsByUser = new Map<string, number>();
  for (const assignment of assignments) {
    for (const userId of assignment.humanIds) {
      participantsByUser.set(userId, (participantsByUser.get(userId) ?? 0) + 1);
    }
  }
  assert.deepEqual([...participantsByUser.values()], [2, 2, 2]);
});

test("high population assignments use humans only", () => {
  const now = 1_700_000_200_000;
  const users = makeUsers(16, "high");
  const harness = createHarness(users);
  harness.addDailyUsers(16, now);
  for (const userId of users) harness.setSlots(userId, 1, now);

  processRankedQueue(harness.nakama, harness.logger, now);

  assert.equal(harness.matches.length, 1);
  assert.equal(harness.matches[0].size, "16");
  assert.equal(harness.matches[0].botPlayers, "0");
  assert.equal(
    (harness.collection(RANKED_ASSIGNMENT_COLLECTION)[0].value as { queueMode: string }).queueMode,
    "high_population"
  );
});

test("lowering slots cancels newest pending tickets without starting a match", () => {
  const now = 1_700_000_300_000;
  const users = makeUsers(5, "lower");
  const harness = createHarness(users);
  harness.addDailyUsers(5, now);
  harness.setSlots(users[0], 2, now);
  harness.setSlots(users[1], 2, now);
  processRankedQueue(harness.nakama, harness.logger, now);
  assert.equal(harness.matches.length, 0);
  assert.equal(harness.collection(RANKED_QUEUE_TICKET_COLLECTION).length, 4);

  harness.setSlots(users[0], 0, now + 1);
  processRankedQueue(harness.nakama, harness.logger, now + 2);
  const tickets = harness.collection(RANKED_QUEUE_TICKET_COLLECTION);
  assert.equal(tickets.length, 2);
  assert.ok(tickets.every((ticket) => (ticket.value as { userId: string }).userId === users[1]));
});

test("completed assignment releases slot and replenishes requested ticket", () => {
  const now = 1_700_000_400_000;
  const users = makeUsers(5, "release");
  const harness = createHarness(users);
  harness.addDailyUsers(5, now);
  for (const userId of users.slice(0, 3)) harness.setSlots(userId, 1, now);
  processRankedQueue(harness.nakama, harness.logger, now);

  const matchRecord = harness.collection(MATCH_COLLECTION)[0];
  const match = matchRecord.value as { removed: number };
  match.removed = 1;
  processRankedQueue(harness.nakama, harness.logger, now + 10_000);

  assert.equal(harness.matches.length, 2);
  const assignments = harness.collection(RANKED_ASSIGNMENT_COLLECTION).map(
    (record) => record.value as { state: string }
  );
  assert.equal(assignments.filter((assignment) => assignment.state === "completed").length, 1);
  assert.equal(assignments.filter((assignment) => assignment.state === "active").length, 1);
});

test("expired reservation retries the same assignment and reuses orphaned runtime match", () => {
  const now = 1_700_000_500_000;
  const users = makeUsers(5, "recover");
  const harness = createHarness(users);
  harness.addDailyUsers(5, now);
  for (const userId of users.slice(0, 3)) harness.setSlots(userId, 1, now);
  harness.failNextMatchStorageWrite();

  processRankedQueue(harness.nakama, harness.logger, now);
  assert.equal(harness.matches.length, 1);
  assert.ok(
    harness.collection(RANKED_QUEUE_TICKET_COLLECTION).every(
      (ticket) => (ticket.value as { status: string }).status === "reserved"
    )
  );

  const initialAssignmentId = (harness.collection(RANKED_ASSIGNMENT_COLLECTION)[0].value as { assignmentId: string }).assignmentId;
  processRankedQueue(harness.nakama, harness.logger, now + 60_001);

  assert.equal(harness.matches.length, 1);
  const assignments = harness.collection(RANKED_ASSIGNMENT_COLLECTION).map(
    (record) => record.value as { assignmentId: string; state: string }
  );
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].assignmentId, initialAssignmentId);
  assert.equal(assignments[0].state, "active");
});
