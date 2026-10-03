import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ItemLibrary,
  LocalizationType,
  SkillLibrary,
  getLockerSaleBonus,
  type PlayerCharacter
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeDropAction } from "../../src/match/actions/drop";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function createMatchWithCharacter(
  character: PlayerCharacter
): { match: MatchRecord; participant: PlannedActionParticipant } {
  const match: MatchRecord = {
    match_id: "salesman-test",
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
      seed: "salesman-test",
      tiles: [
        {
          id: "tile",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.House,
          walkable: true,
          itemIds: []
        }
      ]
    },
    items: []
  };
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  character.economy = { zarkans: 0, pendingZarkans: 0, incomeInterval: 1 };
  return {
    match,
    participant: {
      playerId: character.id,
      character,
      plan: { actionId: "drop" },
      planKey: "secondary"
    }
  };
}

test("salesman skill definition in SkillLibrary is implemented with locker_sale_bonus", () => {
  assert.equal(SkillLibrary.salesman.implemented, true);
  assert.equal(SkillLibrary.salesman.cost, 2);
  assert.equal(SkillLibrary.salesman.max, 1);
  assert.equal(SkillLibrary.salesman.category, "utility");
  assert.deepEqual(SkillLibrary.salesman.effect, {
    type: "locker_sale_bonus",
    value: 1
  });
});

test("getLockerSaleBonus returns 0 without skill and 1 with salesman skill", () => {
  const character = createDefaultCharacter("player1");
  assert.equal(getLockerSaleBonus(character), 0);

  character.abilities = ["salesman"];
  assert.equal(getLockerSaleBonus(character), 1);
});

test("selling item in lockers grants base sell value without salesman", () => {
  const character = createDefaultCharacter("player-no-skill");
  character.inventory = {
    carriedItems: [{ itemId: "drink", quantity: 1, weight: 3 }]
  };
  const { match, participant } = createMatchWithCharacter(character);
  participant.plan = {
    actionId: "drop",
    sellInstead: true,
    targetItemIds: ["drink"]
  };

  const events = executeDropAction([participant], match);

  assert.equal(events.length, 1);
  const drinkSellValue = ItemLibrary.drink.sellValue ?? 0;
  assert.equal(character.economy?.zarkans, drinkSellValue);
  assert.equal(events[0].action?.metadata?.zarkansEarned, drinkSellValue);
  assert.equal(character.inventory.carriedItems.length, 0);
});

test("selling item in lockers grants base sell value plus 1 zarkan with salesman", () => {
  const character = createDefaultCharacter("player-salesman");
  character.abilities = ["salesman"];
  character.inventory = {
    carriedItems: [{ itemId: "drink", quantity: 1, weight: 3 }]
  };
  const { match, participant } = createMatchWithCharacter(character);
  participant.plan = {
    actionId: "drop",
    sellInstead: true,
    targetItemIds: ["drink"]
  };

  const events = executeDropAction([participant], match);

  assert.equal(events.length, 1);
  const drinkSellValue = ItemLibrary.drink.sellValue ?? 0;
  const expectedZarkans = drinkSellValue + 1;
  assert.equal(character.economy?.zarkans, expectedZarkans);
  assert.equal(events[0].action?.metadata?.zarkansEarned, expectedZarkans);
  assert.equal(character.inventory.carriedItems.length, 0);
});

test("selling multiple items via extra execution grants +1 zarkan for each sold item with salesman", () => {
  const character = createDefaultCharacter("player-multi-sale");
  character.abilities = ["salesman"];
  character.stats.energy.current = 10;
  character.inventory = {
    carriedItems: [
      { itemId: "drink", quantity: 1, weight: 3 },
      { itemId: "food", quantity: 1, weight: 3 }
    ]
  };
  const { match, participant } = createMatchWithCharacter(character);
  participant.plan = {
    actionId: "drop",
    sellInstead: true,
    extraExecutions: 1,
    targetItemIds: ["drink", "food"]
  };

  const events = executeDropAction([participant], match);

  assert.equal(events.length, 1);
  const drinkSellValue = ItemLibrary.drink.sellValue ?? 0;
  const foodSellValue = ItemLibrary.food.sellValue ?? 0;
  const expectedTotal = drinkSellValue + 1 + foodSellValue + 1;
  assert.equal(character.economy?.zarkans, expectedTotal);
  assert.equal(events[0].action?.metadata?.zarkansEarned, expectedTotal);
  assert.equal(character.inventory.carriedItems.length, 0);
});

test("dropping item without selling does not earn zarkans even with salesman", () => {
  const character = createDefaultCharacter("player-drop-only");
  character.abilities = ["salesman"];
  character.inventory = {
    carriedItems: [{ itemId: "drink", quantity: 1, weight: 3 }]
  };
  const { match, participant } = createMatchWithCharacter(character);
  participant.plan = {
    actionId: "drop",
    sellInstead: false,
    targetItemIds: ["drink"]
  };

  const events = executeDropAction([participant], match);

  assert.equal(events.length, 1);
  assert.equal(character.economy?.zarkans, 0);
  assert.equal(events[0].action?.metadata?.zarkansEarned, undefined);
  assert.equal(match.items?.length, 1);
  assert.equal(match.items?.[0].item_type, "drink");
});
