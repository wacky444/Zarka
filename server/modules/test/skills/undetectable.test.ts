/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  SkillLibrary,
  getSkillEffectTotal,
  isCharacterUndetectable,
  type PlayerCharacter,
  type UpgradeSkillPayload,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeDetectAction } from "../../src/match/actions/detect";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import { upgradeSkillRpc } from "../../src/rpc/upgradeSkill";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    OK: 0,
    CANCELED: 1,
    UNKNOWN: 2,
    INVALID_ARGUMENT: 3,
    DEADLINE_EXCEEDED: 4,
    NOT_FOUND: 5,
    ALREADY_EXISTS: 6,
    PERMISSION_DENIED: 7,
    RESOURCE_EXHAUSTED: 8,
    FAILED_PRECONDITION: 9,
    ABORTED: 10,
    OUT_OF_RANGE: 11,
    UNIMPLEMENTED: 12,
    INTERNAL: 13,
    UNAVAILABLE: 14,
    DATA_LOSS: 15,
    UNAUTHENTICATED: 16,
  },
};

function createMatchWithCharacters(
  actor: PlayerCharacter,
  targets: PlayerCharacter[]
): MatchRecord {
  const allCharacters = [actor, ...targets];
  return {
    match_id: "detect-test",
    players: allCharacters.map((c) => c.id),
    playerCharacters: Object.fromEntries(allCharacters.map((c) => [c.id, c])),
    playerList: {},
    size: allCharacters.length,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    items: [],
  };
}

test("Undetectable is defined in SkillLibrary with correct properties", () => {
  assert.equal(SkillLibrary.undetectable.implemented, true);
  assert.equal(SkillLibrary.undetectable.cost, 4);
  assert.equal(SkillLibrary.undetectable.max, 1);
  assert.equal(SkillLibrary.undetectable.category, "defense");
  assert.equal(SkillLibrary.undetectable.effect?.type, "detect_immunity");
  assert.equal(SkillLibrary.undetectable.effect?.value, 1);
});

test("isCharacterUndetectable checks abilities and effect system", () => {
  const regular = createDefaultCharacter("regular");
  assert.equal(isCharacterUndetectable(regular), false);

  const undetectableChar = createDefaultCharacter("undetectable-char");
  undetectableChar.abilities = ["undetectable"];
  assert.equal(isCharacterUndetectable(undetectableChar), true);
  assert.equal(getSkillEffectTotal(undetectableChar, "detect_immunity"), 1);
});

test("detect action reveals detectable nearby players but skips undetectable players", () => {
  const actor = createDefaultCharacter("actor");
  actor.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };

  const detectableTarget = createDefaultCharacter("detectable");
  detectableTarget.position = { tileId: "hex_1_0", coord: { q: 1, r: 0 } };

  const undetectableTarget = createDefaultCharacter("hidden-target");
  undetectableTarget.abilities = ["undetectable"];
  undetectableTarget.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };

  const match = createMatchWithCharacters(actor, [
    detectableTarget,
    undetectableTarget,
  ]);

  const participant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.detect.id,
    },
    planKey: "main" as const,
  };

  const events = executeDetectAction([participant], match);
  assert.equal(events.length, 1);

  const detectEvent = events[0];
  assert.equal(detectEvent.actorId, actor.id);
  assert.equal(detectEvent.action.metadata?.detectedCount, 1);
  assert.ok(detectEvent.targets);
  assert.equal(detectEvent.targets.length, 1);
  assert.equal(detectEvent.targets[0].targetId, detectableTarget.id);
});

