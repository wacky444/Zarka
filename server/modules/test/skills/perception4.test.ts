import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SkillLibrary,
  getSkillEffectTotal,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { advanceTurn } from "../../src/match/advanceTurn";
import { createPerception4DetectionEvents } from "../../src/match/perception4";
import { tailorReplayEvents } from "../../src/match/replay/tailorReplay";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => {}, info: () => {}, warn: () => {} } as unknown as nkruntime.Logger;

function createCharacter(
  id: string,
  q: number,
  r = 0,
): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.position = {
    tileId: `hex_${q}_${r}`,
    coord: { q, r },
  };
  return character;
}

function createMatch(characters: PlayerCharacter[]): MatchRecord {
  return {
    match_id: "perception4-test",
    players: characters.map((character) => character.id),
    playerCharacters: Object.fromEntries(
      characters.map((character) => [character.id, character]),
    ),
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
}

test("Perception 4 is purchasable and grants adjacent-player detection", () => {
  const viewer = createCharacter("viewer", 0);
  viewer.abilities.push("perception4");

  assert.equal(SkillLibrary.perception4.implemented, true);
  assert.equal(SkillLibrary.perception4.cost, 5);
  assert.equal(SkillLibrary.perception4.max, 1);
  assert.equal(getSkillEffectTotal(viewer, "perceive_nearby_players"), 1);
});

test("Perception 4 logs names and distances, includes Cowards, and excludes Undetectable", () => {
  const viewer = createCharacter("viewer", 0);
  viewer.abilities.push("perception4");
  const sameLocation = createCharacter("same-location", 0);
  const hiddenCoward = createCharacter("hidden-coward", 1);
  hiddenCoward.abilities.push("coward");
  const undetectable = createCharacter("undetectable", 0, 1);
  undetectable.abilities.push("undetectable");
  const outOfRange = createCharacter("out-of-range", 2);
  const match = createMatch([
    viewer,
    sameLocation,
    hiddenCoward,
    undetectable,
    outOfRange,
  ]);

  const events = createPerception4DetectionEvents(match);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.action.actionId, "detect");
  assert.equal(event.action.originLocation, undefined);
  assert.equal(event.action.metadata?.passive, true);
  assert.deepEqual(event.visibility, {
    scope: "limited",
    playerIds: [viewer.id],
  });
  assert.deepEqual(
    event.targets?.map((target) => [
      target.targetId,
      (target.metadata as { distance: number }).distance,
    ]),
    [
      [sameLocation.id, 0],
      [hiddenCoward.id, 1],
    ],
  );
  assert.deepEqual(
    tailorReplayEvents(events, "observer", match.playerCharacters, 0),
    [],
  );
});

test("Perception 4 detection is included in turn replay only for conscious owner", () => {
  const viewer = createCharacter("viewer", 0);
  viewer.abilities.push("perception4");
  const target = createCharacter("target", 1);
  const match = createMatch([viewer, target]);

  const result = advanceTurn(match, 1, logger);
  const detection = result.events.find(
    (event) => event.kind === "player" && event.action.actionId === "detect",
  );
  assert.ok(detection);

  viewer.statuses.conditions.push("unconscious");
  const unconsciousEvents = createPerception4DetectionEvents(match);
  assert.deepEqual(unconsciousEvents, []);
});
