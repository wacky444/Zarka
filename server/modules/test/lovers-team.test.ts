/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ReplayImportance,
  ShopLibrary,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  MATCH_REPORTS_COLLECTION,
  SERVER_USER_ID,
} from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import { startMatchRecord } from "../src/match/startMatchRecord";
import { ENAMORADOS_TEAM_ID, resolveLoversFormation } from "../src/match/lovers";
import { advanceTurn } from "../src/match/advanceTurn";
import { buyShopItemRpc } from "../src/rpc/buyShopItem";
import {
  getEliminatedTeamsByPlayerId,
  tailorMatchForPlayer,
} from "../src/utils/matchView";
import {
  applyHealthDelta,
  createDeathReplayEvent,
} from "../src/match/actions/utils";
import {
  checkEndGameOutcome,
  emitMatchEndedSignal,
  finalizeMatchIfEnded,
} from "../src/match/checkEndGame";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { createStorageService } from "../src/services/storageService";

// Ensure global nkruntime codes are defined
const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
    FAILED_PRECONDITION: 9,
    ABORTED: 10,
    INTERNAL: 13,
  },
};

type Stored = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type FakeUser = {
  id: string;
  username: string;
  metadata: unknown;
};

function createLogger(): nkruntime.Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;
}

function createTestHarness(initialMatch?: MatchRecord, userIds: string[] = []) {
  const records = new Map<string, Stored>();
  const users = new Map<string, FakeUser>();
  const signals: Array<{ matchId: string; data: string }> = [];
  let version = 0;

  const keyOf = (req: { collection: string; key: string; userId: string }) =>
    `${req.collection}:${req.userId}:${req.key}`;

  for (const id of userIds) {
    users.set(id, {
      id,
      username: id,
      metadata: {
        zarka: {
          tutorialCompleted: true,
          stats: { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1000 },
        },
      },
    });
  }

  if (initialMatch) {
    const key = keyOf({
      collection: MATCH_COLLECTION,
      key: `${MATCH_KEY_PREFIX}${initialMatch.match_id}`,
      userId: SERVER_USER_ID,
    });
    records.set(key, {
      collection: MATCH_COLLECTION,
      key: `${MATCH_KEY_PREFIX}${initialMatch.match_id}`,
      userId: SERVER_USER_ID,
      value: initialMatch,
      version: "v1",
    });
  }

  const nakama = {
    storageRead: (requests: Array<{ collection: string; key: string; userId: string }>) =>
      requests.flatMap((req) => {
        const stored = records.get(keyOf(req));
        return stored
          ? [
              {
                collection: stored.collection,
                key: stored.key,
                userId: stored.userId,
                value: stored.value,
                version: stored.version,
                permissionRead: 2,
                permissionWrite: 0,
                createTime: 0,
                updateTime: 0,
              },
            ]
          : [];
      }),
    storageWrite: (writes: Array<{
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version?: string;
    }>) =>
      writes.map((w) => {
        const k = keyOf(w);
        const nextVer = `v_${++version}`;
        records.set(k, {
          collection: w.collection,
          key: w.key,
          userId: w.userId,
          value: w.value,
          version: nextVer,
        });
        return { collection: w.collection, key: w.key, version: nextVer };
      }),
    storageList: (userId: string, collection: string) => ({
      objects: Array.from(records.values()).filter(
        (r) => r.userId === userId && r.collection === collection
      ),
      cursor: "",
    }),
    storageDelete: (requests: Array<{ collection: string; key: string; userId: string }>) => {
      for (const req of requests) records.delete(keyOf(req));
    },
    usersGetId: (ids: string[]) =>
      ids.flatMap((id) => {
        const u = users.get(id);
        return u ? [u] : [];
      }),
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
      return "";
    },
    matchCreate: () => "match-id",
    matchList: () => [],
    uuidv4: () => "uuid-1",
  } as unknown as nkruntime.Nakama;

  const getStoredMatch = (matchId: string): MatchRecord | undefined => {
    const stored = records.get(
      keyOf({
        collection: MATCH_COLLECTION,
        key: `${MATCH_KEY_PREFIX}${matchId}`,
        userId: SERVER_USER_ID,
      })
    );
    if (!stored) return undefined;
    const val = stored.value as { match?: MatchRecord } | MatchRecord;
    return ("match" in val && val.match ? val.match : val) as MatchRecord;
  };

  return {
    nk: nakama,
    records,
    users,
    signals,
    getStoredMatch,
    storage: createStorageService(nakama),
    nkWrapper: createNakamaWrapper(nakama),
  };
}

