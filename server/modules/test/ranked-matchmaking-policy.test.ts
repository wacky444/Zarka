import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRankedBotFillCount,
  getRankedEloSearchRange,
  getRankedMapDimensions,
  getRankedQueuePolicy
} from "../src/matchmaking/policy";

test("low-population policy requires half the daily users, with minimum two", () => {
  assert.equal(getRankedQueuePolicy(1, 0), null);
  assert.deepEqual(getRankedQueuePolicy(2, 0), {
    mode: "low_population",
    requiredHumans: 2
  });
  assert.deepEqual(getRankedQueuePolicy(5, 0), {
    mode: "low_population",
    requiredHumans: 3
  });
  assert.equal(getRankedBotFillCount(5, 2, 0), null);
  assert.equal(getRankedBotFillCount(5, 3, 0), 13);
  assert.equal(getRankedQueuePolicy(5.9, 0)?.requiredHumans, 3);
});

test("high-population threshold drops every 90 minutes to a floor of eight", () => {
  assert.equal(getRankedQueuePolicy(16, 0)?.requiredHumans, 16);
  assert.equal(getRankedQueuePolicy(16, 6 * 60 * 60)?.requiredHumans, 12);
  assert.equal(getRankedQueuePolicy(16, 12 * 60 * 60)?.requiredHumans, 8);
  assert.equal(getRankedQueuePolicy(16, 24 * 60 * 60)?.requiredHumans, 8);
  assert.equal(getRankedQueuePolicy(16, 6 * 60 * 60 - 0.1)?.requiredHumans, 13);
  assert.equal(getRankedBotFillCount(16, 16, 0), 0);
});

test("ELO search range expands in 90-minute steps", () => {
  assert.equal(getRankedEloSearchRange(0), 200);
  assert.equal(getRankedEloSearchRange(5_399.9), 200);
  assert.equal(getRankedEloSearchRange(5_400), 250);
  assert.equal(getRankedEloSearchRange(10_800), 300);
  assert.equal(getRankedEloSearchRange(-1), 200);
  assert.equal(getRankedEloSearchRange(Number.POSITIVE_INFINITY), 200);
});

test("ranked map dimensions follow the tile budget formula", () => {
  assert.deepEqual(getRankedMapDimensions(8), { cols: 4, rows: 3 });
  assert.deepEqual(getRankedMapDimensions(16), { cols: 5, rows: 4 });
  assert.throws(() => getRankedMapDimensions(0), RangeError);
  assert.throws(() => getRankedMapDimensions(8.5), RangeError);
  assert.throws(() => getRankedMapDimensions(17), RangeError);
});
