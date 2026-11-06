import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchRecord, MatchReportReason } from "@shared";
import type { EndGameOutcome } from "../src/match/checkEndGame";
import {
  getConsecutiveAfkTurns,
  getEffectiveLastHumanActionAt,
  getEffectiveLastRosterActivityAt,
  incrementAutoAdvanceAfkCounters,
  isActiveHumanPlayer,
  isBotControlled,
  isPlayerForfeited,
  recordHumanGameplayActivity,
  recordRosterActivity,
} from "../src/utils/activityClock";
import { resolveTurnForMatch } from "../src/match/turnResolution";
import { startMatchRecord } from "../src/match/startMatchRecord";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createMatchRpc } from "../src/rpc/createMatch";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { leaveMatchRpc } from "../src/rpc/leaveMatch";
import { StorageService } from "../src/services/storageService";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";

if (typeof (globalThis as unknown as { nkruntime?: unknown }).nkruntime === "undefined") {
  Object.assign(globalThis, {
    nkruntime: {
      Codes: {
        OK: 0,
        INVALID_ARGUMENT: 3,
        NOT_FOUND: 5,
        PERMISSION_DENIED: 7,
        FAILED_PRECONDITION: 9,
        ABORTED: 10,
        INTERNAL: 13,
      },
    },
  });
}

function createStubMatch(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    match_id: "match_stub",
    players: ["user_1", "bot1"],
    playerCharacters: {},
    playerList: {},
    size: 2,
    created_at: 1000,
    current_turn: 1,
    started: true,
    removed: 0,
    ...overrides,
  } as MatchRecord;
}

test("getEffectiveLastHumanActionAt resolves fallbacks correctly", () => {
  const withAction = createStubMatch({
    created_at: 1000,
    started_at: 1050,
    last_human_action_at: 1200,
  });
  assert.equal(getEffectiveLastHumanActionAt(withAction), 1200);

  const fallbackToStarted = createStubMatch({
    created_at: 1000,
    started_at: 1050,
  });
  assert.equal(getEffectiveLastHumanActionAt(fallbackToStarted), 1050);

  const fallbackToCreated = createStubMatch({
    created_at: 1000,
  });
  assert.equal(getEffectiveLastHumanActionAt(fallbackToCreated), 1000);

  const fallbackToZero = createStubMatch({
    created_at: undefined as unknown as number,
  });
  assert.equal(getEffectiveLastHumanActionAt(fallbackToZero), 0);
});

test("getEffectiveLastRosterActivityAt resolves fallbacks correctly", () => {
  const withRoster = createStubMatch({
    created_at: 1000,
    last_roster_activity_at: 1100,
  });
  assert.equal(getEffectiveLastRosterActivityAt(withRoster), 1100);

  const fallbackToCreated = createStubMatch({
    created_at: 1000,
  });
  assert.equal(getEffectiveLastRosterActivityAt(fallbackToCreated), 1000);

  const fallbackToZero = createStubMatch({
    created_at: undefined as unknown as number,
  });
  assert.equal(getEffectiveLastRosterActivityAt(fallbackToZero), 0);
});

test("getConsecutiveAfkTurns returns counter or default zero", () => {
  const match = createStubMatch({
    consecutive_afk_turns: {
      user_1: 2,
    },
  });
  assert.equal(getConsecutiveAfkTurns(match, "user_1"), 2);
  assert.equal(getConsecutiveAfkTurns(match, "user_2"), 0);

  const emptyMatch = createStubMatch();
  assert.equal(getConsecutiveAfkTurns(emptyMatch, "user_1"), 0);
});

test("isPlayerForfeited returns true only for recorded forfeited players", () => {
  const match = createStubMatch({
    forfeited_players: {
      user_forfeited: true,
      user_not_forfeited: false,
    },
  });
  assert.equal(isPlayerForfeited(match, "user_forfeited"), true);
  assert.equal(isPlayerForfeited(match, "user_not_forfeited"), false);
  assert.equal(isPlayerForfeited(match, "user_unknown"), false);

  const emptyMatch = createStubMatch();
  assert.equal(isPlayerForfeited(emptyMatch, "user_forfeited"), false);
});

