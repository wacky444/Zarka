import assert from "node:assert/strict";
import { test } from "node:test";
import { RANKED_MATCH_METADATA_KEY } from "@shared";
import { SERVER_USER_ID } from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import { asyncTurnMatchInit } from "../src/match/async_turn/init";
import { restoreMatchesFromStorage } from "../src/services/matchRestoration";

function createRankedRecord(): MatchRecord {
  const players = Array.from({ length: 16 }, (_, index) => `player-${index}`);
  return {
    match_id: "ranked-assignment-restore",
    runtime_match_id: "old-runtime-id",
    players,
    playerCharacters: {},
    playerList: {},
    readyStates: {},
    size: 16,
    created_at: 1,
    current_turn: 2,
    creator: SERVER_USER_ID,
    name: "Ranked match",
    started: true,
    removed: 0,
    metadata: {
      [RANKED_MATCH_METADATA_KEY]: {
        assignmentId: "assignment-restore",
        humanCount: 16,
        botCount: 0,
        queueMode: "high_population",
        eloSnapshots: Object.fromEntries(players.map((player) => [player, 1000]))
      }
    }
  };
}

test("restoration preserves ranked match capacity and roster", () => {
  let storedMatch = createRankedRecord();
  let storedVersion = "version-1";
  let storedPermissionRead = 2;
  let createdParams: Record<string, string> | undefined;
  const storageKey = `match_${storedMatch.match_id}`;
  const nakama = {
    matchList: () => [],
    matchCreate: (_module: string, params: Record<string, string>) => {
      createdParams = params;
      return "new-runtime-id";
    },
    matchSignal: (matchId: string) => {
      if (matchId === "old-runtime-id") {
        throw new Error("old runtime match is inactive");
      }
      return "";
    },
    storageList: () => ({
      objects: [
        {
          key: storageKey,
          collection: "async_turn_matches",
          userId: SERVER_USER_ID,
          value: storedMatch,
          version: storedVersion,
          permissionRead: storedPermissionRead,
          permissionWrite: 0,
          createTime: 1,
          updateTime: 1
        }
      ],
      cursor: ""
    }),
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests.flatMap((request) =>
        request.collection === "async_turn_matches" && request.key === storageKey
          ? [
              {
                key: storageKey,
                collection: "async_turn_matches",
                userId: SERVER_USER_ID,
                value: storedMatch,
                version: storedVersion,
                permissionRead: storedPermissionRead,
                permissionWrite: 0,
                createTime: 1,
                updateTime: 1
              }
            ]
          : []
      ),
    storageWrite: (requests: nkruntime.StorageWriteRequest[]) => {
      for (const request of requests) {
        if (request.collection !== "async_turn_matches") continue;
        assert.equal(request.version, storedVersion);
        storedMatch = request.value as unknown as MatchRecord;
        storedPermissionRead = request.permissionRead ?? storedPermissionRead;
        storedVersion = storedVersion === "version-1" ? "version-2" : "version-3";
      }
      return [];
    },
    storageDelete: () => undefined
  } as unknown as nkruntime.Nakama;
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;

  assert.equal(
    restoreMatchesFromStorage({} as nkruntime.Context, logger, nakama),
    1
  );
  assert.equal(createdParams?.ranked, "true");
  assert.equal(createdParams?.size, "16");
  assert.equal(createdParams?.players, JSON.stringify(storedMatch.players));
  assert.equal(storedMatch.runtime_match_id, "new-runtime-id");
  assert.equal(storedPermissionRead, 0);

  const state = asyncTurnMatchInit(
    {} as nkruntime.Context,
    logger,
    nakama,
    createdParams
  ).state;
  assert.equal(state.size, 16);
  assert.deepEqual(state.order, storedMatch.players);
});
