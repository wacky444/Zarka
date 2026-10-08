import assert from "node:assert/strict";
import { test } from "node:test";
import { RANKED_MATCH_METADATA_KEY, type RankedMatchMetadata } from "@shared";
import {
  RANKED_ELO_SETTLEMENT_COLLECTION,
  RANKED_MATCH_SETTLEMENT_COLLECTION
} from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import {
  calculateRankedEloDeltas,
  enqueueRankedMatchSettlement,
  processPendingRankedSettlements
} from "../src/match/rankedElo";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = { id: string; username: string; metadata: unknown };

function createHarness(userIds: string[]) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  let version = 0;
  let uuid = 0;
  let failNextAccountUpdate = false;
  const storageKey = (record: { collection: string; userId: string; key: string }) =>
    `${record.collection}:${record.userId}:${record.key}`;
  for (const userId of userIds) {
    users.set(userId, {
      id: userId,
      username: userId,
      metadata: {
        unrelated: { preserve: true },
        zarka: {
          rankedMatchSlots: 2,
          stats: {
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            elo: 1000,
            highestElo: 1000,
            currentWinStreak: 0,
            bestWinStreak: 0,
            rankTier: "unranked"
          }
        }
      }
    });
  }

  const nakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((request) => {
        const record = records.get(storageKey(request));
        return record ? [record] : [];
      }),
    storageWrite: (requests: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) => {
      for (const request of requests) {
        const current = records.get(storageKey(request));
        const expectedVersion = request.version === "" ? undefined : request.version;
        if (request.version !== undefined && expectedVersion !== current?.version) {
          throw new Error("version conflict");
        }
      }
      for (const request of requests) {
        const record: Stored = {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: request.value,
          version: String(++version)
        };
        records.set(storageKey(record), record);
      }
    },
    storageList: (userId: string, collection: string, limit = 100, cursor = "") => {
      const start = Number.parseInt(cursor || "0", 10) || 0;
      const objects = Array.from(records.values()).filter(
        (record) => record.userId === userId && record.collection === collection
      );
      const page = objects.slice(start, start + limit);
      const next = start + limit < objects.length ? String(start + limit) : "";
      return { objects: page, cursor: next };
    },
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const request of requests) records.delete(storageKey(request));
    },
    usersGetId: (ids: string[]) => ids.flatMap((id) => {
      const user = users.get(id);
      return user ? [user] : [];
    }),
    accountUpdateId: (
      userId: string,
      _username: unknown,
      _displayName: unknown,
      _timezone: unknown,
      _location: unknown,
      _langTag: unknown,
      _avatarUrl: unknown,
      metadata: unknown
    ) => {
      if (failNextAccountUpdate) {
        failNextAccountUpdate = false;
        throw new Error("simulated_account_update_failure");
      }
      const user = users.get(userId);
      if (!user) throw new Error("missing user");
      user.metadata = metadata;
    },
    uuidv4: () => `uuid-${++uuid}`
  } as unknown as nkruntime.Nakama;
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
  return {
    nakama,
    logger,
    users,
    records,
    failNextAccountUpdate(): void {
      failNextAccountUpdate = true;
    }
  };
}

function createMatch(
  placements: Array<{ teamId: string; place: number; eliminated: boolean }>,
  humanCount = 2,
  eloSnapshots: Record<string, number> = { a: 1000, b: 1000 }
): MatchRecord {
  const a = createDefaultCharacter("a");
  const b = createDefaultCharacter("b");
  a.teamId = "team-a";
  b.teamId = "team-b";
  const ranked: RankedMatchMetadata = {
    assignmentId: "elo-assignment",
    humanCount,
    botCount: 16 - humanCount,
    queueMode: humanCount >= 8 ? "high_population" : "low_population",
    eloSnapshots,
    placements
  };
  return {
    match_id: "elo-match",
    players: ["a", "b"],
    playerCharacters: { a, b },
    playerList: {},
    readyStates: {},
    size: 16,
    created_at: 1,
    current_turn: 4,
    started: false,
    removed: 1,
    metadata: { [RANKED_MATCH_METADATA_KEY]: ranked }
  };
}

