import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchReport, ReplayRecord } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { getReplayRpc } from "../src/rpc/getReplay";
import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  MATCH_REPORT_COLLECTION,
  MATCH_REPORT_KEY_PREFIX,
  REPLAY_COLLECTION,
  SERVER_USER_ID,
} from "../src/constants";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
  },
};

const MATCH_ID = "report-replay-match";
const VIEWER_ID = "viewer";
const HIDDEN_EVENT = {
  kind: "player",
  actorId: "other-player",
  action: { actionId: "status_hidden" },
  visibility: { scope: "limited", playerIds: ["other-player"] },
} as const;

function createHarness(reportAvailable: boolean) {
  const match = {
    match_id: MATCH_ID,
    players: [VIEWER_ID, "other-player"],
    playerCharacters: {},
    current_turn: 1,
  } as MatchRecord;
  const replay = {
    match_id: MATCH_ID,
    turn: 1,
    events: [HIDDEN_EVENT],
    snapshot: {
      c4s: [
        {
          id: "hidden-c4",
          ownerId: "other-player",
          tileId: "tile-hidden",
          coord: { q: 2, r: 0 },
          placedTurn: 1,
        },
      ],
    },
    created_at: 1,
  } as unknown as ReplayRecord;
  const fake = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) => {
        if (
          request.collection === MATCH_COLLECTION &&
          request.key === `${MATCH_KEY_PREFIX}${MATCH_ID}`
        ) {
          return [{
            collection: request.collection,
            key: request.key,
            userId: SERVER_USER_ID,
            value: match,
            version: "match-v1",
            permissionRead: 2,
            permissionWrite: 0,
            createTime: 0,
            updateTime: 0,
          }];
        }
        if (
          request.collection === MATCH_REPORT_COLLECTION &&
          request.key === `${MATCH_REPORT_KEY_PREFIX}${MATCH_ID}` &&
          reportAvailable
        ) {
          return [{
            collection: request.collection,
            key: request.key,
            userId: SERVER_USER_ID,
            value: { match_id: MATCH_ID } as MatchReport,
            version: "report-v1",
            permissionRead: 2,
            permissionWrite: 0,
            createTime: 0,
            updateTime: 0,
          }];
        }
        if (request.collection === REPLAY_COLLECTION) {
          return [{
            collection: request.collection,
            key: request.key,
            userId: SERVER_USER_ID,
            value: replay,
            version: "replay-v1",
            permissionRead: 2,
            permissionWrite: 0,
            createTime: 0,
            updateTime: 0,
          }];
        }
        return [];
      }),
    storageWrite: () => [],
    storageList: () => ({ objects: [], cursor: "" }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
    usersGetId: (userIds: string[]) =>
      userIds.includes("admin")
        ? [{ id: "admin", metadata: { admin: true } }]
        : [],
  } as unknown as nkruntime.Nakama;
  const logger = {} as nkruntime.Logger;
  return { nk: fake, logger };
}

function callReplay(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  fullReplay: boolean,
): string {
  return getReplayRpc(
    { userId } as nkruntime.Context,
    logger,
    nk,
    JSON.stringify({ match_id: MATCH_ID, turn: 1, full_replay: fullReplay }),
  );
}

test("finished-match report viewers can load unfiltered replay events and snapshots", () => {
  const { nk, logger } = createHarness(true);
  const result = JSON.parse(callReplay(nk, logger, VIEWER_ID, true)) as {
    events: unknown[];
    snapshot: unknown;
  };

  assert.deepEqual(result.events, [HIDDEN_EVENT]);
  assert.deepEqual(result.snapshot, {
    c4s: [
      {
        id: "hidden-c4",
        ownerId: "other-player",
        tileId: "tile-hidden",
        coord: { q: 2, r: 0 },
        placedTurn: 1,
      },
    ],
  });
});

test("full replay request remains tailored until match report exists", () => {
  const { nk, logger } = createHarness(false);
  const result = JSON.parse(callReplay(nk, logger, VIEWER_ID, true)) as {
    events: unknown[];
    snapshot?: { c4s?: unknown[] };
  };

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.snapshot?.c4s, []);
});

test("admin report viewers can load full replay", () => {
  const { nk, logger } = createHarness(true);
  const result = JSON.parse(callReplay(nk, logger, "admin", true)) as {
    events: unknown[];
  };

  assert.deepEqual(result.events, [HIDDEN_EVENT]);
});

test("nonparticipants cannot use report replay access", () => {
  const { nk, logger } = createHarness(true);
  let errorCode: number | undefined;
  try {
    callReplay(nk, logger, "outsider", true);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      errorCode = (error as { code?: number }).code;
    }
  }

  assert.equal(errorCode, 7);
});
