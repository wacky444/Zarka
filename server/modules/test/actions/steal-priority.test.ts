import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary, ItemLibrary, type ItemId } from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeStealAction } from "../../src/match/actions/steal";
import { updateMainActionRpc } from "../../src/rpc/updateMainAction";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

const logger = { debug: () => undefined } as unknown as nkruntime.Logger;

function createFixture(
  targetItemIds: ItemId[],
  requestedItemIds: string[],
  revealedItemIds?: string[],
  extraExecutions = 0
): {
  actor: ReturnType<typeof createDefaultCharacter>;
  target: ReturnType<typeof createDefaultCharacter>;
  match: MatchRecord;
  participant: PlannedActionParticipant;
} {
  const actor = createDefaultCharacter("thief");
  const target = createDefaultCharacter("target");
  actor.inventory.carriedItems = [];
  actor.abilities.push("dexterity2");
  actor.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  target.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  target.inventory.carriedItems = targetItemIds.map((itemId) => ({
    itemId,
    quantity: 1,
    weight: ItemLibrary[itemId].weight
  }));
  if (revealedItemIds) {
    actor.revealedItemTypesByPlayerId = { target: revealedItemIds };
  }
  const plan = {
    actionId: ActionLibrary.steal.id,
    targetPlayerIds: [target.id],
    targetItemIds: requestedItemIds,
    ...(extraExecutions > 0 ? { extraExecutions } : {})
  };
  actor.actionPlan = { main: plan };
  const match: MatchRecord = {
    match_id: "steal-priority-test",
    players: [actor.id, target.id],
    playerCharacters: { [actor.id]: actor, [target.id]: target },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0
  };
  return {
    actor,
    target,
    match,
    participant: {
      playerId: actor.id,
      character: actor,
      plan,
      planKey: "main"
    }
  };
}

test("Dexterity 2 steals first available item in selected priority order", () => {
  const fixture = createFixture(
    ["food", "medicine"],
    ["axe", "medicine", "food"]
  );

  executeStealAction([fixture.participant], fixture.match);

  assert.equal(
    fixture.actor.inventory.carriedItems.find(
      (stack) => stack.itemId === "medicine"
    )?.quantity,
    1
  );
  assert.equal(
    fixture.target.inventory.carriedItems.some(
      (stack) => stack.itemId === "medicine"
    ),
    false
  );
});

test("extra steal uses independent item priorities on the same target", () => {
  const fixture = createFixture(
    ["knife", "food"],
    ["knife"],
    undefined,
    1
  );
  fixture.participant.plan.secondTargetItemIds = ["food"];

  executeStealAction([fixture.participant], fixture.match);

  assert.deepEqual(
    fixture.actor.inventory.carriedItems.map((stack) => stack.itemId),
    ["knife", "food"]
  );
  assert.equal(fixture.target.inventory.carriedItems.length, 0);
});

test("extra steal can target another player with separate priorities", () => {
  const fixture = createFixture(["knife"], ["knife"], undefined, 1);
  const secondTarget = createDefaultCharacter("target2");
  secondTarget.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  secondTarget.inventory.carriedItems = [
    { itemId: "medicine", quantity: 1, weight: ItemLibrary.medicine.weight }
  ];
  fixture.match.players.push(secondTarget.id);
  fixture.match.playerCharacters[secondTarget.id] = secondTarget;
  fixture.participant.plan.secondTargetPlayerId = secondTarget.id;
  fixture.participant.plan.secondTargetItemIds = ["medicine"];

  executeStealAction([fixture.participant], fixture.match);

  assert.deepEqual(
    fixture.actor.inventory.carriedItems.map((stack) => stack.itemId),
    ["knife", "medicine"]
  );
  assert.equal(fixture.target.inventory.carriedItems.length, 0);
  assert.equal(secondTarget.inventory.carriedItems.length, 0);
});

test("Dexterity 2 randomly chooses when none of its priorities are carried", () => {
  const fixture = createFixture(
    ["medicine", "food"],
    ["axe", "knife", "bat"],
    ["medicine"]
  );
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    executeStealAction([fixture.participant], fixture.match);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(
    fixture.actor.inventory.carriedItems.find(
      (stack) => stack.itemId === "food"
    )?.quantity,
    1
  );
});

test("Dexterity 2 ignores priorities after the first three", () => {
  const fixture = createFixture(
    ["food", "medicine"],
    ["axe", "knife", "bat", "medicine"]
  );
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    executeStealAction([fixture.participant], fixture.match);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(
    fixture.actor.inventory.carriedItems.find(
      (stack) => stack.itemId === "food"
    )?.quantity,
    1
  );
});

test("main-action RPC caps both steal priority lists and stores second target", () => {
  const fixture = createFixture([], []);
  let storedMatch = fixture.match;
  const nakama = {
    storageRead: () => [{ value: storedMatch, version: "1" }],
    storageWrite: (requests: Array<{ value: unknown }>) => {
      const write = requests[0];
      if (write) {
        storedMatch = write.value as MatchRecord;
      }
    },
    storageList: () => ({ objects: [] }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => ""
  } as unknown as nkruntime.Nakama;

  updateMainActionRpc(
    { userId: fixture.actor.id } as nkruntime.Context,
    logger,
    nakama,
    JSON.stringify({
      match_id: fixture.match.match_id,
      submission: {
        actionId: ActionLibrary.steal.id,
        extraExecutions: 1,
        secondTargetPlayerId: "target",
        targetItemIds: ["axe", "knife", "bat", "medicine"],
        secondTargetItemIds: ["food", "medicine", "knife", "axe"]
      }
    })
  );

  assert.deepEqual(
    storedMatch.playerCharacters.thief.actionPlan?.main?.targetItemIds,
    ["axe", "knife", "bat"]
  );
  assert.deepEqual(
    storedMatch.playerCharacters.thief.actionPlan?.main?.secondTargetItemIds,
    ["food", "medicine", "knife"]
  );
  assert.equal(
    storedMatch.playerCharacters.thief.actionPlan?.main?.secondTargetPlayerId,
    "target"
  );
});

test("Dexterity 2 cannot prioritize Special-category items", () => {
  const fixture = createFixture(["corpse", "food"], ["corpse", "food"]);

  executeStealAction([fixture.participant], fixture.match);

  assert.equal(
    fixture.actor.inventory.carriedItems.some(
      (stack) => stack.itemId === "food"
    ),
    true
  );
  assert.equal(
    fixture.actor.inventory.carriedItems.some(
      (stack) => stack.itemId === "corpse"
    ),
    false
  );
});
