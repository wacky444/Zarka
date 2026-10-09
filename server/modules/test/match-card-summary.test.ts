import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LocalizationType,
  TUTORIAL_MATCH_METADATA_KEY,
  type MatchRecord,
  type PlayerCharacter
} from "@shared";
import { listMatchCardsRpc } from "../src/rpc/listMatchCards";
import { listMyMatchesRpc } from "../src/rpc/listMyMatches";
import {
  buildMatchCardSummary,
  buildMyMatchCardSummary
} from "../src/services/matchCardSummary";

function character(dead = false): PlayerCharacter {
  return {
    id: dead ? "dead" : "alive",
    name: dead ? "Dead" : "Alive",
    stats: {
      health: {
        current: dead ? 0 : 10,
        max: 10,
        knockoutThreshold: 0,
        injuredMax: 10
      },
      energy: { current: 10, max: 10 },
      load: { current: 0, max: 10 },
      speed: 1,
      sympathy: 0,
      baseViewRange: 1
    },
    progression: {
      level: 1,
      experience: 0,
      experienceForNextLevel: 1,
      availableSkillPoints: 0,
      spentSkillPoints: 0
    },
    economy: { zarkans: 0, pendingZarkans: 0, incomeInterval: 0 },
    inventory: { carriedItems: [] },
    abilities: [],
    relationships: {
      confirmedTeammates: [],
      alliances: [],
      representatives: []
    },
    statuses: { conditions: dead ? ["dead"] : [] }
  };
}

function match(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    match_id: "match-1",
    runtime_match_id: "runtime-1",
    players: ["user-1", "user-2"],
    playerCharacters: {
      "user-1": character(),
      "user-2": character(true),
      bot1: character()
    },
    playerList: {},
    readyStates: { "user-1": false, "user-2": true },
    size: 18,
    cols: 4,
    rows: 4,
    roundTime: "23:00",
    autoSkip: true,
    started_at: Math.floor(new Date(2026, 5, 16, 12).getTime() / 1000),
    botPlayers: 1,
    created_at: 1_000,
    current_turn: 3,
    creator: "user-1",
    name: "Sample match",
    started: true,
    removed: 0,
    map: {
      cols: 3,
      rows: 1,
      seed: "seed",
      tiles: [
        {
          id: "safe",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.Road,
          walkable: true,
          meta: { secret: "private" },
          itemIds: ["private-item"]
        },
        {
          id: "scheduled",
          coord: { q: 1, r: 0 },
          localizationType: LocalizationType.House,
          walkable: true,
          meta: { destructionTurn: 4 },
          itemIds: []
        },
        {
          id: "destroyed",
          coord: { q: 2, r: 0 },
          localizationType: LocalizationType.Path,
          walkable: false,
          meta: { destroyed: true, destructionTurn: 2 },
          itemIds: []
        }
      ]
    },
    ...overrides
  };
}

function fakeNakama(matches: MatchRecord[], metadata: unknown = {}) {
  const objects = matches.map((value, index) => ({
    key: `match:${index}`,
    value,
    version: "1",
    permissionRead: 0
  }));
  return {
    storageRead: () => [],
    storageWrite: () => {},
    storageList: (_userId: string, _collection: string, _limit: number, cursor: string) =>
      cursor ? { objects: [], cursor: "" } : { objects, cursor: "" },
    storageDelete: () => {},
    matchCreate: () => "runtime",
    matchList: () => [],
    matchSignal: () => "",
    usersGetId: () => [{ id: "user-1", username: "user-1", metadata }]
  } as unknown as nkruntime.Nakama;
}

test("match summary contains aggregate counts and normalized map preview only", () => {
  const summary = buildMatchCardSummary(
    match(),
    new Date(2026, 5, 18, 12).getTime()
  );

  assert.equal(summary.status, "in_progress");
  assert.equal(summary.joinedPlayers, 2);
  assert.equal(summary.totalPlayers, 2);
  assert.equal(summary.alivePlayers, 1);
  assert.deepEqual(
    summary.mapPreviewCells.map((cell) => cell.destructionState),
    ["safe", "scheduled", "destroyed"]
  );
  assert.equal(summary.timeStatus, "scheduled");
  assert.equal(typeof summary.nextAdvanceAtMs, "number");
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes("readyStates"), false);
  assert.equal(serialized.includes("private-item"), false);
  assert.equal(serialized.includes("private"), false);
});