const winnerOutcome = {
  ended: true as const,
  reason: "last_alive" as const,
  winnerId: "a",
  aliveCharacterIds: ["a"]
};

test("ELO uses placement score, frozen team ratings, and population-scaled K", () => {
  const match = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  assert.deepEqual(calculateRankedEloDeltas(match), { a: 2, b: -2 });

  const smallPopulation = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ], 1, { a: 1000, b: 1000 });
  assert.deepEqual(calculateRankedEloDeltas(smallPopulation), { a: 1, b: -1 });

  const frozenRatings = createMatch([
    { teamId: "team-a", place: 2, eliminated: true },
    { teamId: "team-b", place: 1, eliminated: false }
  ], 16, { a: 1200, b: 1000 });
  assert.deepEqual(calculateRankedEloDeltas(frozenRatings), { a: -18, b: 18 });

  const tied = createMatch([
    { teamId: "team-a", place: 1, eliminated: true },
    { teamId: "team-b", place: 1, eliminated: true }
  ]);
  assert.deepEqual(calculateRankedEloDeltas(tied), { a: 0, b: 0 });

  const unequalTeams = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  const secondTeammate = createDefaultCharacter("a2");
  secondTeammate.teamId = "team-a";
  const bot = createDefaultCharacter("bot1");
  bot.teamId = "team-b";
  delete unequalTeams.playerCharacters.b;
  unequalTeams.playerCharacters.a2 = secondTeammate;
  unequalTeams.playerCharacters.bot1 = bot;
  unequalTeams.players = ["a", "a2"];
  const ranked = unequalTeams.metadata![RANKED_MATCH_METADATA_KEY]!;
  ranked.humanCount = 2;
  ranked.botCount = 14;
  ranked.eloSnapshots = { a: 1000, a2: 1000 };
  assert.deepEqual(calculateRankedEloDeltas(unequalTeams), { a: 2, a2: 2 });
});

test("ranked settlement updates rating and match stats once, preserving metadata", () => {
  const harness = createHarness(["a", "b"]);
  const match = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  const now = Date.now();
  enqueueRankedMatchSettlement(match, winnerOutcome, harness.nakama, harness.logger, now);
  enqueueRankedMatchSettlement(match, winnerOutcome, harness.nakama, harness.logger, now + 60_000);

  const a = harness.users.get("a")!.metadata as {
    unrelated: { preserve: boolean };
    zarka: { rankedMatchSlots: number; stats: { elo: number; matchesPlayed: number; wins: number } };
  };
  const b = harness.users.get("b")!.metadata as {
    zarka: { stats: { elo: number; matchesPlayed: number; losses: number } };
  };
  assert.equal(a.zarka.stats.elo, 1002);
  assert.equal(a.zarka.stats.matchesPlayed, 1);
  assert.equal(a.zarka.stats.wins, 1);
  assert.equal(a.zarka.rankedMatchSlots, 2);
  assert.equal(a.unrelated.preserve, true);
  assert.equal(b.zarka.stats.elo, 998);
  assert.equal(b.zarka.stats.matchesPlayed, 1);
  assert.equal(b.zarka.stats.losses, 1);
  assert.equal(
    Array.from(harness.records.values()).filter(
      (record) => record.collection === RANKED_MATCH_SETTLEMENT_COLLECTION
    ).length,
    0,
    "completed batch is removed; per-user ledgers retain idempotency state"
  );
  assert.equal(
    harness.records.size,
    6,
    "two user ledgers, two rating states, and two released locks"
  );
});

