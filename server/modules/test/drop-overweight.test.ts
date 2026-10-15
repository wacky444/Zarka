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
