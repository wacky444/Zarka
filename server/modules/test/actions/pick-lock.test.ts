import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary, LocalizationType } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executePickLockAction } from "../../src/match/actions/pickLock";
import { executeAction } from "../../src/match/actionExecutor";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function setup(hasDexterity = false, hasLockpick = false): { match: MatchRecord; participant: PlannedActionParticipant } {
  const character = createDefaultCharacter("player");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.discoveredItemIds = ["safe"];
  if (hasDexterity) character.abilities = ["dexterity1"];
  if (hasLockpick) character.inventory.carriedItems.push({ itemId: "lockpick", quantity: 1, weight: 1 });
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
  assert.deepEqual(
    event.kind === "player" ? event.action.metadata?.contents : undefined,
    ["medicine"]
  );
  assert.equal(match.safeContainers?.[0].opened, true);
  assert.equal(match.map?.tiles[0].itemIds.length, 1);
  assert.equal(participant.character.discoveredItemIds?.length, 1);
  assert.equal(match.map?.tiles[0].itemIds.includes("safe"), false);
  assert.equal(participant.character.discoveredItemIds?.includes("safe"), false);
});

test("lockpick opens instantly and is consumed without Dexterity 1", () => {
  const { match, participant } = setup(false, true);
  const [event] = executePickLockAction([participant], match);
  assert.equal(event.kind === "player" ? event.action.metadata?.openedInstantly : undefined, true);
  assert.deepEqual(
    event.kind === "player" ? event.action.metadata?.contents : undefined,
    ["medicine"]
  );
  assert.equal(participant.character.inventory.carriedItems.some((item) => item.itemId === "lockpick"), false);
  assert.equal(match.safeContainers?.[0].opened, true);
});

test("Dexterity 1 makes lockpick reusable and still opens instantly", () => {
  const { match, participant } = setup(true, true);
  const [event] = executePickLockAction([participant], match);
  assert.equal(event.kind === "player" ? event.action.metadata?.openedInstantly : undefined, true);
  assert.equal(participant.character.inventory.carriedItems.some((item) => item.itemId === "lockpick"), true);
});

test("Dexterity 1 opens safe in three turns without a lockpick", () => {
  const { match, participant } = setup(true);
  executePickLockAction([participant], match);
  executePickLockAction([participant], match);
  const [event] = executePickLockAction([participant], match);
  assert.equal(event.kind === "player" ? event.action.metadata?.outcome : undefined, "success");
});

test("Dexterity 1 rank 2 opens safe in two turns without a lockpick", () => {
  const { match, participant } = setup();
  participant.character.abilities = ["dexterity1", "dexterity1"];
  const [event1] = executePickLockAction([participant], match);
  assert.equal(event1.kind === "player" ? event1.action.metadata?.turnsCompleted : undefined, 1);
  assert.equal(event1.kind === "player" ? event1.action.metadata?.turnsRequired : undefined, 2);
  const [event2] = executePickLockAction([participant], match);
  assert.equal(event2.kind === "player" ? event2.action.metadata?.outcome : undefined, "success");
});

test("ongoing lockpicking auto-continues without re-submitting action until safe is opened", () => {
  const { match, participant } = setup();
  const dummyLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  // Turn 1 resolves
  let events = executeAction(match, ActionLibrary.pick_lock, 1, {}, dummyLogger);
  assert.equal(events.some(e => e.kind === "player" && e.action.metadata?.turnsCompleted === 1), true);
  assert.equal(participant.character.actionPlan?.secondary, undefined);
  assert.equal(participant.character.lockpickProgress?.turnsCompleted, 1);

  // Turn 2: player plans nothing, but stays in place
  events = executeAction(match, ActionLibrary.pick_lock, 2, {}, dummyLogger);
  assert.equal(events.some(e => e.kind === "player" && e.action.metadata?.turnsCompleted === 2), true);
  assert.equal(participant.character.lockpickProgress?.turnsCompleted, 2);

  // Turn 3: player plans nothing
  events = executeAction(match, ActionLibrary.pick_lock, 3, {}, dummyLogger);
  assert.equal(events.some(e => e.kind === "player" && e.action.metadata?.turnsCompleted === 3), true);
  assert.equal(participant.character.lockpickProgress?.turnsCompleted, 3);

  // Turn 4: player plans nothing -> safe opens!
  events = executeAction(match, ActionLibrary.pick_lock, 4, {}, dummyLogger);
  assert.equal(events.some(e => e.kind === "player" && e.action.metadata?.outcome === "success"), true);
  assert.equal(participant.character.lockpickProgress, undefined);
  assert.equal(match.safeContainers?.[0].opened, true);
});

test("lockpicking continues even if player performs another secondary action (e.g. focus)", () => {
  const { match, participant } = setup();
  const dummyLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as nkruntime.Logger;

  // Turn 1: start lockpick
  executeAction(match, ActionLibrary.pick_lock, 1, {}, dummyLogger);
  assert.equal(participant.character.lockpickProgress?.turnsCompleted, 1);

  // Turn 2: player plans focus in secondary slot
  participant.character.actionPlan = { secondary: { actionId: ActionLibrary.focus.id } };
  executeAction(match, ActionLibrary.pick_lock, 2, {}, dummyLogger);
  assert.equal(participant.character.lockpickProgress?.turnsCompleted, 2);
  // Focus plan is preserved for focus action to execute
  assert.equal(participant.character.actionPlan?.secondary?.actionId, ActionLibrary.focus.id);
});