function makeBasicMatch(overrides?: Partial<MatchRecord>): MatchRecord {
  const p1 = createDefaultCharacter("p1");
  p1.teamId = "Red";
  p1.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };

  const p2 = createDefaultCharacter("p2");
  p2.teamId = "Blue";
  p2.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };

  const p3 = createDefaultCharacter("p3");
  p3.teamId = "Red";
  p3.position = { coord: { q: 2, r: 2 }, tileId: "tile_2_2" };

  const p4 = createDefaultCharacter("p4");
  p4.teamId = "Blue";
  p4.position = { coord: { q: 3, r: 3 }, tileId: "tile_3_3" };

  return {
    match_id: "match_lovers_test",
    runtime_match_id: "runtime_match_lovers_test",
    players: ["p1", "p2", "p3", "p4"],
    playerList: {},
    started: true,
    loversMode: true,
    loversTriggerTurn: 4,
    teams: ["Red", "Blue"],
    current_turn: 4,
    created_at: 1,
    size: 4,
    removed: 0,
    map: {
      columns: 10,
      rows: 10,
      tiles: [
        { id: "tile_0_0", coord: { q: 0, r: 0 }, type: "empty" },
        { id: "tile_2_2", coord: { q: 2, r: 2 }, type: "empty" },
        { id: "tile_3_3", coord: { q: 3, r: 3 }, type: "empty" },
      ],
    },
    playerCharacters: { p1, p2, p3, p4 },
    ...overrides,
  } as unknown as MatchRecord;
}

// -----------------------------------------------------------------------------
// Test 1 — Secret Trigger Turn Initialization
// -----------------------------------------------------------------------------
test("Test 1 — Secret Trigger Turn Initialization: startMatchRecord rolls loversTriggerTurn in [4, 20] when enabled, and undefined when disabled or tutorial", () => {
  const logger = createLogger();

  // 1a: loversMode is true (or omitted) with at least 2 opposing teams
  const matchEnabled = makeBasicMatch({ started: false, loversMode: true });
  delete matchEnabled.loversTriggerTurn;
  startMatchRecord(matchEnabled, logger, 1000);
  assert.equal(typeof matchEnabled.loversTriggerTurn, "number");
  assert.ok(
    matchEnabled.loversTriggerTurn >= 4 && matchEnabled.loversTriggerTurn <= 20,
    `loversTriggerTurn (${matchEnabled.loversTriggerTurn}) must be between 4 and 20`
  );

  // 1b: loversMode is omitted (default)
  const matchOmitted = makeBasicMatch({ started: false });
  delete (matchOmitted as { loversMode?: boolean }).loversMode;
  delete matchOmitted.loversTriggerTurn;
  startMatchRecord(matchOmitted, logger, 1000);
  assert.equal(typeof matchOmitted.loversTriggerTurn, "number");
  assert.ok(
    matchOmitted.loversTriggerTurn >= 4 && matchOmitted.loversTriggerTurn <= 20,
    `loversTriggerTurn (${matchOmitted.loversTriggerTurn}) must be between 4 and 20`
  );

  // 1c: loversMode === false
  const matchDisabled = makeBasicMatch({ started: false, loversMode: false });
  delete matchDisabled.loversTriggerTurn;
  startMatchRecord(matchDisabled, logger, 1000);
  assert.equal(matchDisabled.loversTriggerTurn, undefined);

  // 1d: tutorial match
  const matchTutorial = makeBasicMatch({
    started: false,
    loversMode: true,
    metadata: { [TUTORIAL_MATCH_METADATA_KEY]: { version: 1 } },
  });
  delete matchTutorial.loversTriggerTurn;
  startMatchRecord(matchTutorial, logger, 1000);
  assert.equal(matchTutorial.loversTriggerTurn, undefined);
});

