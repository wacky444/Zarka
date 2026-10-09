import assert from "node:assert/strict";
import { test } from "node:test";
import type { MyMatchCardSummary } from "@shared";
import {
  formatFinishedHeading,
  formatOnlineHeading,
  groupMyMatches,
  sortMyActiveMatches,
  sortMyFinishedMatches,
  toggleSectionCollapse,
  createSelectMatchHandler
} from "../src/scenes/MyMatchesListModel";
import { getMatchCardPresentation } from "../src/ui/MatchCardModel";

function createMyMatch(
  status: MyMatchCardSummary["status"],
  values: Partial<MyMatchCardSummary> = {}
): MyMatchCardSummary {
  return {
    match_id: "match-1",
    status,
    isRanked: false,
    size: 10,
    joinedPlayers: 4,
    totalPlayers: 10,
    alivePlayers: 4,
    currentTurn: 1,
    current_turn: 1,
    created_at: 1000,
    players: ["user-1"],
    currentUserReady: false,
    timeStatus:
      status === "finished"
        ? "finished"
        : status === "waiting"
          ? "not_started"
          : "manual",
    nextAdvanceAtMs: null,
    mapPreviewCells: [],
    ...values
  };
}

test("groupMyMatches separates online and finished matches with correct counts", () => {
  const matches: MyMatchCardSummary[] = [
    createMyMatch("waiting", { match_id: "m-1" }),
    createMyMatch("in_progress", { match_id: "m-2" }),
    createMyMatch("finished", { match_id: "m-3" }),
    createMyMatch("finished", { match_id: "m-4" })
  ];

  const result = groupMyMatches(matches, 8);
  assert.equal(result.onlineMatches.length, 2);
  assert.equal(result.finishedMatches.length, 2);
  assert.equal(result.maxCurrentMatches, 8);
  assert.deepEqual(
    result.onlineMatches.map((m) => m.match_id).sort(),
    ["m-1", "m-2"]
  );
  assert.deepEqual(
    result.finishedMatches.map((m) => m.match_id).sort(),
    ["m-3", "m-4"]
  );
});

test("groupMyMatches defaults maxCurrentMatches to 10 on invalid or missing preference", () => {
  const matches = [createMyMatch("waiting")];
  assert.equal(groupMyMatches(matches, undefined).maxCurrentMatches, 10);
  assert.equal(groupMyMatches(matches, -5).maxCurrentMatches, 10);
  assert.equal(groupMyMatches(matches, "not-a-number").maxCurrentMatches, 10);
});

test("groupMyMatches limits finished matches to the latest 10", () => {
  const matches: MyMatchCardSummary[] = Array.from({ length: 15 }, (_, i) =>
    createMyMatch("finished", {
      match_id: `finished-${i}`,
      created_at: i * 1000
    })
  );

  const result = groupMyMatches(matches, 10);
  assert.equal(result.finishedMatches.length, 10);
  assert.equal(result.finishedMatches[0].match_id, "finished-14");
  assert.equal(result.finishedMatches[9].match_id, "finished-5");
});

test("active matches sort not-ready matches first, then ascending time remaining, then tie-breaker", () => {
  const now = 10_000;
  const notReadyTimedSoon = createMyMatch("in_progress", {
    match_id: "b-soon",
    name: "Beta",
    currentUserReady: false,
    timeStatus: "scheduled",
    nextAdvanceAtMs: now + 5_000
  });
  const notReadyTimedLater = createMyMatch("in_progress", {
    match_id: "a-later",
    name: "Alpha",
    currentUserReady: false,
    timeStatus: "scheduled",
    nextAdvanceAtMs: now + 20_000
  });
  const notReadyUntimed = createMyMatch("waiting", {
    match_id: "c-untimed",
    name: "Gamma",
    currentUserReady: false,
    timeStatus: "not_started",
    nextAdvanceAtMs: null
  });
  const readyTimedSoon = createMyMatch("in_progress", {
    match_id: "d-ready-soon",
    name: "Delta",
    currentUserReady: true,
    timeStatus: "scheduled",
    nextAdvanceAtMs: now + 2_000
  });
  const readyUntimed = createMyMatch("waiting", {
    match_id: "e-ready-untimed",
    name: "Epsilon",
    currentUserReady: true,
    timeStatus: "not_started",
    nextAdvanceAtMs: null
  });

  const sorted = sortMyActiveMatches(
    [
      readyUntimed,
      notReadyTimedLater,
      readyTimedSoon,
      notReadyUntimed,
      notReadyTimedSoon
    ],
    now
  );

  const ids = sorted.map((m) => m.match_id);
  assert.deepEqual(ids, [
    "b-soon",
    "a-later",
    "c-untimed",
    "d-ready-soon",
    "e-ready-untimed"
  ]);
});

