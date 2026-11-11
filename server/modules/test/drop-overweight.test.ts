import assert from "node:assert/strict";
import test from "node:test";
import type { MatchRecord } from "../src/models/types";
import { dropOverweightItems } from "../src/match/dropOverweightItems";

function createMatch(loadCurrent: number): MatchRecord {
  return {
    match_id: "overweight-match",
    players: ["player"],
    playerCharacters: {
      player: {
        id: "player",
        name: "Player",
        stats: {
          health: { current: 10, max: 10, knockoutThreshold: 5, injuredMax: 5 },
          energy: { current: 10, max: 10 },
          load: { current: loadCurrent, max: 10 },
          speed: 0,
          sympathy: 0,
          baseViewRange: 0,
        },
        position: { tileId: "tile-1", coord: { q: 0, r: 0 } },
        inventory: {
          carriedItems: [
            { itemId: "axe", quantity: 1, weight: 5 },
            { itemId: "wood", quantity: 1, weight: 1 },
          ],
        },
        abilities: [],
        relationships: { confirmedTeammates: [], alliances: [], representatives: [] },
        statuses: { conditions: [] },
        discoveredItemIds: [],
      },
    },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: {
      tiles: [
        {
          id: "tile-1",
          coord: { q: 0, r: 0 },
          localizationType: "House",
          frame: "house.png",
          itemIds: [],
        },
      ],
    } as unknown as MatchRecord["map"],
    items: [],
  };
}

test("overweight turn-end drop sheds lowest-value items and reveals them to owner", () => {
  const match = createMatch(11);
  const events = dropOverweightItems(match);
  const character = match.playerCharacters.player;

  assert.equal(character.stats.load.current, 10);
  assert.deepEqual(character.inventory.carriedItems.map((item) => item.itemId), ["axe"]);
  assert.equal(match.items?.length, 1);
  assert.equal(match.items?.[0].item_type, "wood");
  assert.deepEqual(character.discoveredItemIds, [match.items?.[0].item_id]);
  assert.deepEqual(match.map?.tiles[0].itemIds, [match.items?.[0].item_id]);
  assert.equal(events.length, 1);
  assert.equal(events[0].action.actionId, "drop");
  assert.equal(events[0].action.metadata?.automatic, true);
});

test("characters within load capacity keep inventory unchanged", () => {
  const match = createMatch(10);
  assert.deepEqual(dropOverweightItems(match), []);
  assert.equal(match.items?.length, 0);
  assert.equal(match.playerCharacters.player.inventory.carriedItems.length, 2);
});

test("remote c4 detonator is protected by special rule and dropped last among overweight items", () => {
  const match = createMatch(13);
  const character = match.playerCharacters.player;
  character.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: 2 },
    { itemId: "wood", quantity: 1, weight: 1 },
    { itemId: "knife", quantity: 1, weight: 1 },
    { itemId: "axe", quantity: 1, weight: 5 },
  ];

  // load is 13, max is 10 (3 overweight).
  // wood (value 0, weight 1) drops first -> load 12.
  // knife (value 2, weight 3) drops next -> load 9 <= 10.
  // Axe and detonator should NOT be dropped.
  const events = dropOverweightItems(match);

  assert.equal(character.stats.load.current, 9);
  assert.deepEqual(
    character.inventory.carriedItems.map((item) => item.itemId),
    ["detonator", "axe"]
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].action.metadata?.droppedCount, 2);
  const droppedTypes = (events[0].action.metadata?.droppedItems as Array<{ itemType: string }>).map(
    (entry) => entry.itemType
  );
  assert.deepEqual(droppedTypes, ["wood", "knife"]);
});

test("detonator is only dropped when no other items remain to relieve overweight", () => {
  const match = createMatch(12);
  const character = match.playerCharacters.player;
  character.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: 2 },
    { itemId: "wood", quantity: 1, weight: 1 },
  ];

  // load is 12, max is 10 (2 overweight).
  // wood (weight 1) drops first -> load 11. Still > 10.
  // detonator (weight 2) drops second -> load 9 <= 10.
  const events = dropOverweightItems(match);

  assert.equal(character.stats.load.current, 9);
  assert.deepEqual(character.inventory.carriedItems, []);
  assert.equal(events.length, 1);
  const droppedTypes = (events[0].action.metadata?.droppedItems as Array<{ itemType: string }>).map(
    (entry) => entry.itemType
  );
  assert.deepEqual(droppedTypes, ["wood", "detonator"]);
});

test("zero-weight items like bandolier or tracker are ignored for overweight dropping", () => {
  const match = createMatch(12);
  const character = match.playerCharacters.player;
  character.inventory.carriedItems = [
    { itemId: "bandolier", quantity: 1, weight: 0 },
    { itemId: "tracker", quantity: 1, weight: 0 },
    { itemId: "axe", quantity: 1, weight: 5 },
  ];

  const events = dropOverweightItems(match);

  assert.equal(character.stats.load.current, 7);
  assert.deepEqual(
    character.inventory.carriedItems.map((item) => item.itemId),
    ["bandolier", "tracker"]
  );
  assert.equal(events.length, 1);
  const droppedTypes = (events[0].action.metadata?.droppedItems as Array<{ itemType: string }>).map(
    (entry) => entry.itemType
  );
  assert.deepEqual(droppedTypes, ["axe"]);
});
