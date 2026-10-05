import assert from "node:assert/strict";
import { test } from "node:test";
import { getInitialAutoAdvanceAt } from "../src/utils/autoSkip";

test("match starting after its round time waits for the next day's deadline", () => {
  const startedAtMs = new Date(2026, 5, 18, 23, 50, 0).getTime();

  assert.equal(
    getInitialAutoAdvanceAt("23:00", startedAtMs),
    Math.floor(startedAtMs / 1000),
  );
});

test("match starting before its round time can still auto-advance that day", () => {
  const startedAtMs = new Date(2026, 5, 18, 22, 50, 0).getTime();

  assert.equal(getInitialAutoAdvanceAt("23:00", startedAtMs), undefined);
});

test("invalid round time does not create an auto-advance marker", () => {
  const startedAtMs = new Date(2026, 5, 18, 23, 50, 0).getTime();

  assert.equal(getInitialAutoAdvanceAt("not-a-time", startedAtMs), undefined);
});
