import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ItemLibrary,
  LocalizationType,
  syncBandolierLoadCapacity,
  type ItemId,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeBlackMarketTradeAction } from "../src/match/actions/blackMarketTrade";
import { executeDropAction } from "../src/match/actions/drop";
import { executePickUpAction } from "../src/match/actions/pickup";
import { executeStealAction } from "../src/match/actions/steal";
import type { PlannedActionParticipant } from "../src/match/actions/utils";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createMatch(
  character: PlayerCharacter,
  itemTypes: ItemId[],
): { match: MatchRecord; participant: PlannedActionParticipant } {
  const itemIds = itemTypes.map((_, index) => `item-${index}`);
  const match: MatchRecord = {
    match_id: "bandolier-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: {
      cols: 1,
      rows: 1,
      seed: "bandolier-test",
      tiles: [
        {
          id: "tile",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.House,
          walkable: true,
          itemIds: itemIds.slice(),
        },
      ],
    },
    items: itemTypes.map((itemType, index) => ({
      item_id: itemIds[index],
      item_type: itemType,
    })),
  };
  const plan = { actionId: "pick_up" as const };
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.discoveredItemIds = itemIds.slice();
  character.actionPlan = { main: plan };
  return {
    match,
    participant: {
      playerId: character.id,
      character,
      plan,
      planKey: "main",
    },
  };
}

test("bandolier adds one capacity bonus while carried, regardless of quantity", () => {
  const character = createDefaultCharacter("player");
  character.inventory.carriedItems.push({
    itemId: "bandolier",
    quantity: 2,
    weight: 0,
  });

  syncBandolierLoadCapacity(character);
  assert.equal(character.stats.load.max, 30);
  assert.equal(character.stats.load.bandolierCapacityBonus, 5);

  syncBandolierLoadCapacity(character);
  assert.equal(character.stats.load.max, 30);
});

test("removing a bandolier preserves other capacity increases", () => {
  const character = createDefaultCharacter("player");
  character.inventory.carriedItems.push({
    itemId: "bandolier",
    quantity: 1,
    weight: 0,
  });
  syncBandolierLoadCapacity(character);
  character.stats.load.max += 4;
  character.inventory.carriedItems = character.inventory.carriedItems.filter(
    (item) => item.itemId !== "bandolier",
  );

  syncBandolierLoadCapacity(character);

  assert.equal(character.stats.load.max, 29);
});

test("picking up and dropping bandoliers applies and removes the single bonus", () => {
  assert.equal(ItemLibrary.bandolier.weight, 0);
  const character = createDefaultCharacter("player");
  const { match, participant } = createMatch(character, ["bandolier", "bandolier"]);
  const initialLoad = character.stats.load.current;

  executePickUpAction([participant], match);

  assert.equal(character.inventory.carriedItems.find((item) => item.itemId === "bandolier")?.quantity, 2);
  assert.equal(character.stats.load.current, initialLoad);
  assert.equal(character.stats.load.max, 30);

  const dropOne = {
    actionId: "drop" as const,
    targetItemIds: ["bandolier"],
  };
  executeDropAction(
    [
      {
        playerId: character.id,
        character,
        plan: dropOne,
        planKey: "main",
      },
    ],
    match,
  );
  assert.equal(character.inventory.carriedItems.find((item) => item.itemId === "bandolier")?.quantity, 1);
  assert.equal(character.stats.load.max, 30);

  executeDropAction(
    [
      {
        playerId: character.id,
        character,
        plan: dropOne,
        planKey: "main",
      },
    ],
    match,
  );
  assert.equal(character.inventory.carriedItems.some((item) => item.itemId === "bandolier"), false);
  assert.equal(character.stats.load.max, 25);
  assert.equal(character.stats.load.bandolierCapacityBonus, 0);
});

test("stealing a bandolier transfers its single capacity bonus", () => {
  const actor = createDefaultCharacter("thief");
  const target = createDefaultCharacter("target");
  actor.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  target.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  target.inventory.carriedItems = [
    { itemId: "bandolier", quantity: 1, weight: 0 },
  ];
  target.stats.load.current = 0;
  syncBandolierLoadCapacity(target);
  const { match, participant } = createMatch(actor, []);
  match.players.push(target.id);
  match.playerCharacters![target.id] = target;
  match.size = 2;
  participant.plan = {
    actionId: "steal",
    targetPlayerIds: [target.id],
  };

  executeStealAction([participant], match);

  assert.equal(actor.stats.load.max, 30);
  assert.equal(target.stats.load.max, 25);
  assert.equal(
    actor.inventory.carriedItems.some((item) => item.itemId === "bandolier"),
    true,
  );
  assert.equal(
    target.inventory.carriedItems.some((item) => item.itemId === "bandolier"),
    false,
  );
});

test("selling a bandolier removes its capacity bonus", () => {
  const character = createDefaultCharacter("seller");
  character.inventory.carriedItems.push({
    itemId: "bandolier",
    quantity: 1,
    weight: 0,
  });
  syncBandolierLoadCapacity(character);
  const { match, participant } = createMatch(character, []);
  participant.plan = {
    actionId: "black_market_trade",
    targetItemIds: ["bandolier"],
  };

  executeBlackMarketTradeAction([participant], match);

  assert.equal(character.stats.load.max, 25);
  assert.equal(
    character.inventory.carriedItems.some((item) => item.itemId === "bandolier"),
    false,
  );
});

test("existing carried bandolier grants capacity when inventory is reconciled", () => {
  const character = createDefaultCharacter("player");
  character.stats.load.bandolierCapacityBonus = undefined;
  character.inventory.carriedItems.push({
    itemId: "bandolier",
    quantity: 1,
    weight: 0,
  });

  syncBandolierLoadCapacity(character);

  assert.equal(character.stats.load.max, 30);
});