test("isBotControlled identifies native bots and forfeited humans", () => {
  const match = createStubMatch({
    forfeited_players: {
      user_forfeited: true,
    },
  });
  assert.equal(isBotControlled(match, "bot1"), true);
  assert.equal(isBotControlled(match, "bot12"), true);
  assert.equal(isBotControlled(match, "BOT5"), true);
  assert.equal(isBotControlled(match, "user_forfeited"), true);
  assert.equal(isBotControlled(match, "user_active"), false);
});

test("isActiveHumanPlayer identifies active non-bot non-forfeited humans", () => {
  const match = createStubMatch({
    forfeited_players: {
      user_forfeited: true,
    },
  });
  assert.equal(isActiveHumanPlayer(match, "user_active"), true);
  assert.equal(isActiveHumanPlayer(match, "user_forfeited"), false);
  assert.equal(isActiveHumanPlayer(match, "bot1"), false);
  assert.equal(isActiveHumanPlayer(match, ""), false);
});

test("contracts accept inactivity_timeout as terminal reason", () => {
  const reportReason: MatchReportReason = "inactivity_timeout";
  assert.equal(reportReason, "inactivity_timeout");

  const endGameOutcome: EndGameOutcome = {
    ended: true,
    reason: "inactivity_timeout",
    aliveCharacterIds: [],
  };
  assert.equal(endGameOutcome.reason, "inactivity_timeout");
});

function createMockHarness() {
  const storage = new Map<string, { value: unknown; version: string }>();
  const signals: Array<{ matchId: string; data: string }> = [];
  const users = new Map<string, unknown>();
  let versionCounter = 0;
  let matchCounter = 0;

  users.set("host-user", { zarka: { tutorialCompleted: true } });
  users.set("guest-user", { zarka: { tutorialCompleted: true } });

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  const fakeNakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((req) => {
        const item = storage.get(`${req.collection}:${req.key}:${req.userId}`);
        return item ? [{ ...item, collection: req.collection, key: req.key, userId: req.userId }] : [];
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
      for (const req of requests) {
        storage.set(`${req.collection}:${req.key}:${req.userId}`, {
          value: JSON.parse(JSON.stringify(req.value)),
          version: String(++versionCounter),
        });
      }
    },
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const req of requests) {
        storage.delete(`${req.collection}:${req.key}:${req.userId}`);
      }
    },
    storageList: () => ({ objects: [] }),
    matchCreate: () => `runtime-${++matchCounter}`,
    matchList: () => ({ matches: [] }),
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
      return "";
    },
    uuidv4: () => `match-${++matchCounter}`,
    usersGetId: (userIds: string[]) =>
      userIds.flatMap((id) => {
        const u = users.get(id);
        return u ? [{ id, username: id, displayName: id, metadata: u }] : [];
      }),
  };

  return {
    logger,
    nk: fakeNakama as unknown as nkruntime.Nakama,
  };
}

test("recordHumanGameplayActivity updates last_human_action_at and resets AFK counter for active human", () => {
  const match = createStubMatch({
    consecutive_afk_turns: { user_1: 3 },
    last_human_action_at: 100,
  });
  recordHumanGameplayActivity(match, "user_1", 200);
  assert.equal(match.last_human_action_at, 200);
  assert.equal(match.consecutive_afk_turns?.user_1, 0);

  recordHumanGameplayActivity(match, "bot1", 300);
  assert.equal(match.last_human_action_at, 200);

  const forfeitedMatch = createStubMatch({
    forfeited_players: { user_forfeited: true },
    consecutive_afk_turns: { user_forfeited: 2 },
    last_human_action_at: 200,
  });
  recordHumanGameplayActivity(forfeitedMatch, "user_forfeited", 400);
  assert.equal(forfeitedMatch.last_human_action_at, 200);
  assert.equal(forfeitedMatch.consecutive_afk_turns?.user_forfeited, 2);
});

test("recordRosterActivity updates last_roster_activity_at", () => {
  const match = createStubMatch();
  recordRosterActivity(match, 500);
  assert.equal(match.last_roster_activity_at, 500);
});