test("active match ordering is deterministic and invariant to creator username resolution", () => {
  const now = 5_000;
  const matchA = createMyMatch("waiting", {
    match_id: "m-1",
    name: "Match 1",
    creator: "id-creator-2",
    currentUserReady: false
  });
  const matchB = createMyMatch("waiting", {
    match_id: "m-2",
    name: "Match 2",
    creator: "id-creator-1",
    currentUserReady: false
  });

  const orderBefore = sortMyActiveMatches([matchB, matchA], now).map(
    (m) => m.match_id
  );
  matchA.creator = "Zack";
  matchB.creator = "Alice";
  const orderAfter = sortMyActiveMatches([matchB, matchA], now).map(
    (m) => m.match_id
  );

  assert.deepEqual(orderBefore, orderAfter);
  assert.deepEqual(orderAfter, ["m-1", "m-2"]);
});

test("finished matches sort newest ended/created first", () => {
  const older = createMyMatch("finished", {
    match_id: "m-old",
    name: "Old",
    created_at: 1000,
    ended_at: 2000
  });
  const newer = createMyMatch("finished", {
    match_id: "m-new",
    name: "New",
    created_at: 1000,
    ended_at: 5000
  });

  const sorted = sortMyFinishedMatches([older, newer]);
  assert.deepEqual(sorted.map((m) => m.match_id), ["m-new", "m-old"]);
});

test("collapse state toggles sections independently", () => {
  const initial = { onlineCollapsed: false, finishedCollapsed: false };

  const collapsedOnline = toggleSectionCollapse(initial, "online");
  assert.equal(collapsedOnline.onlineCollapsed, true);
  assert.equal(collapsedOnline.finishedCollapsed, false);

  const bothCollapsed = toggleSectionCollapse(collapsedOnline, "finished");
  assert.equal(bothCollapsed.onlineCollapsed, true);
  assert.equal(bothCollapsed.finishedCollapsed, true);

  const reExpandedOnline = toggleSectionCollapse(bothCollapsed, "online");
  assert.equal(reExpandedOnline.onlineCollapsed, false);
  assert.equal(reExpandedOnline.finishedCollapsed, true);
});

test("readiness indicators: play overlay when not ready, waiting state when ready, none when finished or unknown", () => {
  const activeNotReady = createMyMatch("in_progress", { currentUserReady: false });
  const activeReady = createMyMatch("in_progress", { currentUserReady: true });
  const finishedMatch = createMyMatch("finished", { currentUserReady: false });

  const presNotReady = getMatchCardPresentation(activeNotReady, 0, {
    isMyMatch: true,
    currentUserReady: false
  });
  assert.equal(presNotReady.showPlayOverlay, true);
  assert.equal(presNotReady.showWaitingState, false);

  const presReady = getMatchCardPresentation(activeReady, 0, {
    isMyMatch: true,
    currentUserReady: true
  });
  assert.equal(presReady.showPlayOverlay, false);
  assert.equal(presReady.showWaitingState, true);

  const presFinished = getMatchCardPresentation(finishedMatch, 0, {
    isMyMatch: true,
    currentUserReady: false
  });
  assert.equal(presFinished.showPlayOverlay, false);
  assert.equal(presFinished.showWaitingState, false);

  const presUnknown = getMatchCardPresentation(activeNotReady, 0, {
    isMyMatch: true
  });
  assert.equal(presUnknown.showPlayOverlay, false);
  assert.equal(presUnknown.showWaitingState, false);
});

