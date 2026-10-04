import assert from "node:assert/strict";
import { test } from "node:test";
import { SkillLibrary } from "@shared";
import type { MatchRecord } from "../src/models/types";
import {
  assignAfkSkillPoints,
  assignRandomSkillsUntilZero,
  applySkillToCharacter
} from "../src/match/afkSkills";
import { updateReadyStateRpc } from "../src/rpc/updateReadyState";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
    FAILED_PRECONDITION: 9,
    ABORTED: 10
  }
};

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createHarness() {
  const objects = new Map<
    string,
    {
      collection: string;
      key: string;
      userId: string;
      value: unknown;
      version: string;
    }
  >();
  let versionCounter = 0;
  const objectKey = (collection: string, key: string, userId: string) =>
    `${collection}:${key}:${userId}`;

  const fakeNakama = {
    storageRead: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) =>
      requests.flatMap((req) => {
        const stored = objects.get(
          objectKey(req.collection, req.key, req.userId)
        );
        return stored ? [cloneValue(stored)] : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        userId: string;
        value: unknown;
        version?: string;
      }>
    ) => {
      for (const req of requests) {
        const key = objectKey(req.collection, req.key, req.userId);
        objects.set(key, {
          collection: req.collection,
          key: req.key,
          userId: req.userId,
          value: cloneValue(req.value),
          version: String(++versionCounter)
        });
      }
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => {},
    matchCreate: () => "match-1",
    matchList: () => ({ matches: [] }),
    matchSignal: () => ""
  };

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;

  const nakama = fakeNakama as unknown as nkruntime.Nakama;
  const storage = new StorageService(createNakamaWrapper(nakama));

  return {
    logger,
    nakama,
    storage,
    createContext: (overrides: Partial<nkruntime.Context>): nkruntime.Context =>
      ({
        userId: "test-user",
        username: "test-user",
        ...overrides
      }) as unknown as nkruntime.Context
  };
}

function createMatch(playerIds: string[]): MatchRecord {
  return {
    match_id: "afk-skills-test",
    players: playerIds,
    playerCharacters: Object.fromEntries(
      playerIds.map((playerId) => [playerId, createDefaultCharacter(playerId)])
    ),
    playerList: {},
    readyStates: {},
    size: playerIds.length,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0
  };
}

test("assignRandomSkillsUntilZero spends all available skill points", () => {
  const character = createDefaultCharacter("p1");
  character.progression.availableSkillPoints = 10;
  character.progression.spentSkillPoints = 0;
  character.abilities = [];

  const assigned = assignRandomSkillsUntilZero(character);
  assert.equal(character.progression.availableSkillPoints, 0);
  assert.equal(character.progression.spentSkillPoints, 10);
  assert.ok(assigned.length > 0);
  assert.equal(character.abilities.length, assigned.length);

  for (const id of character.abilities) {
    const def = SkillLibrary[id];
    assert.ok(def.implemented);
    const count = character.abilities.filter((a) => a === id).length;
    assert.ok(count <= def.max);
  }
});

test("assignRandomSkillsUntilZero applies stat updates for stat skills", () => {
  const character = createDefaultCharacter("p1");
  character.progression.availableSkillPoints = 2;
  const initialMaxHealth = character.stats.health.max;

  applySkillToCharacter(character, "vitality");
  assert.equal(character.stats.health.max, initialMaxHealth + 1);
  assert.equal(character.progression.availableSkillPoints, 0);
  assert.equal(character.progression.spentSkillPoints, 2);
  assert.deepEqual(character.abilities, ["vitality"]);
});

test("assignAfkSkillPoints assigns skills to players with unspent points and ignores dead players", () => {
  const match = createMatch(["alive1", "alive2", "deadPlayer", "zeroPoints"]);
  match.playerCharacters.alive1.progression.availableSkillPoints = 5;
  match.playerCharacters.alive2.progression.availableSkillPoints = 3;
  match.playerCharacters.zeroPoints.progression.availableSkillPoints = 0;

  match.playerCharacters.deadPlayer.progression.availableSkillPoints = 10;
  match.playerCharacters.deadPlayer.statuses.conditions.push("dead");

  assignAfkSkillPoints(match);

  assert.equal(
    match.playerCharacters.alive1.progression.availableSkillPoints,
    0
  );
  assert.equal(
    match.playerCharacters.alive2.progression.availableSkillPoints,
    0
  );
  assert.equal(
    match.playerCharacters.zeroPoints.progression.availableSkillPoints,
    0
  );
  assert.equal(
    match.playerCharacters.deadPlayer.progression.availableSkillPoints,
    10
  );
});

test("updateReadyStateRpc rejects ready: true if player has unspent skill points", () => {
  const harness = createHarness();
  const playerId = "player-ready-test";
  const match = createMatch([playerId, "player-2"]);
  match.playerCharacters[playerId].progression.availableSkillPoints = 5;
  harness.storage.writeMatch(match);

  const context = harness.createContext({ userId: playerId });

  assert.throws(
    () =>
      updateReadyStateRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({ match_id: match.match_id, ready: true })
      ),
    (err: any) => err?.message === "unspent_skill_points"
  );

  const unreadyRes = updateReadyStateRpc(
    context,
    harness.logger,
    harness.nakama,
    JSON.stringify({ match_id: match.match_id, ready: false })
  );
  const unreadyPayload = JSON.parse(unreadyRes);
  assert.equal(unreadyPayload.ready, false);

  match.playerCharacters[playerId].progression.availableSkillPoints = 0;
  harness.storage.writeMatch(match);

  const readyRes = updateReadyStateRpc(
    context,
    harness.logger,
    harness.nakama,
    JSON.stringify({ match_id: match.match_id, ready: true })
  );
  const readyPayload = JSON.parse(readyRes);
  assert.equal(readyPayload.ready, true);
});
