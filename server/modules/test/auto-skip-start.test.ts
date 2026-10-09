import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInitialAutoAdvanceAt,
  getNextAutoAdvanceAtMs,
  hasFirstTurnAutoSkipGraceElapsed
} from "../src/utils/autoSkip";

test("initial auto-advance marker consumes start day before its deadline", () => {
  const startedAtMs = new Date(2026, 5, 18, 11, 30, 0).getTime();

  assert.equal(
    getInitialAutoAdvanceAt("12:00", startedAtMs),
    Math.floor(startedAtMs / 1000)
  );
});

test("initial auto-advance marker consumes start day after its deadline", () => {
  const startedAtMs = new Date(2026, 5, 18, 23, 50, 0).getTime();

  assert.equal(
    getInitialAutoAdvanceAt("23:00", startedAtMs),
    Math.floor(startedAtMs / 1000)
  );
});

test("first turn auto-skip requires more than 24 hours", () => {
  const startedAtMs = new Date(2026, 5, 18, 11, 30, 0).getTime();
  const startedAtSeconds = Math.floor(startedAtMs / 1000);

  assert.equal(
    hasFirstTurnAutoSkipGraceElapsed(0, startedAtSeconds, startedAtMs + 24 * 60 * 60 * 1000),
    false
  );
  assert.equal(
    hasFirstTurnAutoSkipGraceElapsed(
      0,
      startedAtSeconds,
      startedAtMs + 24 * 60 * 60 * 1000 + 1000
    ),
    false
  );
  assert.equal(
    hasFirstTurnAutoSkipGraceElapsed(
      0,
      startedAtSeconds,
      startedAtMs + 24 * 60 * 60 * 1000 + 1001
    ),
    true
  );
  assert.equal(
    hasFirstTurnAutoSkipGraceElapsed(1, startedAtSeconds, startedAtMs),
    true
  );
});

test("next auto-advance uses later state and match round times", () => {
  const now = new Date(2026, 5, 18, 11, 30, 0).getTime();
  const expected = new Date(2026, 5, 18, 13, 0, 0).getTime();

  assert.equal(
    getNextAutoAdvanceAtMs(
      {
        stateRoundTime: "12:00",
        matchRoundTime: "13:00",
        stateAutoSkip: true,
        matchAutoSkip: true,
        currentTurn: 1
      },
      now
    ),
    expected
  );
});

test("past schedule is due now unless match already auto-advanced today", () => {
  const now = new Date(2026, 5, 18, 15, 0, 0).getTime();
  const yesterday = Math.floor(
    new Date(2026, 5, 17, 23, 0, 0).getTime() / 1000
  );
  const today = Math.floor(new Date(2026, 5, 18, 10, 0, 0).getTime() / 1000);
  const schedule = {
    stateRoundTime: "12:00",
    matchRoundTime: "12:00",
    stateAutoSkip: true,
    matchAutoSkip: true,
    currentTurn: 2
  };

  assert.equal(
    getNextAutoAdvanceAtMs(
      { ...schedule, lastAutoAdvanceAtSeconds: yesterday },
      now
    ),
    now
  );
  assert.equal(
    getNextAutoAdvanceAtMs(
      { ...schedule, lastAutoAdvanceAtSeconds: today },
      now
    ),
    new Date(2026, 5, 19, 12, 0, 0).getTime()
  );
});

test("next auto-advance respects first-turn grace", () => {
  const startedAtMs = new Date(2026, 5, 18, 11, 30, 0).getTime();
  const startedAtSeconds = Math.floor(startedAtMs / 1000);
  const now = new Date(2026, 5, 18, 12, 0, 0).getTime();

  assert.equal(
    getNextAutoAdvanceAtMs(
      {
        stateRoundTime: "12:00",
        matchRoundTime: "12:00",
        stateAutoSkip: true,
        matchAutoSkip: true,
        currentTurn: 0,
        startedAtSeconds
      },
      now
    ),
    startedAtMs + 24 * 60 * 60 * 1000 + 1001
  );
});

test("disabled auto-skip has no scheduled deadline", () => {
  assert.equal(
    getNextAutoAdvanceAtMs(
      {
        stateRoundTime: "12:00",
        matchRoundTime: "12:00",
        stateAutoSkip: false,
        matchAutoSkip: false,
        currentTurn: 1
      },
      Date.now()
    ),
    undefined
  );
});

test("invalid round time does not create an auto-advance marker", () => {
  const startedAtMs = new Date(2026, 5, 18, 23, 50, 0).getTime();

  assert.equal(getInitialAutoAdvanceAt("not-a-time", startedAtMs), undefined);
});