test("createSelectMatchHandler emits matchId, status, and summary without navigation", () => {
  const match = createMyMatch("in_progress", { match_id: "m-99" });
  let emittedId = "";
  let emittedStatus = "";
  let emittedMatch: MyMatchCardSummary | null = null;

  const handler = createSelectMatchHandler(match, (id, status, m) => {
    emittedId = id;
    emittedStatus = status;
    emittedMatch = m;
  });

  handler();
  assert.equal(emittedId, "m-99");
  assert.equal(emittedStatus, "in_progress");
  assert.equal(emittedMatch, match);
});

test("section headers format counts correctly", () => {
  assert.equal(formatOnlineHeading(3, 10).includes("3/10"), true);
  assert.equal(formatFinishedHeading(5).includes("5"), true);
});

test("resolveMyMatchRoute correctly maps match statuses to view targets", () => {
  assert.equal(resolveMyMatchRoute("waiting"), "lobby");
  assert.equal(resolveMyMatchRoute("in_progress"), "game");
  assert.equal(resolveMyMatchRoute("finished"), "report");
});

test("dispatchMyMatchSelection routes waiting match to lobby", async () => {
  const calls: string[] = [];
  const handlers = {
    openLobby: (id: string) => {
      calls.push(`lobby:${id}`);
    },
    openGame: (id: string) => {
      calls.push(`game:${id}`);
    },
    openReport: (id: string) => {
      calls.push(`report:${id}`);
    }
  };

  const target = await dispatchMyMatchSelection("match-lobby-1", "waiting", handlers);
  assert.equal(target, "lobby");
  assert.deepEqual(calls, ["lobby:match-lobby-1"]);
});

test("dispatchMyMatchSelection routes in_progress match to game/resume", async () => {
  const calls: string[] = [];
  const handlers = {
    openLobby: (id: string) => {
      calls.push(`lobby:${id}`);
    },
    openGame: (id: string) => {
      calls.push(`game:${id}`);
    },
    openReport: (id: string) => {
      calls.push(`report:${id}`);
    }
  };

  const target = await dispatchMyMatchSelection("match-running-1", "in_progress", handlers);
  assert.equal(target, "game");
  assert.deepEqual(calls, ["game:match-running-1"]);
});

test("dispatchMyMatchSelection routes finished match with or without report to report view", async () => {
  const calls: string[] = [];
  const handlers = {
    openLobby: (id: string) => {
      calls.push(`lobby:${id}`);
    },
    openGame: (id: string) => {
      calls.push(`game:${id}`);
    },
    openReport: (id: string) => {
      calls.push(`report:${id}`);
    }
  };

  // Finished match with report
  const targetWithReport = await dispatchMyMatchSelection("match-finished-1", "finished", handlers);
  assert.equal(targetWithReport, "report");

  // Finished match without report still routes to report view (which presents localized unavailable state)
  const targetWithoutReport = await dispatchMyMatchSelection("match-finished-no-rep", "finished", handlers);
  assert.equal(targetWithoutReport, "report");

  assert.deepEqual(calls, [
    "report:match-finished-1",
    "report:match-finished-no-rep"
  ]);
});

test("clicking card never modifies readiness or triggers turn submission", () => {
  const match = createMyMatch("in_progress", {
    match_id: "match-play-1",
    currentUserReady: false,
    currentTurn: 3
  });
  let routeCalled = false;
  const onSelect = (matchId: string, status: string, m: MyMatchCardSummary) => {
    routeCalled = true;
    assert.equal(matchId, "match-play-1");
    assert.equal(status, "in_progress");
    assert.equal(m.currentUserReady, false);
    assert.equal(m.currentTurn, 3);
  };

  const handler = createSelectMatchHandler(match, onSelect);
  handler();
  assert.equal(routeCalled, true);
  // Match state remains immutable upon selection
  assert.equal(match.currentUserReady, false);
  assert.equal(match.currentTurn, 3);
});