test("my-match summary returns only caller readiness and normalizes missing to false", () => {
  const value = match();
  assert.equal(buildMyMatchCardSummary(value, "user-2").currentUserReady, true);
  delete value.readyStates?.["user-1"];
  assert.equal(buildMyMatchCardSummary(value, "user-1").currentUserReady, false);
});

test("lobby and finished summaries expose status-appropriate counts and timer states", () => {
  const lobby = buildMatchCardSummary(
    match({ started: false, current_turn: 0, playerCharacters: {} })
  );
  assert.equal(lobby.status, "waiting");
  assert.equal(lobby.joinedPlayers, 2);
  assert.equal(lobby.totalPlayers, 2);
  assert.equal(lobby.timeStatus, "not_started");
  assert.equal(lobby.nextAdvanceAtMs, null);

  const finished = buildMatchCardSummary(
    match({ started: false, removed: 1, autoSkip: false })
  );
  assert.equal(finished.status, "finished");
  assert.equal(finished.totalPlayers, 2);
  assert.equal(finished.timeStatus, "finished");
  assert.equal(finished.nextAdvanceAtMs, null);
});

test("malformed and older match records return safe summary defaults", () => {
  const summary = buildMatchCardSummary(
    match({
      map: undefined,
      players: ["user-1", "user-1", "", null] as unknown as string[],
      current_turn: Number.NaN,
      size: Number.NaN
    })
  );

  assert.equal(summary.joinedPlayers, 1);
  assert.equal(summary.currentTurn, 0);
  assert.equal(summary.size, 0);
  assert.deepEqual(summary.mapPreviewCells, []);
});

test("list_match_cards clamps page size and rejects invalid offsets", () => {
  const matches = Array.from({ length: 51 }, (_, index) =>
    match({ match_id: `match-${index}`, created_at: index })
  );
  const capped = JSON.parse(
    listMatchCardsRpc(
      { userId: "user-1" } as nkruntime.Context,
      {} as nkruntime.Logger,
      fakeNakama(matches),
      JSON.stringify({ limit: 1_000 })
    )
  ) as { matches: unknown[]; nextOffset: number | null };
  assert.equal(capped.matches.length, 50);
  assert.equal(capped.nextOffset, 50);

  const invalid = JSON.parse(
    listMatchCardsRpc(
      { userId: "user-1" } as nkruntime.Context,
      {} as nkruntime.Logger,
      fakeNakama(matches),
      JSON.stringify({ offset: -1 })
    )
  ) as { ok: boolean; error: string };
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, "invalid_pagination");
});

test("list_match_cards paginates active non-tutorial matches without private state", () => {
  const matches = [
    match({ match_id: "new", created_at: 3_000 }),
    match({ match_id: "old", created_at: 1_000 }),
    match({ match_id: "removed", removed: 1 }),
    match({
      match_id: "tutorial",
      metadata: { [TUTORIAL_MATCH_METADATA_KEY]: { version: 1 } }
    })
  ];
  const response = JSON.parse(
    listMatchCardsRpc(
      { userId: "user-1" } as nkruntime.Context,
      {} as nkruntime.Logger,
      fakeNakama(matches),
      JSON.stringify({ offset: 0, limit: 1 })
    )
  ) as {
    ok: boolean;
    matches: Array<Record<string, unknown>>;
    nextOffset: number | null;
  };

  assert.equal(response.ok, true);
  assert.equal(response.matches.length, 1);
  assert.equal(response.matches[0].match_id, "new");
  assert.equal(response.nextOffset, 1);
  assert.equal("currentUserReady" in response.matches[0], false);
  assert.equal("players" in response.matches[0], false);
  assert.equal("playerCharacters" in response.matches[0], false);
  assert.equal("map" in response.matches[0], false);
});

test("list_my_matches includes user limit and sanitized card summary", () => {
  const response = JSON.parse(
    listMyMatchesRpc(
      { userId: "user-1" } as nkruntime.Context,
      {} as nkruntime.Logger,
      fakeNakama([match()], { zarka: { maxCurrentMatches: 7 } }),
      ""
    )
  ) as {
    ok: boolean;
    maxCurrentMatches: number;
    matches: Array<Record<string, unknown>>;
  };

  assert.equal(response.ok, true);
  assert.equal(response.maxCurrentMatches, 7);
  assert.equal(response.matches[0].currentUserReady, false);
  assert.equal(response.matches[0].joinedPlayers, 2);
  assert.equal("readyStates" in response.matches[0], false);
  assert.equal("playerCharacters" in response.matches[0], false);
});