test("ratings floor at zero and all-dead results count as draws", () => {
  const floorHarness = createHarness(["a", "b"]);
  const lowRating = floorHarness.users.get("b")!.metadata as {
    zarka: { stats: { elo: number; highestElo: number } };
  };
  lowRating.zarka.stats.elo = 1;
  lowRating.zarka.stats.highestElo = 1000;
  const ranked = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  enqueueRankedMatchSettlement(ranked, winnerOutcome, floorHarness.nakama, floorHarness.logger);
  const bStats = (floorHarness.users.get("b")!.metadata as {
    zarka: { stats: { elo: number; losses: number } };
  }).zarka.stats;
  assert.equal(bStats.elo, 0);
  assert.equal(bStats.losses, 1);

  const drawHarness = createHarness(["a", "b"]);
  const allDead = createMatch([
    { teamId: "team-a", place: 1, eliminated: true },
    { teamId: "team-b", place: 1, eliminated: true }
  ]);
  enqueueRankedMatchSettlement(
    allDead,
    { ended: true, reason: "all_dead", aliveCharacterIds: [] },
    drawHarness.nakama,
    drawHarness.logger
  );
  for (const user of drawHarness.users.values()) {
    const stats = (user.metadata as { zarka: { stats: { wins: number; losses: number; draws: number } } }).zarka.stats;
    assert.deepEqual([stats.wins, stats.losses, stats.draws], [0, 0, 1]);
  }
});

test("concurrent match settlements serialize per user and apply frozen deltas cumulatively", () => {
  const harness = createHarness(["a", "b"]);
  const teamAWin = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  const teamBWin = createMatch([
    { teamId: "team-a", place: 2, eliminated: true },
    { teamId: "team-b", place: 1, eliminated: false }
  ]);
  teamBWin.match_id = "elo-match-2";
  const now = Date.now();
  enqueueRankedMatchSettlement(teamAWin, winnerOutcome, harness.nakama, harness.logger, now);
  enqueueRankedMatchSettlement(
    teamBWin,
    { ...winnerOutcome, winnerId: "b", aliveCharacterIds: ["b"] },
    harness.nakama,
    harness.logger,
    now + 60_000
  );

  const a = harness.users.get("a")!.metadata as {
    zarka: { stats: { elo: number; highestElo: number; matchesPlayed: number };
      rankedRatingSequence: number };
  };
  const b = harness.users.get("b")!.metadata as {
    zarka: { stats: { elo: number; highestElo: number; matchesPlayed: number };
      rankedRatingSequence: number };
  };
  assert.equal(a.zarka.stats.elo, 1000);
  assert.equal(b.zarka.stats.elo, 1000);
  assert.equal(a.zarka.stats.highestElo, 1002);
  assert.equal(b.zarka.stats.highestElo, 1000);
  assert.equal(a.zarka.stats.matchesPlayed, 2);
  assert.equal(b.zarka.stats.matchesPlayed, 2);
  assert.equal(a.zarka.rankedRatingSequence, 2);
  assert.equal(b.zarka.rankedRatingSequence, 2);
});

test("pending ranked settlements recover through coordinator retry", () => {
  const harness = createHarness(["a", "b"]);
  const match = createMatch([
    { teamId: "team-a", place: 1, eliminated: false },
    { teamId: "team-b", place: 2, eliminated: true }
  ]);
  harness.failNextAccountUpdate();
  const now = Date.now();
  enqueueRankedMatchSettlement(match, winnerOutcome, harness.nakama, harness.logger, now);
  assert.equal(
    (harness.users.get("a")!.metadata as { zarka: { stats: { elo: number } } }).zarka.stats.elo,
    1000
  );
  assert.equal(processPendingRankedSettlements(harness.nakama, harness.logger, now + 60_000), 1);
  assert.equal(
    (harness.users.get("a")!.metadata as { zarka: { stats: { elo: number } } }).zarka.stats.elo,
    1002
  );
  const userSettlements = Array.from(harness.records.values()).filter(
    (record) => record.collection === RANKED_ELO_SETTLEMENT_COLLECTION
  );
  assert.equal(userSettlements.length, 2);
  assert.ok(userSettlements.every((entry) => (entry.value as { state: string }).state === "applied"));
  assert.equal(
    Array.from(harness.records.values()).filter(
      (record) => record.collection === RANKED_MATCH_SETTLEMENT_COLLECTION
    ).length,
    0
  );
});
