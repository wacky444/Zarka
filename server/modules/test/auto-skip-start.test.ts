import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInitialAutoAdvanceAt,
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

test("invalid round time does not create an auto-advance marker", () => {
  const startedAtMs = new Date(2026, 5, 18, 23, 50, 0).getTime();

  assert.equal(getInitialAutoAdvanceAt("not-a-time", startedAtMs), undefined);
});