test("detect action reports 0 detected players when all targets in range are undetectable", () => {
  const actor = createDefaultCharacter("actor");
  actor.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };

  const undetectable1 = createDefaultCharacter("undetectable1");
  undetectable1.abilities = ["undetectable"];
  undetectable1.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };

  const undetectable2 = createDefaultCharacter("undetectable2");
  undetectable2.abilities = ["undetectable"];
  undetectable2.position = { tileId: "hex_1_0", coord: { q: 1, r: 0 } };

  const match = createMatchWithCharacters(actor, [
    undetectable1,
    undetectable2,
  ]);

  const participant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.detect.id,
    },
    planKey: "main" as const,
  };

  const events = executeDetectAction([participant], match);
  assert.equal(events.length, 1);

  const detectEvent = events[0];
  assert.equal(detectEvent.action.metadata?.detectedCount, 0);
  assert.equal(detectEvent.targets, undefined);
});

test("detect with extra execution reaches distance 2 but ignores undetectable targets at range 2", () => {
  const actor = createDefaultCharacter("actor");
  actor.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  actor.stats.energy.current = 10;

  const detectableAt2 = createDefaultCharacter("detectable-2");
  detectableAt2.position = { tileId: "hex_2_0", coord: { q: 2, r: 0 } };

  const undetectableAt2 = createDefaultCharacter("undetectable-2");
  undetectableAt2.abilities = ["undetectable"];
  undetectableAt2.position = { tileId: "hex_0_2", coord: { q: 0, r: 2 } };

  const match = createMatchWithCharacters(actor, [
    detectableAt2,
    undetectableAt2,
  ]);

  const participant = {
    playerId: actor.id,
    character: actor,
    plan: {
      actionId: ActionLibrary.detect.id,
      extraExecutions: 1,
    },
    planKey: "main" as const,
  };

  const events = executeDetectAction([participant], match);
  assert.equal(events.length, 1);

  const detectEvent = events[0];
  assert.equal(detectEvent.action.metadata?.detectedCount, 1);
  assert.ok(detectEvent.targets);
  assert.equal(detectEvent.targets.length, 1);
  assert.equal(detectEvent.targets[0].targetId, detectableAt2.id);
});

test("upgradeSkillRpc allows purchasing undetectable skill when enough points available", () => {
  const character = createDefaultCharacter("player1");
  character.progression = {
    level: 1,
    experience: 0,
    experienceForNextLevel: 10,
    availableSkillPoints: 5,
    spentSkillPoints: 0,
  };

  const match: MatchRecord = {
    match_id: "match-upgrade-test",
    players: ["player1"],
    playerCharacters: { player1: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    items: [],
  };

  let storageMatch: MatchRecord = JSON.parse(JSON.stringify(match));
  let storageVersion = "v1";

  const storageServiceMock = {
    storageRead: () => [
      {
        collection: "matches",
        key: "match-upgrade-test",
        userId: "",
        value: storageMatch as any,
        version: storageVersion,
        permissionRead: 2,
        permissionWrite: 1,
      },
    ],
    storageWrite: (writes: any[]) => {
      for (const w of writes) {
        if (w.collection === "matches" && w.key === "match-upgrade-test") {
          storageMatch = typeof w.value === "string" ? JSON.parse(w.value) : w.value;
          storageVersion = "v2";
        }
      }
      return [{ key: "match-upgrade-test", version: storageVersion }];
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => {},
    matchCreate: () => "match-id",
    matchList: () => [],
    matchSignal: () => "",
  };

  const nakamaMock = storageServiceMock as unknown as nkruntime.Nakama;
  const loggerMock = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;
  const ctxMock = { userId: "player1" } as nkruntime.Context;

  const responseJson = upgradeSkillRpc(
    ctxMock,
    loggerMock,
    nakamaMock,
    JSON.stringify({
      match_id: "match-upgrade-test",
      skill_id: "undetectable",
    })
  );

  const response = JSON.parse(responseJson) as UpgradeSkillPayload;
  assert.equal(response.ok, true);
  assert.equal(response.character.progression?.availableSkillPoints, 1);
  assert.equal(response.character.progression?.spentSkillPoints, 4);
  assert.ok(response.character.abilities.includes("undetectable"));
  assert.equal(isCharacterUndetectable(response.character), true);
});
