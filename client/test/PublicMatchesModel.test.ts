import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchCardSummary } from "@shared";
import {
  appendUniquePublicMatches,
  canStartPublicMatchRefresh,
  createPublicMatchSelection,
  isPullDownRefreshGesture,
  openPublicMatchSelection,
  PUBLIC_MATCH_PAGE_SIZE,
  sortPublicMatches
} from "../src/scenes/PublicMatchesModel";

const match = (id: string, status: MatchCardSummary["status"], values: Partial<MatchCardSummary> = {}): MatchCardSummary => ({
  match_id: id,
  status,
  isJoinable: status !== "finished",
  isRanked: false,
  size: 10,
  joinedPlayers: 2,
  totalPlayers: 2,
  alivePlayers: 2,
  currentTurn: 1,
  nextAdvanceAtMs: null,
  timeStatus: status === "in_progress" ? "manual" : status === "finished" ? "finished" : "not_started",
  mapPreviewCells: [],
  ...values
});

test("public refresh cooldown enforces two seconds between requests", () => {
  assert.equal(canStartPublicMatchRefresh(10_000, 11_999), false);
  assert.equal(canStartPublicMatchRefresh(10_000, 12_000), true);
});

test("pull-to-refresh needs downward pull past threshold", () => {
  assert.equal(isPullDownRefreshGesture(100, 171), false);
  assert.equal(isPullDownRefreshGesture(100, 172), true);
  assert.equal(isPullDownRefreshGesture(100, 250), true);
});

test("public match pages append without duplicates and respect bounded page size", () => {
  assert.equal(PUBLIC_MATCH_PAGE_SIZE, 20);
  assert.deepEqual(appendUniquePublicMatches([match("a", "waiting")], [match("a", "waiting"), match("b", "waiting")]).map((item) => item.match_id), ["a", "b"]);
});

test("public sorting puts open matches first then authoritative deadlines and stable identity", () => {
  const ordered = sortPublicMatches([
    match("running", "in_progress", { timeStatus: "scheduled", nextAdvanceAtMs: 50 }),
    match("open-b", "waiting", { name: "Beta" }),
    match("open-a", "waiting", { name: "Alpha" }),
    match("running-soon", "in_progress", { timeStatus: "scheduled", nextAdvanceAtMs: 20 })
  ]);
  assert.deepEqual(ordered.map((item) => item.match_id), ["open-a", "open-b", "running-soon", "running"]);
});

test("public selection reports match and server-provided joinability without readiness assumptions", () => {
  const selected = match("public", "in_progress", { isJoinable: false });
  let callbackMatch: MatchCardSummary | undefined;
  let joinable = true;
  createPublicMatchSelection(selected, (summary, canJoin) => { callbackMatch = summary; joinable = canJoin; })();
  assert.equal(callbackMatch, selected);
  assert.equal(joinable, false);
});

test("public lobby selection joins and opens when server summary allows joining", async () => {
  let joins = 0;
  const result = await openPublicMatchSelection(match("lobby", "waiting"), false, async () => { joins++; return true; });
  assert.equal(result, "opened");
  assert.equal(joins, 1);
});

test("public running-match selection joins when permitted and opens existing member without blocking on full status", async () => {
  let joins = 0;
  const allowed = await openPublicMatchSelection(match("running", "in_progress"), false, async () => { joins++; return true; });
  const existing = await openPublicMatchSelection(match("full-existing", "in_progress", { isJoinable: false }), true, async () => { joins++; return true; });
  assert.equal(allowed, "opened");
  assert.equal(existing, "opened");
  assert.equal(joins, 2);
});

test("public selection rejects stale or server-rejected joins without navigation", async () => {
  let attempts = 0;
  const unavailable = await openPublicMatchSelection(match("full", "waiting", { isJoinable: false }), false, async () => { attempts++; return true; });
  const rejected = await openPublicMatchSelection(match("stale", "waiting"), false, async () => { attempts++; return false; });
  assert.equal(unavailable, "unavailable");
  assert.equal(rejected, "rejected");
  assert.equal(attempts, 1);
});