// -----------------------------------------------------------------------------
// Test 2 — Pre-Trigger and Rollover Window (Turns 4–20)
// -----------------------------------------------------------------------------
test("Test 2 — Pre-Trigger and Rollover Window: respects trigger turn, rolls over on later turns, stops after turn 20", () => {
  const logger = createLogger();

  // 2a: With loversTriggerTurn = 7, co-located players on Turn 5 or 6 do not become Lovers
  const matchPreTrigger = makeBasicMatch({ loversTriggerTurn: 7 });
  // p1 and p2 share cell (0, 0)
  const eventsTurn5 = resolveLoversFormation(matchPreTrigger, 5, logger);
  assert.equal(eventsTurn5.length, 0);
  assert.equal(matchPreTrigger.loverPlayerIds, undefined);

  const eventsTurn6 = resolveLoversFormation(matchPreTrigger, 6, logger);
  assert.equal(eventsTurn6.length, 0);
  assert.equal(matchPreTrigger.loverPlayerIds, undefined);

  // 2b: On Turn 7, players are in different cells => no formation
  matchPreTrigger.playerCharacters!.p2.position = {
    coord: { q: 1, r: 1 },
    tileId: "tile_1_1",
  };
  const eventsTurn7 = resolveLoversFormation(matchPreTrigger, 7, logger);
  assert.equal(eventsTurn7.length, 0);
  assert.equal(matchPreTrigger.loverPlayerIds, undefined);

  // On Turn 9, p1 and p2 share cell again => rolls over and forms Enamorados
  matchPreTrigger.playerCharacters!.p2.position = {
    coord: { q: 0, r: 0 },
    tileId: "tile_0_0",
  };
  const eventsTurn9 = resolveLoversFormation(matchPreTrigger, 9, logger);
  assert.equal(eventsTurn9.length, 3); // 2 private lovers_formed + 1 public lovers_announced
  assert.deepEqual(matchPreTrigger.loverPlayerIds, ["p1", "p2"]);
  assert.equal(matchPreTrigger.loversFormedTurn, 9);
  assert.equal(matchPreTrigger.playerCharacters!.p1.secretTeamId, ENAMORADOS_TEAM_ID);
  assert.equal(matchPreTrigger.playerCharacters!.p2.secretTeamId, ENAMORADOS_TEAM_ID);

  // 2c: After Turn 20 (resolvedTurn = 21), resolveLoversFormation never forms Lovers
  const matchTurn21 = makeBasicMatch({ loversTriggerTurn: 7 });
  delete matchTurn21.loverPlayerIds;
  delete matchTurn21.loversFormedTurn;
  const eventsTurn21 = resolveLoversFormation(matchTurn21, 21, logger);
  assert.equal(eventsTurn21.length, 0);
  assert.equal(matchTurn21.loverPlayerIds, undefined);
});

// -----------------------------------------------------------------------------
// Test 3 — Eligibility Exclusions (Gemelos & Same-Team Pairs)
// -----------------------------------------------------------------------------
test("Test 3 — Eligibility Exclusions: excludes Gemelos, same-team pairs, and second formation", () => {
  const logger = createLogger();

  // 3a: A character with secretTeamId: Gemelos never triggers Enamorados
  const matchTwins = makeBasicMatch({ loversTriggerTurn: 4 });
  matchTwins.playerCharacters!.p1.secretTeamId = "Gemelos";
  assert.equal(resolveLoversFormation(matchTwins, 4, logger).length, 0);
  assert.equal(matchTwins.loverPlayerIds, undefined);

  // 3b: Two players with the same teamId sharing a cell never trigger Enamorados
  const matchSameTeam = makeBasicMatch({ loversTriggerTurn: 4 });
  matchSameTeam.playerCharacters!.p2.teamId = "Red"; // p1 is already Red
  assert.equal(resolveLoversFormation(matchSameTeam, 4, logger).length, 0);
  assert.equal(matchSameTeam.loverPlayerIds, undefined);

  // 3c: Once match.loverPlayerIds is populated, a second pair cannot form on later turns
  const matchAlreadyFormed = makeBasicMatch({
    loversTriggerTurn: 4,
    loverPlayerIds: ["p1", "p2"],
    loversFormedTurn: 4,
  });
  // Move p3 and p4 (Red and Blue) to the same cell
  matchAlreadyFormed.playerCharacters!.p3.position = {
    coord: { q: 5, r: 5 },
    tileId: "tile_5_5",
  };
  matchAlreadyFormed.playerCharacters!.p4.position = {
    coord: { q: 5, r: 5 },
    tileId: "tile_5_5",
  };
  const eventsSecondPair = resolveLoversFormation(matchAlreadyFormed, 5, logger);
  assert.equal(eventsSecondPair.length, 0);
  assert.deepEqual(matchAlreadyFormed.loverPlayerIds, ["p1", "p2"]);
});

