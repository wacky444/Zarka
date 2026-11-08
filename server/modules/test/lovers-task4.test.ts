/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ShopLibrary,
  type PlayerCharacter,
} from "@shared";
import {
  MATCH_COLLECTION,
  MATCH_KEY_PREFIX,
  SERVER_USER_ID,
} from "../src/constants";
import type { MatchRecord } from "../src/models/types";
import { buyShopItemRpc, detectiveRevealedTeamId } from "../src/rpc/buyShopItem";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { tailorMatchForPlayer } from "../src/utils/matchView";

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
  },
};

type StoredMatch = {
  value: MatchRecord;
  version: string;
};

function createTestContext(userId: string): nkruntime.Context {
  return {
    userId,
    username: `${userId}_user`,
    vars: {},
    env: {},
  } as unknown as nkruntime.Context;
}

function createTestLogger(): nkruntime.Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;
}

function createNakama(initialMatch: MatchRecord) {
  const stored: StoredMatch = { value: initialMatch, version: "v1" };
  const fake = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests
        .filter(
          (req) =>
            req.collection === MATCH_COLLECTION &&
            req.key === `${MATCH_KEY_PREFIX}${initialMatch.match_id}` &&
            req.userId === SERVER_USER_ID,
        )
        .map((req) => ({
          collection: req.collection,
          key: req.key,
          userId: req.userId,
          value: stored.value,
          version: stored.version,
          permissionRead: 2,
          permissionWrite: 0,
          createTime: 0,
          updateTime: 0,
        })),
    storageWrite: (writes: nkruntime.StorageWriteRequest[]) =>
      writes.map((w) => {
        if (w.collection === MATCH_COLLECTION) {
          const val = w.value as { match?: MatchRecord } | MatchRecord;
          stored.value = JSON.parse(
            JSON.stringify("match" in val && val.match ? val.match : val),
          ) as MatchRecord;
          stored.version = `v_${Date.now()}`;
        }
        return {
          collection: w.collection,
          key: w.key,
          version: stored.version,
        };
      }),
    storageList: () => ({ objects: [] }),
    storageDelete: () => {},
    matchCreate: () => "match-id",
    matchList: () => [],
    matchSignal: () => "",
  };
  return {
    nk: fake as unknown as nkruntime.Nakama,
    getMatch: () => stored.value,
  };
}

test("detectiveRevealedTeamId returns cover team for Enamorados and Gemelos", () => {
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Enamorados", teamId: "Equipo Rojo" }),
    "Equipo Rojo",
  );
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Gemelos", teamId: "Equipo Azul" }),
    "Equipo Azul",
  );
  assert.equal(
    detectiveRevealedTeamId({ secretTeamId: "Solo", teamId: "Equipo Verde" }),
    "Solo",
  );
  assert.equal(
    detectiveRevealedTeamId({ teamId: "Equipo Amarillo" }),
    "Equipo Amarillo",
  );
});

