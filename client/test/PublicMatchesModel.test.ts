import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchCardSummary } from "@shared";
import { appendUniquePublicMatches, createPublicMatchSelection, PUBLIC_MATCH_PAGE_SIZE, sortPublicMatches } from "../src/scenes/PublicMatchesModel";

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
