import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RANKED_MATCH_METADATA_KEY,
  type RankedQueueMode
} from "@shared";
import { asyncTurnMatchInit } from "../src/match/async_turn/init";
import { asyncTurnMatchJoinAttempt } from "../src/match/async_turn/joinAttempt";
import { startMatchRpc } from "../src/rpc/startMatch";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { leaveMatchRpc } from "../src/rpc/leaveMatch";
import { updateSettingsRpc } from "../src/rpc/updateSettings";
import { getStateRpc } from "../src/rpc/getState";
import { createRankedMatch } from "../src/services/rankedMatchFactory";

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      PERMISSION_DENIED: 7,
      NOT_FOUND: 5,
      FAILED_PRECONDITION: 9,
      INTERNAL: 13
    }
  }
});

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = {
  id: string;
  username: string;
  metadata: unknown;
};

function createHarness(humanIds: string[]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const matchParams: Array<Record<string, string>> = [];
  const signals: string[] = [];
  let version = 0;
  let runtimeMatchId = 0;
  const keyFor = (request: { collection: string; key: string; userId: string }) =>
    `${request.collection}:${request.userId}:${request.key}`;

  for (const userId of humanIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        zarka: {
          tutorialCompleted: true,
          stats: { elo: 1100 + users.size }
        }
      }
    });
  }

  const nakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const stored = records.get(keyFor(request));
        return stored ? [stored] : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) => {
      for (const request of requests) {
        const key = keyFor(request);
        const current = records.get(key);
        if (request.version !== undefined && request.version !== current?.version) {
          throw new Error("version conflict");
        }
        records.set(key, {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: request.value,
          version: String(++version)
        });
      }
    },
    storageList: (userId: string, collection: string, limit = 100, _cursor = "") => ({
      objects: Array.from(records.values())
        .filter((entry) => entry.userId === userId && entry.collection === collection)
        .slice(0, limit),
      cursor: ""
    }),
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) records.delete(keyFor(request));
    },
    matchCreate: (_handler: string, params: Record<string, string>) => {
      matchParams.push(params);
      return `runtime-${++runtimeMatchId}`;
    },
    matchList: () => ({ matches: [] }),
    matchSignal: (_matchId: string, data: string) => signals.push(data),
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

  return { nakama, logger, records, users, matchParams, signals };
}

function createMatch(
  humanIds: string[],
  botCount: number,
  queueMode: RankedQueueMode,
  assignmentId: string
) {
  const harness = createHarness(humanIds);
  const match = createRankedMatch(
    harness.nakama,
    harness.logger,
    { assignmentId, humanIds, botCount, queueMode },
    1_700_000_000_000
  );
  return { ...harness, match };
}

test("ranked factory starts 8-player human and 16-player bot-filled rosters offline", () => {
  const eightPlayers = createMatch(
    Array.from({ length: 8 }, (_, index) => `human-${index}`),
    0,
    "high_population",
    "assignment-eight"
  );
  assert.equal(eightPlayers.match.started, true);
  assert.equal(eightPlayers.match.size, 8);
  assert.equal(eightPlayers.match.cols, 4);
  assert.equal(eightPlayers.match.rows, 3);
  assert.equal(eightPlayers.match.players.length, 8);
  assert.equal(eightPlayers.match.botPlayers, 0);
  assert.equal(eightPlayers.matchParams[0].ranked, "true");
  assert.equal(eightPlayers.matchParams[0].started, "true");
  assert.equal(eightPlayers.records.size, 2);

  const lowPopulation = createMatch(
    ["low-human-a", "low-human-b", "low-human-c"],
    13,
    "low_population",
    "assignment-low"
  );
  assert.equal(lowPopulation.match.started, true);
  assert.equal(lowPopulation.match.size, 16);
  assert.equal(lowPopulation.match.cols, 5);
  assert.equal(lowPopulation.match.rows, 4);
  assert.equal(lowPopulation.match.players.length, 3);
  assert.equal(lowPopulation.match.botPlayers, 13);
  assert.equal(Object.keys(lowPopulation.match.playerCharacters).length, 16);
  for (const character of Object.values(lowPopulation.match.playerCharacters)) {
    assert.ok(character.position?.coord);
  }
  assert.equal(lowPopulation.match.metadata?.[RANKED_MATCH_METADATA_KEY]?.humanCount, 3);
  assert.equal(lowPopulation.match.metadata?.[RANKED_MATCH_METADATA_KEY]?.botCount, 13);
  assert.equal(
    lowPopulation.match.metadata?.[RANKED_MATCH_METADATA_KEY]?.eloSnapshots["low-human-a"],
    1100
  );
  assert.equal(lowPopulation.records.size, 2);
  const storedMatch = Array.from(lowPopulation.records.values()).find((entry) =>
    entry.collection === "async_turn_matches"
  );
  assert.equal((storedMatch?.value as { started?: boolean }).started, true);
  assert.equal(lowPopulation.signals.length, 1);
});

