import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canPerceiveCharacterDetails,
  getSkillEffectTotal,
  SkillLibrary,
  type PlayerCharacter
} from "@shared";
import { createDefaultCharacter } from "../src/utils/playerCharacter";
import { tailorPlayerCharactersForViewer } from "../src/utils/matchView";
import { formatPlayerPerceptionDetails } from "../../../client/src/ui/PlayerPerceptionDetails";

function createCharacters(): { viewer: PlayerCharacter; target: PlayerCharacter } {
  const viewer = createDefaultCharacter("viewer");
  const target = createDefaultCharacter("target");
  viewer.abilities = ["perception6"];
  viewer.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  target.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  return { viewer, target };
}

test("Perception 6 is purchasable for 10 points, once, through the effect system", () => {
  const { viewer } = createCharacters();
  assert.equal(SkillLibrary.perception6.implemented, true);
  assert.equal(SkillLibrary.perception6.cost, 10);
  assert.equal(SkillLibrary.perception6.max, 1);
  assert.equal(getSkillEffectTotal(viewer, "perceive_character_details"), 1);
});

test("details require the viewer's skill, not the target's", () => {
  const { viewer, target } = createCharacters();
  assert.equal(canPerceiveCharacterDetails(viewer, target), true);
  assert.equal(canPerceiveCharacterDetails(target, viewer), false);
  viewer.abilities = ["perception1", "perception3", "perception5"];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
});

test("unconscious or dead viewers cannot perceive details", () => {
  const { viewer, target } = createCharacters();
  viewer.statuses.conditions = ["unconscious"];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  viewer.statuses.conditions = ["dead"];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  viewer.statuses.conditions = [];
  viewer.stats.health.current = 0;
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
});

test("injured but conscious viewers can perceive details", () => {
  const { viewer, target } = createCharacters();
  viewer.statuses.conditions = ["injured"];
  viewer.stats.health.current = 3;
  assert.equal(canPerceiveCharacterDetails(viewer, target), true);
});

test("details require the same cell even if view range or team knowledge is larger", () => {
  const { viewer, target } = createCharacters();
  viewer.stats.baseViewRange = 3;
  viewer.relationships.confirmedTeammates = [target.id];
  target.position = { tileId: "hex_1_0", coord: { q: 1, r: 0 } };
  const visible = tailorPlayerCharactersForViewer({ viewer, target }, viewer.id)!;
  assert.ok(visible.target);
  assert.equal(formatPlayerPerceptionDetails(visible.viewer, visible.target), "");
  target.position = { tileId: "hex_0_1", coord: { q: 0, r: 1 } };
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
});

test("missing characters and missing or invalid positions do not reveal details", () => {
  const { viewer, target } = createCharacters();
  assert.equal(formatPlayerPerceptionDetails(null, target), "");
  assert.equal(formatPlayerPerceptionDetails(viewer, undefined), "");
  assert.equal(formatPlayerPerceptionDetails(viewer, viewer), "");
  delete target.position;
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  target.position = { tileId: "hex_0_0", coord: { q: NaN, r: 0 } };
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  viewer.position = { tileId: "invalid", coord: { q: Infinity, r: 0 } };
  target.position = { tileId: "invalid", coord: { q: Infinity, r: 0 } };
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
});

test("card includes energy, focus energy, states and carried items, without stash or discovery changes", () => {
  const { viewer, target } = createCharacters();
  target.stats.energy = { current: 7, max: 20, temporary: 6 };
  Object.assign(target.stats.energy, { activeTemporary: 2 });
  target.statuses.conditions = ["unconscious", "injured", "intoxicated", "protected"];
  target.inventory.carriedItems = [
    { itemId: "food", quantity: 2, weight: 6 },
    { itemId: "drink", quantity: 1, weight: 3 },
    { itemId: "food", quantity: 1, weight: 3 },
    { itemId: "bandage", quantity: 0, weight: 0 },
    { itemId: "unknown_item", quantity: 1, weight: 1 }
  ];
  target.inventory.stash = [{ itemId: "knife", quantity: 5, weight: 15 }];
  const before = JSON.stringify({ viewer, target });
  assert.equal(formatPlayerPerceptionDetails(viewer, target), [
    "Energy: 7 / 20",
    "Extra energy (remaining): 2",
    "Extra energy (next turn): 6",
    "State: Unconscious, Injured, Intoxicated, Protected",
    "Carried items:",
    "Comida x3",
    "Bebida x1",
    "unknown_item x1"
  ].join("\n"));
  assert.equal(JSON.stringify({ viewer, target }), before);
});

test("empty inventory and no conditions are explicit", () => {
  const { viewer, target } = createCharacters();
  target.inventory.carriedItems = [];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), [
    "Energy: 10 / 20", "State: Normal", "Carried items:", "None"
  ].join("\n"));
});

test("details disappear on leaving the cell, fainting or losing the skill and return on recovery", () => {
  const { viewer, target } = createCharacters();
  assert.notEqual(formatPlayerPerceptionDetails(viewer, target), "");
  target.position!.coord.q = 1;
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  target.position!.coord.q = 0;
  viewer.statuses.conditions = ["unconscious"];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
  viewer.statuses.conditions = [];
  assert.notEqual(formatPlayerPerceptionDetails(viewer, target), "");
  viewer.abilities = [];
  assert.equal(formatPlayerPerceptionDetails(viewer, target), "");
});
