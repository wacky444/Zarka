import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchCardSummary } from "@shared";
import {
  MATCH_PREVIEW_COLORS,
  createMatchCardClickHandler,
  formatMatchTimeLeft,
  getMatchCardPresentation,
  getMatchTypeBadge
} from "../src/ui/MatchCardModel";

function createMatch(
  status: MatchCardSummary["status"],
  values: Partial<MatchCardSummary> = {}
): MatchCardSummary {
  return {
    match_id: "match-1",
    status,
    isRanked: false,
    size: 18,
    joinedPlayers: 5,
    totalPlayers: 16,
    alivePlayers: 9,
    currentTurn: 11,
    nextAdvanceAtMs: null,
    timeStatus:
      status === "finished"
        ? "finished"
        : status === "waiting"
          ? "not_started"
          : "manual",
    mapPreviewCells: [],
    ...values
  };
}

test("map preview destruction states use distinct green, yellow, and red colors", () => {
  assert.equal(MATCH_PREVIEW_COLORS.safe, 0x4ade80);
  assert.equal(MATCH_PREVIEW_COLORS.scheduled, 0xfacc15);
  assert.equal(MATCH_PREVIEW_COLORS.destroyed, 0xef4444);
});

test("match type badge distinguishes ranked and unranked matches", () => {
  assert.equal(getMatchTypeBadge(true), "R");
  assert.equal(getMatchTypeBadge(false), "UR");
});

test("match card uses status-specific player counts", () => {
  assert.equal(
    getMatchCardPresentation(createMatch("waiting"), 0, {
      isMyMatch: true,
      currentUserReady: false
    }).playerCount,
    "5/18"
  );
  assert.equal(
    getMatchCardPresentation(createMatch("in_progress"), 0, {
      isMyMatch: true,
      currentUserReady: false
    }).playerCount,
    "9/16"
  );
  assert.equal(
    getMatchCardPresentation(createMatch("finished"), 0, {
      isMyMatch: true,
      currentUserReady: false
    }).playerCount,
    "16"
  );
});

test("match card formats countdown as total hours and minutes", () => {
  assert.equal(formatMatchTimeLeft(3 * 60 * 60 * 1000), "03:00");
  assert.equal(formatMatchTimeLeft(100 * 60 * 60 * 1000 + 7 * 60 * 1000), "100:07");
  assert.equal(formatMatchTimeLeft(-1), "00:00");
});

test("play overlay appears only for a not-ready personal active match", () => {
  const waiting = createMatch("waiting");
  assert.equal(
    getMatchCardPresentation(waiting, 0, {
      isMyMatch: true,
      currentUserReady: false
    }).showPlayOverlay,
    true
  );
  for (const options of [
    { isMyMatch: true, currentUserReady: true },
    { isMyMatch: true },
    { isMyMatch: false, currentUserReady: false }
  ]) {
    assert.equal(
      getMatchCardPresentation(waiting, 0, options).showPlayOverlay,
      false
    );
  }
  assert.equal(
    getMatchCardPresentation(createMatch("finished"), 0, {
      isMyMatch: true,
      currentUserReady: false
    }).showPlayOverlay,
    false
  );
});

test("countdown turns urgent only under three hours when current user is not ready", () => {
  const now = 100_000;
  const scheduled = createMatch("in_progress", {
    timeStatus: "scheduled",
    nextAdvanceAtMs: now + 3 * 60 * 60 * 1000 - 1
  });
  assert.equal(
    getMatchCardPresentation(scheduled, now, {
      isMyMatch: true,
      currentUserReady: false
    }).urgentTimeLeft,
    true
  );
  assert.equal(
    getMatchCardPresentation(
      { ...scheduled, nextAdvanceAtMs: now + 3 * 60 * 60 * 1000 },
      now,
      { isMyMatch: true, currentUserReady: false }
    ).urgentTimeLeft,
    false
  );
  assert.equal(
    getMatchCardPresentation(scheduled, now, {
      isMyMatch: true,
      currentUserReady: true
    }).urgentTimeLeft,
    false
  );
  assert.equal(
    getMatchCardPresentation(scheduled, now, {
      isMyMatch: false,
      currentUserReady: false
    }).urgentTimeLeft,
    false
  );
});

test("card click callback receives selected summary", () => {
  const summary = createMatch("waiting");
  let selected: MatchCardSummary | null = null;
  createMatchCardClickHandler(summary, (match) => {
    selected = match;
  })();
  assert.equal(selected, summary);
});
