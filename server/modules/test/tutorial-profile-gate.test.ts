import assert from "node:assert/strict";
import { test } from "node:test";
import { TUTORIAL_BOT_ID, TUTORIAL_MATCH_METADATA_KEY } from "@shared";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";
import { createMatchRpc } from "../src/rpc/createMatch";
import { createTutorialMatchRpc } from "../src/rpc/createTutorialMatch";
import { getUserAccountRpc } from "../src/rpc/getUserAccount";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { listMyMatchesRpc } from "../src/rpc/listMyMatches";
import { createTutorialMatch } from "../src/match/TutorialScenario";
import { asyncTurnMatchJoinAttempt } from "../src/match/async_turn/joinAttempt";
import { finalizeMatchIfEnded } from "../src/match/checkEndGame";
import type { AsyncTurnState, MatchRecord } from "../src/models/types";

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      PERMISSION_DENIED: 7,
      FAILED_PRECONDITION: 9,
      INTERNAL: 13
    }
  }
});

type StoredObject = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = {
  id: string;
  username: string;
  displayName: string;
  metadata: unknown;
};

function createLogger(): nkruntime.Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
}

function createNakamaHarness() {
  const objects = new Map<string, StoredObject>();
  const users = new Map<string, FakeUser>();
  let versionCounter = 0;
  let runtimeCounter = 0;
  let uuidCounter = 0;
  let accountUpdateCount = 0;

  const storageKey = (collection: string, key: string, userId: string) =>
    `${collection}:${key}:${userId}`;
  const fake = {
    storageRead: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) =>
      requests.flatMap((request) => {
        const stored = objects.get(
          storageKey(request.collection, request.key, request.userId)
        );
        return stored ? [stored] : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        userId: string;
        value: unknown;
        version?: string;
      }>
    ) => {
      for (const request of requests) {
        const key = storageKey(
          request.collection,
          request.key,
          request.userId
        );
        const existing = objects.get(key);
        if (
          request.version !== undefined &&
          request.version !== existing?.version
        ) {
          throw new Error("version conflict");
        }
        const stored: StoredObject = {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: request.value,
          version: String(++versionCounter)
        };
        objects.set(key, stored);
      }
    },
    storageList: (
      userId: string,
      collection: string,
      limit = 100,
      _cursor = ""
    ) => ({
      objects: Array.from(objects.values())
        .filter(
          (entry) =>
            entry.userId === userId && entry.collection === collection
        )
        .slice(0, limit),
      cursor: ""
    }),
    storageDelete: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) => {
      for (const request of requests) {
        objects.delete(
          storageKey(request.collection, request.key, request.userId)
        );
      }
    },
    matchCreate: () => `runtime-${++runtimeCounter}`,
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
    uuidv4: () => `match-${++uuidCounter}`,
    usersGetId: (userIds: string[]) =>
      userIds.flatMap((userId) => {
        const user = users.get(userId);
        return user ? [user] : [];
      }),
    accountUpdateId: (...args: unknown[]) => {
      const userId = args[0];
      const metadata = args[7];
      if (typeof userId === "string") {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, metadata });
          accountUpdateCount += 1;
        }
      }
      return undefined;
    }
  };
  const nakama = fake as unknown as nkruntime.Nakama;
  const storage = new StorageService(createNakamaWrapper(nakama));

  return {
    nakama,
    storage,
    setUser(userId: string, metadata: unknown): void {
      users.set(userId, {
        id: userId,
        username: userId,
        displayName: userId,
        metadata
      });
    },
    getUser(userId: string): FakeUser | undefined {
      return users.get(userId);
    },
    get accountUpdateCount(): number {
      return accountUpdateCount;
    }
  };
}

function tutorialError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === "tutorial_incomplete"
  );
}

function realtimeJoin(
  nakama: nkruntime.Nakama,
  logger: nkruntime.Logger,
  matchId: string,
  userId: string
) {
  const state = {
    game_id: matchId,
    players: {},
    order: [],
    size: 2,
    current_turn: 0,
    started: true
  } as unknown as AsyncTurnState;
  return asyncTurnMatchJoinAttempt(
    { userId } as nkruntime.Context,
    logger,
    nakama,
    undefined as never,
    1,
    state,
    { userId, sessionId: "session", username: userId } as nkruntime.Presence
  );
}

