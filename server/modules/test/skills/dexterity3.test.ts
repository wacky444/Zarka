import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalizationType } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeDexterity3Fabrication } from "../../src/match/actions/fabricate";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function setup(selectedItemId?: "chemical_weapon" | "medicine" | "poison" | "antidote"): MatchRecord {
  const character = createDefaultCharacter("player");
  character.abilities = ["dexterity3"];
  character.dexterity3SelectedItemId = selectedItemId;
  return {
    match_id: "dexterity3-test", players: [character.id], playerCharacters: { [character.id]: character },
    playerList: {}, size: 1, created_at: 1, current_turn: 1, started: true, removed: 0,
    map: { cols: 1, rows: 1, seed: "dexterity3-test", tiles: [{ id: "tile", coord: { q: 0, r: 0 }, localizationType: LocalizationType.House, walkable: true, itemIds: [] }] },
  };
}

test("Dexterity 3 crafts selected product for free and starts seven-turn cooldown", () => {
  const match = setup("medicine");
  const [event] = executeDexterity3Fabrication(match, 1);
  const character = match.playerCharacters.player;
  assert.equal(event.action.metadata?.outcome, "success");
  assert.equal(character.inventory.carriedItems.some((item) => item.itemId === "medicine"), true);
  assert.equal(character.dexterity3SelectedItemId, undefined);
  assert.equal(character.dexterity3AvailableOnTurn, 8);
});

test("Dexterity 3 does not expire or consume cooldown while no product is specified", () => {
  const match = setup();
  assert.deepEqual(executeDexterity3Fabrication(match, 20), []);
  assert.equal(match.playerCharacters.player.dexterity3AvailableOnTurn, undefined);
});

test("Dexterity 3 waits for cooldown and executes queued product when ready", () => {
  const match = setup("antidote");
  match.playerCharacters.player.dexterity3AvailableOnTurn = 8;
  assert.deepEqual(executeDexterity3Fabrication(match, 7), []);
  assert.equal(executeDexterity3Fabrication(match, 8).length, 1);
});
