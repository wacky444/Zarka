import assert from "node:assert/strict";
import { test } from "node:test";
import { LocalizationType } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executePickLockAction } from "../../src/match/actions/pickLock";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function setup(hasDexterity = false): { match: MatchRecord; participant: PlannedActionParticipant } {
  const character = createDefaultCharacter("player");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.discoveredItemIds = ["safe"];
  if (hasDexterity) character.abilities = ["dexterity1"];
  const plan = { actionId: "pick_lock" as const };
  character.actionPlan = { secondary: plan };
  const match: MatchRecord = {
    match_id: "lockpick-test", players: [character.id], playerCharacters: { [character.id]: character },
    playerList: {}, size: 1, created_at: 1, current_turn: 1, started: true, removed: 0,
    map: { cols: 1, rows: 1, seed: "lockpick-test", tiles: [{ id: "tile", coord: { q: 0, r: 0 }, localizationType: LocalizationType.House, walkable: true, itemIds: ["safe"] }] },
    items: [{ item_id: "safe", item_type: "safe" }],
    safeContainers: [{ safeItemId: "safe", tileId: "tile", contents: ["medicine"] }],
  };
  return { match, participant: { playerId: character.id, character, plan, planKey: "secondary" } };
}

test("lockpicking opens safe after four turns and reveals contents for opener and cell searches", () => {
  const { match, participant } = setup();
  for (let turn = 1; turn < 4; turn += 1) {
    const [event] = executePickLockAction([participant], match);
    assert.equal(event.kind === "player" ? event.action.metadata?.turnsCompleted : undefined, turn);
  }
  const [event] = executePickLockAction([participant], match);
  assert.equal(event.kind === "player" ? event.action.metadata?.outcome : undefined, "success");
  assert.equal(match.safeContainers?.[0].opened, true);
  assert.equal(match.map?.tiles[0].itemIds.length, 2);
  assert.equal(participant.character.discoveredItemIds?.length, 2);
});

test("Dexterity 1 opens safe in three turns", () => {
  const { match, participant } = setup(true);
  executePickLockAction([participant], match);
  executePickLockAction([participant], match);
  const [event] = executePickLockAction([participant], match);
  assert.equal(event.kind === "player" ? event.action.metadata?.outcome : undefined, "success");
});