// -----------------------------------------------------------------------------
// Test 4 — Same-Turn Cooperative Action Unlock (Enamoramiento Order of Events)
// -----------------------------------------------------------------------------
test("Test 4 — Same-Turn Cooperative Action Unlock: Enamoramiento runs before action execution and adds both players to confirmedTeammates", () => {
  const logger = createLogger();

  // 4a: Planned 'give' action targeting the new Lover on the trigger turn
  const matchGive = makeBasicMatch({
    current_turn: 3,
    loversTriggerTurn: 4,
  });
  // p1 carries a bandage and plans give targeting p2
  matchGive.playerCharacters!.p1.inventory.carriedItems = [
    { itemId: "bandage", quantity: 1, weight: 1 },
  ];
  matchGive.playerCharacters!.p1.actionPlan = {
    main: {
      actionId: "give",
      targetPlayerIds: ["p2"],
      targetItemIds: ["bandage"],
    },
  };

  const advanceGiveResult = advanceTurn(matchGive, 4, logger);

  // Verify lovers formed
  assert.deepEqual(matchGive.loverPlayerIds, ["p1", "p2"]);
  assert.ok(
    matchGive.playerCharacters!.p1.relationships.confirmedTeammates.includes("p2")
  );
  assert.ok(
    matchGive.playerCharacters!.p2.relationships.confirmedTeammates.includes("p1")
  );

  // Verify formation event preceded the give action event
  const formedIdx = advanceGiveResult.events.findIndex(
    (e) => e.kind === "player" && e.action.actionId === "lovers_formed"
  );
  const giveIdx = advanceGiveResult.events.findIndex(
    (e) => e.kind === "player" && e.action.actionId === "give"
  );
  assert.ok(formedIdx !== -1, "lovers_formed event must be present");
  assert.ok(giveIdx !== -1, "give action event must be present");
  assert.ok(
    formedIdx < giveIdx,
    `lovers_formed (${formedIdx}) must precede give (${giveIdx})`
  );

  // Verify bandage was transferred from p1 to p2
  const p1Bandages =
    matchGive.playerCharacters!.p1.inventory.carriedItems.find(
      (i) => i.itemId === "bandage"
    )?.quantity ?? 0;
  const p2Bandages =
    matchGive.playerCharacters!.p2.inventory.carriedItems.find(
      (i) => i.itemId === "bandage"
    )?.quantity ?? 0;
  assert.equal(p1Bandages, 0);
  assert.equal(p2Bandages, 1);

  // 4b: Planned 'use_bandage' action targeting the new Lover on the trigger turn
  const matchBandage = makeBasicMatch({
    current_turn: 3,
    loversTriggerTurn: 4,
  });
  matchBandage.playerCharacters!.p2.stats.health = { current: 10, max: 20 };
  matchBandage.playerCharacters!.p1.inventory.carriedItems = [
    { itemId: "bandage", quantity: 1, weight: 1 },
  ];
  matchBandage.playerCharacters!.p1.actionPlan = {
    main: {
      actionId: "use_bandage",
      targetPlayerIds: ["p2"],
    },
  };

  const advanceBandageResult = advanceTurn(matchBandage, 4, logger);
  assert.deepEqual(matchBandage.loverPlayerIds, ["p1", "p2"]);

  const formedBandageIdx = advanceBandageResult.events.findIndex(
    (e) => e.kind === "player" && e.action.actionId === "lovers_formed"
  );
  const bandageIdx = advanceBandageResult.events.findIndex(
    (e) => e.kind === "player" && e.action.actionId === "use_bandage"
  );
  assert.ok(formedBandageIdx !== -1);
  assert.ok(bandageIdx !== -1);
  assert.ok(formedBandageIdx < bandageIdx);
  // Verify p2 was healed (10 + 5 = 15)
  assert.equal(matchBandage.playerCharacters!.p2.stats.health.current, 15);
});