test("incrementAutoAdvanceAfkCounters tracks afk and active human characters correctly", () => {
  const char1 = createDefaultCharacter("user_1");
  const char2 = createDefaultCharacter("user_2");
  const char3 = createDefaultCharacter("user_3");
  const deadChar = createDefaultCharacter("user_dead");
  deadChar.stats.health.current = 0;

  char2.actionPlan = {
    main: { actionId: "move" },
  };

  const match = createStubMatch({
    players: ["user_1", "user_2", "user_3", "user_dead", "bot1"],
    playerCharacters: {
      user_1: char1,
      user_2: char2,
      user_3: char3,
      user_dead: deadChar,
    },
    readyStates: {
      user_1: false,
      user_2: false,
      user_3: true,
      user_dead: false,
    },
    consecutive_afk_turns: {
      user_2: 2,
      user_3: 1,
    },
  });

  const incremented = incrementAutoAdvanceAfkCounters(match);
  assert.deepEqual(incremented, ["user_1"]);
  assert.equal(match.consecutive_afk_turns?.user_1, 1);
  assert.equal(match.consecutive_afk_turns?.user_2, 0);
  assert.equal(match.consecutive_afk_turns?.user_3, 0);
  assert.equal(match.consecutive_afk_turns?.user_dead, undefined);
  assert.equal(match.consecutive_afk_turns?.bot1, undefined);
});

test("startMatchRecord initializes last_human_action_at = started_at", () => {
  const match = createStubMatch({
    started: false,
    started_at: undefined,
    playerCharacters: {
      user_1: createDefaultCharacter("user_1"),
    },
  });
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;
  startMatchRecord(match, logger, 1234000);
  assert.equal(match.started, true);
  assert.equal(match.started_at, 1234);
  assert.equal(match.last_human_action_at, 1234);
});

test("resolveTurnForMatch with isAutoAdvance increments AFK counter before assignAfkActions runs", () => {
  const char1 = createDefaultCharacter("user_1");
  delete char1.actionPlan;

  const match: MatchRecord = {
    match_id: "test-auto-advance-afk",
    players: ["user_1"],
    playerCharacters: {
      user_1: char1,
    },
    playerList: {},
    readyStates: {
      user_1: false,
    },
    size: 1,
    created_at: 1000,
    current_turn: 1,
    started: true,
    removed: 0,
  };

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  const result = resolveTurnForMatch(
    match,
    logger,
    undefined as unknown as nkruntime.Nakama,
    { isAutoAdvance: true }
  );

  assert.equal(result.advanced, true);
  assert.equal(match.consecutive_afk_turns?.user_1, 1);
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === "user_1" &&
        Boolean(event.action?.actionId)
    ),
    true
  );
});

test("createMatchRpc, joinMatchRpc, and leaveMatchRpc update roster activity timestamps", () => {
  const harness = createMockHarness();
  const hostCtx = { userId: "host-user" } as nkruntime.Context;
  const guestCtx = { userId: "guest-user" } as nkruntime.Context;

  const createdRaw = createMatchRpc(hostCtx, harness.logger, harness.nk, JSON.stringify({ size: 3 }));
  const created = JSON.parse(createdRaw) as { match_id: string };

  const storageService = new StorageService(createNakamaWrapper(harness.nk));
  const readAfterCreate = storageService.getMatch(created.match_id);
  assert.ok(readAfterCreate);
  assert.ok(readAfterCreate.match.last_roster_activity_at);
  const initialRosterTime = readAfterCreate.match.last_roster_activity_at;

  joinMatchRpc(hostCtx, harness.logger, harness.nk, JSON.stringify({ match_id: created.match_id }));
  const joinGuestRaw = joinMatchRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: created.match_id }));
  const joinPayload = JSON.parse(joinGuestRaw) as { ok: boolean };
  assert.equal(joinPayload.ok, true);

  const readAfterJoin = storageService.getMatch(created.match_id);
  assert.ok(readAfterJoin);
  assert.ok(readAfterJoin.match.last_roster_activity_at! >= initialRosterTime);

  const joinAgainRaw = joinMatchRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: created.match_id }));
  const joinAgainPayload = JSON.parse(joinAgainRaw) as { ok: boolean };
  assert.equal(joinAgainPayload.ok, true);

  const leaveRaw = leaveMatchRpc(guestCtx, harness.logger, harness.nk, JSON.stringify({ match_id: created.match_id }));
  const leavePayload = JSON.parse(leaveRaw) as { ok: boolean };
  assert.equal(leavePayload.ok, true);

  const readAfterLeave = storageService.getMatch(created.match_id);
  assert.ok(readAfterLeave);
  assert.equal(readAfterLeave.match.players.includes("guest-user"), false);
  assert.equal(readAfterLeave.match.players.includes("host-user"), true);
  assert.ok(readAfterLeave.match.last_roster_activity_at);
});
