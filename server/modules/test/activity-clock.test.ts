import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchRecord, MatchReportReason } from "@shared";
import type { EndGameOutcome } from "../src/match/checkEndGame";
import {
  getConsecutiveAfkTurns,
  getEffectiveLastHumanActionAt,
  getEffectiveLastRosterActivityAt,
  isActiveHumanPlayer,
  isBotControlled,
  isPlayerForfeited,
} from "../src/utils/activityClock";

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