// -----------------------------------------------------------------------------
// Test 5 — Detective Cover Team Preservation
// -----------------------------------------------------------------------------
test("Test 5 — Detective Cover Team Preservation: reveals cover team, stores in revealedTeamIdsByPlayerId, grants 4 pending Zarkans", () => {
  const investigator = createDefaultCharacter("investigator");
  investigator.teamId = "Equipo Rojo";
  investigator.economy.zarkans = ShopLibrary.detective.cost;

  const targetLover = createDefaultCharacter("targetLover");
  targetLover.teamId = "Equipo Azul";
  targetLover.secretTeamId = "Enamorados";
  targetLover.economy.zarkans = 0;
  targetLover.economy.pendingZarkans = 0;

  const matchRecord: MatchRecord = {
    match_id: "match-detective-lover-test",
    runtime_match_id: "runtime-match-detective-lover-test",
    players: ["investigator", "targetLover"],
    playerCharacters: { investigator, targetLover },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 5,
    started: true,
    removed: 0,
  };

  const harness = createTestHarness(matchRecord);
  const ctx = {
    userId: "investigator",
    username: "investigator_user",
    vars: {},
    env: {},
  } as unknown as nkruntime.Context;
  const logger = createLogger();

  const responseRaw = buyShopItemRpc(
    ctx,
    logger,
    harness.nk,
    JSON.stringify({
      match_id: matchRecord.match_id,
      shop_id: "detective",
      target_player_id: "targetLover",
    })
  );

  const response = JSON.parse(responseRaw);
  assert.equal(response.ok, true);
  // Must reveal cover team "Equipo Azul", NOT "Enamorados"
  assert.equal(response.target_team_id, "Equipo Azul");

  const updatedMatch = harness.getStoredMatch(matchRecord.match_id)!;
  // Preserved in revealedTeamIdsByPlayerId
  assert.equal(
    updatedMatch.playerCharacters?.investigator?.revealedTeamIdsByPlayerId?.["targetLover"],
    "Equipo Azul"
  );
  // Awarded 4 pending Zarkans because investigator ("Equipo Rojo") !== target cover ("Equipo Azul")
  assert.equal(
    updatedMatch.playerCharacters?.targetLover?.economy?.pendingZarkans,
    4
  );
});