test("profile gate blocks normal create and join but exempts tutorial matches", () => {
  const harness = createNakamaHarness();
  const logger = createLogger();
  const userId = "player-incomplete";
  harness.setUser(userId, { zarka: {} });
  const context = { userId } as nkruntime.Context;
  const incompleteProfile = JSON.parse(
    getUserAccountRpc(context, logger, harness.nakama, "")
  ) as { account?: { tutorialCompleted?: boolean } };
  assert.equal(incompleteProfile.account?.tutorialCompleted, false);

  assert.throws(
    () => createMatchRpc(context, logger, harness.nakama, "{}"),
    tutorialError
  );

  const normalMatch = createTutorialMatch({
    matchId: "ordinary-match",
    playerId: "another-player",
    createdAt: 123
  });
  delete normalMatch.metadata;
  normalMatch.started = false;
  normalMatch.players = ["another-player"];
  harness.storage.writeMatch(normalMatch);

  assert.throws(
    () =>
      joinMatchRpc(
        context,
        logger,
        harness.nakama,
        JSON.stringify({ match_id: normalMatch.match_id })
      ),
    tutorialError
  );
  assert.equal(
    realtimeJoin(harness.nakama, logger, normalMatch.match_id, userId).accept,
    false
  );

  const tutorialResponse = JSON.parse(
    createTutorialMatchRpc(context, logger, harness.nakama, "")
  ) as { ok?: boolean; match_id?: string; runtime_match_id?: string };
  assert.equal(tutorialResponse.ok, true);
  assert.equal(typeof tutorialResponse.match_id, "string");
  assert.equal(typeof tutorialResponse.runtime_match_id, "string");
  const tutorialRecord = harness.storage.getMatch(tutorialResponse.match_id!);
  const tutorialMetadata = tutorialRecord?.match.metadata?.[
    TUTORIAL_MATCH_METADATA_KEY
  ] as { type?: string } | undefined;
  assert.equal(tutorialMetadata?.type, "guided_tutorial");
  const ordinaryHistory = JSON.parse(
    listMyMatchesRpc(context, logger, harness.nakama, "")
  ) as { matches?: Array<{ match_id: string }> };
  assert.equal(
    ordinaryHistory.matches?.some(
      (entry) => entry.match_id === tutorialResponse.match_id
    ),
    false
  );

  const tutorialJoin = JSON.parse(
    joinMatchRpc(
      context,
      logger,
      harness.nakama,
      JSON.stringify({ match_id: tutorialResponse.match_id })
    )
  ) as { ok?: boolean };
  assert.equal(tutorialJoin.ok, true);
  assert.equal(
    realtimeJoin(
      harness.nakama,
      logger,
      tutorialResponse.match_id!,
      userId
    ).accept,
    true
  );

  harness.setUser(userId, { zarka: { tutorialCompleted: true } });
  const completedProfile = JSON.parse(
    getUserAccountRpc(context, logger, harness.nakama, "")
  ) as { account?: { tutorialCompleted?: boolean } };
  assert.equal(completedProfile.account?.tutorialCompleted, true);
  const normalCreate = JSON.parse(
    createMatchRpc(context, logger, harness.nakama, "{}")
  ) as { match_id: string };
  const normalJoin = JSON.parse(
    joinMatchRpc(
      context,
      logger,
      harness.nakama,
      JSON.stringify({ match_id: normalCreate.match_id })
    )
  ) as { ok?: boolean };
  assert.equal(normalJoin.ok, true);
  assert.equal(
    realtimeJoin(harness.nakama, logger, normalCreate.match_id, userId).accept,
    true
  );
});

test("authoritative tutorial victory sets completion once and preserves profile data", () => {
  const harness = createNakamaHarness();
  const logger = createLogger();
  const userId = "tutorial-winner";
  const existingCosmetics = { selectedSkinId: { body: "custom-body" } };
  harness.setUser(userId, {
    zarka: {
      tutorialCompleted: false,
      cosmetics: existingCosmetics
    },
    otherSetting: "preserved"
  });
  const match: MatchRecord = createTutorialMatch({
    matchId: "tutorial-completion-test",
    playerId: userId,
    createdAt: 123
  });
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];
  bot.stats.health.current = 0;
  bot.statuses.conditions.push("dead");
  match.deadCharacters = { [TUTORIAL_BOT_ID]: true };

  const first = finalizeMatchIfEnded(
    match,
    harness.nakama,
    logger,
    [],
    1
  );
  assert.equal(first.ended, true);
  const user = harness.getUser(userId);
  const metadata = user?.metadata as {
    otherSetting?: string;
    zarka?: {
      tutorialCompleted?: boolean;
      cosmetics?: unknown;
      stats?: { matchesPlayed?: number };
    };
  };
  assert.equal(metadata.otherSetting, "preserved");
  assert.equal(metadata.zarka?.tutorialCompleted, true);
  assert.deepEqual(metadata.zarka?.cosmetics, existingCosmetics);
  assert.equal(metadata.zarka?.stats?.matchesPlayed, 1);
  assert.equal(harness.accountUpdateCount, 1);

  const repeated = finalizeMatchIfEnded(
    match,
    harness.nakama,
    logger,
    [],
    1
  );
  assert.equal(repeated.ended, false);
  assert.equal(harness.accountUpdateCount, 1);
});