test("Purchasing Detective on player with secretTeamId: Enamorados returns cover team and awards 10 Zarkans to opposing team", () => {
  const investigator = createDefaultCharacter("investigator");
  investigator.teamId = "Equipo Azul";
  investigator.economy.zarkans = ShopLibrary.detective.cost;

  const target = createDefaultCharacter("target");
  target.teamId = "Equipo Rojo";
  target.secretTeamId = "Enamorados";
  target.economy.zarkans = 0;
  target.economy.pendingZarkans = 0;

  const matchRecord: MatchRecord = {
    match_id: "match-detective-lover-test",
    runtime_match_id: "runtime-match-detective-lover-test",
    players: ["investigator", "target"],
    playerCharacters: { investigator, target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 5,
    started: true,
    removed: 0,
  };

  const { nk, getMatch } = createNakama(matchRecord);
  const ctx = createTestContext("investigator");
  const logger = createTestLogger();

  const responseRaw = buyShopItemRpc(
    ctx,
    logger,
    nk,
    JSON.stringify({
      match_id: matchRecord.match_id,
      shop_id: "detective",
      target_player_id: "target",
    }),
  );

  const response = JSON.parse(responseRaw);
  assert.equal(response.ok, true);
  assert.equal(response.target_team_id, "Equipo Rojo");

  const updatedMatch = getMatch();
  assert.equal(
    updatedMatch.playerCharacters?.investigator?.revealedTeamIdsByPlayerId?.["target"],
    "Equipo Rojo",
  );
  assert.equal(
    updatedMatch.playerCharacters?.target?.economy?.pendingZarkans,
    10,
  );
});

test("Purchasing Detective on target with same cover team awards 0 Zarkans even if both are Enamorados", () => {
  const investigator = createDefaultCharacter("investigator");
  investigator.teamId = "Equipo Rojo";
  investigator.secretTeamId = "Enamorados";
  investigator.economy.zarkans = ShopLibrary.detective.cost;

  const target = createDefaultCharacter("target");
  target.teamId = "Equipo Rojo";
  target.secretTeamId = "Enamorados";
  target.economy.zarkans = 0;
  target.economy.pendingZarkans = 0;

  const matchRecord: MatchRecord = {
    match_id: "match-detective-same-cover-test",
    runtime_match_id: "runtime-match-detective-same-cover-test",
    players: ["investigator", "target"],
    playerCharacters: { investigator, target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 5,
    started: true,
    removed: 0,
  };

  const { nk, getMatch } = createNakama(matchRecord);
  const ctx = createTestContext("investigator");
  const logger = createTestLogger();

  const responseRaw = buyShopItemRpc(
    ctx,
    logger,
    nk,
    JSON.stringify({
      match_id: matchRecord.match_id,
      shop_id: "detective",
      target_player_id: "target",
    }),
  );

  const response = JSON.parse(responseRaw);
  assert.equal(response.ok, true);
  assert.equal(response.target_team_id, "Equipo Rojo");

  const updatedMatch = getMatch();
  assert.equal(
    updatedMatch.playerCharacters?.investigator?.revealedTeamIdsByPlayerId?.["target"],
    "Equipo Rojo",
  );
  assert.equal(
    updatedMatch.playerCharacters?.target?.economy?.pendingZarkans,
    0,
  );
});

test("Purchasing Detective on target with secretTeamId: Gemelos reveals cover team", () => {
  const investigator = createDefaultCharacter("investigator");
  investigator.teamId = "Equipo Azul";
  investigator.economy.zarkans = ShopLibrary.detective.cost;

  const target = createDefaultCharacter("target");
  target.teamId = "Equipo Verde";
  target.secretTeamId = "Gemelos";
  target.economy.zarkans = 0;
  target.economy.pendingZarkans = 0;

  const matchRecord: MatchRecord = {
    match_id: "match-detective-gemelos-test",
    runtime_match_id: "runtime-match-detective-gemelos-test",
    players: ["investigator", "target"],
    playerCharacters: { investigator, target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 5,
    started: true,
    removed: 0,
  };

  const { nk, getMatch } = createNakama(matchRecord);
  const ctx = createTestContext("investigator");
  const logger = createTestLogger();

  const responseRaw = buyShopItemRpc(
    ctx,
    logger,
    nk,
    JSON.stringify({
      match_id: matchRecord.match_id,
      shop_id: "detective",
      target_player_id: "target",
    }),
  );

  const response = JSON.parse(responseRaw);
  assert.equal(response.ok, true);
  assert.equal(response.target_team_id, "Equipo Verde");

  const updatedMatch = getMatch();
  assert.equal(
    updatedMatch.playerCharacters?.investigator?.revealedTeamIdsByPlayerId?.["target"],
    "Equipo Verde",
  );
  assert.equal(
    updatedMatch.playerCharacters?.target?.economy?.pendingZarkans,
    10,
  );
});