// -----------------------------------------------------------------------------
// Test 6 — Shared Partner Visibility & Redaction in tailorMatchForPlayer
// -----------------------------------------------------------------------------
test("Test 6 — Shared Partner Visibility & Redaction: strips secret fields for normal viewers, shares partner sight when living", () => {
  const loverA = createDefaultCharacter("loverA");
  loverA.teamId = "Equipo Rojo";
  loverA.secretTeamId = "Enamorados";
  loverA.position = { coord: { q: 0, r: 0 }, tileId: "tile_0_0" };
  loverA.stats.baseViewRange = 2;
  loverA.relationships = { confirmedTeammates: ["loverB"] };

  const loverB = createDefaultCharacter("loverB");
  loverB.teamId = "Equipo Azul";
  loverB.secretTeamId = "Enamorados";
  loverB.position = { coord: { q: 10, r: 10 }, tileId: "tile_10_10" };
  loverB.stats.baseViewRange = 2;
  loverB.relationships = { confirmedTeammates: ["loverA"] };
  loverB.discoveredItemIds = ["item_far_away"];

  const enemyC = createDefaultCharacter("enemyC");
  enemyC.teamId = "Equipo Verde";
  // Distance 1 from loverB, but distance > 10 from loverA
  enemyC.position = { coord: { q: 11, r: 10 }, tileId: "tile_11_10" };

  const spectator = createDefaultCharacter("spectator");
  spectator.teamId = "Equipo Amarillo";
  spectator.position = { coord: { q: 20, r: 20 }, tileId: "tile_20_20" };

  const match: MatchRecord = {
    match_id: "match-tailor-lovers-test",
    players: ["loverA", "loverB", "enemyC", "spectator"],
    playerCharacters: { loverA, loverB, enemyC, spectator },
    playerList: {},
    started: true,
    loversMode: true,
    loversTriggerTurn: 4,
    loversFormedTurn: 4,
    loverPlayerIds: ["loverA", "loverB"],
    teams: ["Equipo Rojo", "Equipo Azul", "Equipo Verde", "Equipo Amarillo"],
    current_turn: 5,
    created_at: 1,
    size: 4,
    removed: 0,
    items: [
      {
        item_id: "item_far_away",
        item_type: "pistol",
        coord: { q: 11, r: 11 },
      } as any,
    ],
  };

  // 6a: Normal spectator view strips loversTriggerTurn, loversFormedTurn, loverPlayerIds
  const tailoredForSpectator = tailorMatchForPlayer(match, "spectator", false);
  assert.equal((tailoredForSpectator as any).loversTriggerTurn, undefined);
  assert.equal((tailoredForSpectator as any).loversFormedTurn, undefined);
  assert.equal((tailoredForSpectator as any).loverPlayerIds, undefined);

  // 6b: Living Lover A receives partner Lover B, enemy C (in Lover B's sight), and item_far_away (discovered by Lover B)
  const tailoredForLoverA = tailorMatchForPlayer(match, "loverA", false);
  assert.ok(
    tailoredForLoverA.playerCharacters["loverB"],
    "Partner Lover B must be included in Lover A's tailored view"
  );
  assert.ok(
    tailoredForLoverA.playerCharacters["enemyC"],
    "Enemy C in partner Lover B's sight must be visible to Lover A"
  );
  assert.ok(
    tailoredForLoverA.items?.some((i) => i.item_id === "item_far_away"),
    "Discovered item in partner's knowledge must be visible to Lover A"
  );

  // 6c: When Lover B dies, shared sight stops
  loverB.stats.health.current = 0;
  loverB.statuses.conditions = ["dead"];
  const tailoredDeadPartner = tailorMatchForPlayer(match, "loverA", false);
  assert.equal(
    tailoredDeadPartner.playerCharacters["enemyC"],
    undefined,
    "Enemy C must NOT be visible to Lover A when partner Lover B is deceased"
  );
});