test("ranked match creator rejects duplicate, invalid, and inconsistent rosters", () => {
  const harness = createHarness(["human-a"]);
  assert.throws(
    () => createRankedMatch(harness.nakama, harness.logger, {
      assignmentId: "bad-duplicate",
      humanIds: ["human-a", "human-a"],
      botCount: 6,
      queueMode: "low_population"
    }),
    /ranked_duplicate_human/
  );
  assert.throws(
    () => createRankedMatch(harness.nakama, harness.logger, {
      assignmentId: "bad-low-roster",
      humanIds: ["human-a", "human-b"],
      botCount: 5,
      queueMode: "low_population"
    }),
    /ranked_invalid_roster_size/
  );
});

test("ranked matches lock roster, settings, and client-controlled starts", () => {
  const created = createMatch(
    ["human-a", "human-b", "human-c", "human-d", "human-e", "human-f", "human-g", "human-h"],
    0,
    "high_population",
    "assignment-lock"
  );
  const matchId = created.match.match_id;

  assert.throws(
    () => joinMatchRpc(
      { userId: "outsider" } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: matchId })
    ),
    { message: "ranked_roster_locked" }
  );
  assert.throws(
    () => leaveMatchRpc(
      { userId: "human-a" } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: matchId })
    ),
    { message: "ranked_roster_locked" }
  );
  assert.throws(
    () => updateSettingsRpc(
      { userId: "human-a" } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: matchId, settings: { size: 16 } })
    ),
    { message: "ranked_settings_locked" }
  );
  assert.throws(
    () => startMatchRpc(
      { userId: "human-a" } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: matchId })
    ),
    { message: "ranked_start_server_only" }
  );

  const state = asyncTurnMatchInit(
    {} as nkruntime.Context,
    created.logger,
    created.nakama,
    { size: "16", ranked: "true", players: JSON.stringify(created.match.players) }
  ).state;
  assert.equal(state.size, 16);
  assert.deepEqual(state.order, created.match.players);
  const normalState = asyncTurnMatchInit(
    {} as nkruntime.Context,
    created.logger,
    created.nakama,
    { size: "16" }
  ).state;
  assert.equal(normalState.size, 8);
});

test("ranked match join attempt accepts assigned users only and get_state hides snapshots", () => {
  const created = createMatch(
    Array.from({ length: 8 }, (_, index) => `roster-${index}`),
    0,
    "high_population",
    "assignment-privacy"
  );
  const state = asyncTurnMatchInit(
    {} as nkruntime.Context,
    created.logger,
    created.nakama,
    {
      size: "8",
      ranked: "true",
      players: JSON.stringify(created.match.players),
      game_id: created.match.match_id
    }
  ).state;
  const assignedAttempt = asyncTurnMatchJoinAttempt(
    { userId: created.match.players[0] } as nkruntime.Context,
    created.logger,
    created.nakama,
    undefined as never,
    1,
    state,
    { userId: created.match.players[0], sessionId: "s", username: "p" } as nkruntime.Presence
  );
  assert.equal(assignedAttempt.accept, true);
  const outsiderAttempt = asyncTurnMatchJoinAttempt(
    { userId: "outsider" } as nkruntime.Context,
    created.logger,
    created.nakama,
    undefined as never,
    1,
    state,
    { userId: "outsider", sessionId: "s2", username: "outsider" } as nkruntime.Presence
  );
  assert.equal(outsiderAttempt.accept, false);
  assert.equal(outsiderAttempt.rejectMessage, "ranked_roster_locked");

  const ownState = JSON.parse(
    getStateRpc(
      { userId: created.match.players[0] } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: created.match.match_id })
    )
  ) as { match?: { metadata?: Record<string, unknown> } };
  assert.equal(ownState.match?.metadata?.[RANKED_MATCH_METADATA_KEY], undefined);
  const outsideState = JSON.parse(
    getStateRpc(
      { userId: "outsider" } as nkruntime.Context,
      created.logger,
      created.nakama,
      JSON.stringify({ match_id: created.match.match_id })
    )
  ) as { error?: string };
  assert.equal(outsideState.error, "forbidden");
});
