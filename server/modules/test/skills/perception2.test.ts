import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canSeeHiddenCharacter,
  getSkillEffectTotal,
  SkillLibrary,
  type PlayerCharacter
} from "@shared";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import { tailorPlayerCharactersForViewer } from "../../src/utils/matchView";
import { upgradeSkillRpc } from "../../src/rpc/upgradeSkill";
import type { MatchRecord } from "../../src/models/types";

function createCharacters(): { viewer: PlayerCharacter; coward: PlayerCharacter } {
  const viewer = createDefaultCharacter("viewer");
  const coward = createDefaultCharacter("coward");
  viewer.abilities = ["perception2"];
  coward.abilities = ["coward"];
  viewer.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  coward.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  return { viewer, coward };
}

test("Perception 2 is purchasable for 2 points, once, through the effect system", () => {
  const { viewer } = createCharacters();
  assert.equal(SkillLibrary.perception2.implemented, true);
  assert.equal(SkillLibrary.perception2.cost, 2);
  assert.equal(SkillLibrary.perception2.max, 1);
  assert.equal(getSkillEffectTotal(viewer, "perceive_hidden_characters"), 1);
});

test("canSeeHiddenCharacter returns true for self even without perception", () => {
  const { coward } = createCharacters();
  assert.equal(canSeeHiddenCharacter(coward, coward), true);
});

test("canSeeHiddenCharacter requires viewer to have perception2 and be on the same tile", () => {
  const { viewer, coward } = createCharacters();
  assert.equal(canSeeHiddenCharacter(viewer, coward), true);

  viewer.abilities = [];
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);

  viewer.abilities = ["perception2"];
  coward.position = { tileId: "hex_1_0", coord: { q: 1, r: 0 } };
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);
});

test("unconscious or dead viewers cannot see hidden characters", () => {
  const { viewer, coward } = createCharacters();
  viewer.statuses.conditions = ["unconscious"];
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);

  viewer.statuses.conditions = ["dead"];
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);

  viewer.statuses.conditions = [];
  viewer.stats.health.current = 0;
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);
});

test("conscious injured viewers can see hidden characters on same tile", () => {
  const { viewer, coward } = createCharacters();
  viewer.statuses.conditions = ["injured"];
  viewer.stats.health.current = 3;
  assert.equal(canSeeHiddenCharacter(viewer, coward), true);
});

test("invalid or missing coordinates prevent seeing hidden characters", () => {
  const { viewer, coward } = createCharacters();
  assert.equal(canSeeHiddenCharacter(null, coward), false);
  assert.equal(canSeeHiddenCharacter(viewer, null), false);

  delete viewer.position;
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);

  viewer.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  delete coward.position;
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);

  coward.position = { tileId: "hex_0_0", coord: { q: NaN, r: 0 } };
  assert.equal(canSeeHiddenCharacter(viewer, coward), false);
});

test("tailorPlayerCharactersForViewer includes hidden coward on same tile only when viewer has perception2", () => {
  const { viewer, coward } = createCharacters();
  const characters = { viewer, coward };

  const viewWithPerception = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.ok(viewWithPerception?.coward);
  assert.equal(viewWithPerception.coward.id, "coward");

  viewer.abilities = [];
  const viewWithoutPerception = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.equal(viewWithoutPerception?.coward, undefined);
});

test("tailorPlayerCharactersForViewer excludes hidden coward on adjacent tile even with large view range", () => {
  const { viewer, coward } = createCharacters();
  viewer.stats.baseViewRange = 5;
  coward.position = { tileId: "hex_1_0", coord: { q: 1, r: 0 } };
  const characters = { viewer, coward };

  const view = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.equal(view?.coward, undefined);
});

test("tailorPlayerCharactersForViewer excludes hidden coward when viewer with perception2 is unconscious", () => {
  const { viewer, coward } = createCharacters();
  viewer.statuses.conditions = ["unconscious"];
  const characters = { viewer, coward };

  const view = tailorPlayerCharactersForViewer(
    characters,
    viewer.id,
    false,
    1
  );
  assert.equal(view?.coward, undefined);
});

test("upgradeSkillRpc allows purchasing perception2 with available skill points", () => {
  const character = createDefaultCharacter("player1");
  character.progression = {
    level: 1,
    experience: 0,
    experienceForNextLevel: 10,
    availableSkillPoints: 2,
    spentSkillPoints: 0,
  };

  const match: MatchRecord = {
    match_id: "match-perception2-test",
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
        key: "match-perception2-test",
        userId: "",
        value: storageMatch as any,
        version: storageVersion,
        permissionRead: 2,
        permissionWrite: 1,
      },
    ],
    storageWrite: (writes: any[]) => {
      for (const w of writes) {
        if (w.collection === "matches" && w.key === "match-perception2-test") {
          storageMatch = typeof w.value === "string" ? JSON.parse(w.value) : w.value;
          storageVersion = "v2";
        }
      }
      return [{ key: "match-perception2-test", version: storageVersion }];
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
      match_id: "match-perception2-test",
      skill_id: "perception2",
    })
  );

  const response = JSON.parse(responseJson);
  assert.equal(response.ok, true);
  assert.deepEqual(response.character.abilities, ["perception2"]);
  assert.equal(response.character.progression?.availableSkillPoints, 0);
  assert.equal(response.character.progression?.spentSkillPoints, 2);
});