// -----------------------------------------------------------------------------
// Test 7 — Lover Death Event & Enamorados Victory
// -----------------------------------------------------------------------------
test("Test 7 — Lover Death Event & Enamorados Victory: status_dead contains wasLover: true, getEliminatedTeamsByPlayerId maps to Enamorados, finalizeMatchIfEnded includes both Lovers in winnerIds", () => {
  const logger = createLogger();

  // 7a: Lover death event metadata & getEliminatedTeamsByPlayerId mapping
  const deadLover = createDefaultCharacter("loverDead");
  deadLover.teamId = "Equipo Azul";
  deadLover.secretTeamId = ENAMORADOS_TEAM_ID;
  deadLover.stats.health = { current: 3, max: 20 };

  const deathOutcome = applyHealthDelta(deadLover, -10, true);
  assert.equal(deathOutcome.result.dead, true);
  assert.ok(deathOutcome.event);
  assert.equal(deathOutcome.event.action.actionId, "status_dead");
  assert.deepEqual(deathOutcome.event.action.metadata, {
    teamId: ENAMORADOS_TEAM_ID,
    wasLover: true,
  });

  // Verify getEliminatedTeamsByPlayerId maps deceased Lover to "Enamorados"
  const eliminatedMap = getEliminatedTeamsByPlayerId({
    loverDead: deathOutcome.character,
    livingOther: createDefaultCharacter("livingOther"),
  });
  assert.equal(eliminatedMap["loverDead"], ENAMORADOS_TEAM_ID);
  assert.equal(eliminatedMap["livingOther"], undefined);

  // 7b: Match ends with Enamorados victory: finalizeMatchIfEnded & winnerIds includes both Lovers
  const livingLover = createDefaultCharacter("lover1");
  livingLover.teamId = "Equipo Rojo";
  livingLover.secretTeamId = ENAMORADOS_TEAM_ID;
  livingLover.stats.health = { current: 15, max: 20 };
  livingLover.relationships = { confirmedTeammates: ["lover2"] };

  const deceasedLover = createDefaultCharacter("lover2");
  deceasedLover.teamId = "Equipo Azul";
  deceasedLover.secretTeamId = ENAMORADOS_TEAM_ID;
  deceasedLover.stats.health = { current: 0, max: 20 };
  deceasedLover.statuses.conditions = ["dead"];
  deceasedLover.relationships = { confirmedTeammates: ["lover1"] };

  const deadEnemy = createDefaultCharacter("enemy1");
  deadEnemy.teamId = "Equipo Verde";
  deadEnemy.stats.health = { current: 0, max: 20 };
  deadEnemy.statuses.conditions = ["dead"];

  const endgameMatch: MatchRecord = {
    match_id: "match-lovers-victory-test",
    runtime_match_id: "runtime-lovers-victory-test",
    players: ["lover1", "lover2", "enemy1"],
    playerCharacters: {
      lover1: livingLover,
      lover2: deceasedLover,
      enemy1: deadEnemy,
    },
    playerList: {},
    started: true,
    loversMode: true,
    loversTriggerTurn: 4,
    loversFormedTurn: 4,
    loverPlayerIds: ["lover1", "lover2"],
    teams: ["Equipo Rojo", "Equipo Azul", "Equipo Verde"],
    current_turn: 8,
    created_at: 1,
    size: 3,
    removed: 0,
  };

  const harness = createTestHarness(endgameMatch, ["lover1", "lover2", "enemy1"]);

  // Verify checkEndGameOutcome detects victory
  const outcome = checkEndGameOutcome(endgameMatch);
  assert.equal(outcome.ended, true);
  assert.equal(outcome.reason, "last_alive");
  assert.equal((outcome as { winnerId?: string }).winnerId, "lover1");

  // Call finalizeMatchIfEnded
  const finalOutcome = finalizeMatchIfEnded(
    endgameMatch,
    harness.nk,
    logger,
    [],
    endgameMatch.current_turn
  );
  assert.equal(finalOutcome.ended, true);
  assert.equal(endgameMatch.removed, 1);

  // Verify report in storage contains Enamorados victory with both Lover player IDs
  const report = harness.storage.getMatchReport(endgameMatch.match_id);
  assert.ok(report, "Match report must be written to storage");
  const winningTeam = report.teams.find((t) => t.team_id === ENAMORADOS_TEAM_ID);
  assert.ok(winningTeam, "Enamorados team must be present in report");
  assert.equal(winningTeam.won, true, "Enamorados team must have won: true");
  assert.ok(
    winningTeam.player_ids.includes("lover1") &&
      winningTeam.player_ids.includes("lover2"),
    "Enamorados team players must include both living and deceased Lovers"
  );

  // Verify emitMatchEndedSignal broadcasts signal with winnerIds containing both Lovers
  emitMatchEndedSignal(harness.nkWrapper, endgameMatch, finalOutcome);
  assert.equal(harness.signals.length, 1);
  const broadcastSignal = JSON.parse(harness.signals[0].data);
  assert.equal(broadcastSignal.type, "match_ended");
  assert.equal(broadcastSignal.winnerId, "lover1");
  assert.ok(
    Array.isArray(broadcastSignal.winnerIds),
    "winnerIds must be an array"
  );
  assert.ok(
    broadcastSignal.winnerIds.includes("lover1") &&
      broadcastSignal.winnerIds.includes("lover2"),
    `winnerIds (${JSON.stringify(broadcastSignal.winnerIds)}) must contain both lover1 and lover2`
  );
  assert.equal(
    broadcastSignal.winnerIds.includes("enemy1"),
    false,
    "winnerIds must not include enemy1"
  );
});
