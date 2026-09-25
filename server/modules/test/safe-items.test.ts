import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CellLibrary,
  LocalizationType,
  generateGameMap,
  type CellLibraryDefinition,
  type MatchItemRecord,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executePickUpAction } from "../src/match/actions/pickup";
import { executeSearchAction } from "../src/match/actions/search";
import type { PlannedActionParticipant } from "../src/match/actions/utils";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createScenario(itemType: MatchItemRecord["item_type"]): {
  character: PlayerCharacter;
  itemId: string;
  match: MatchRecord;
  participant: PlannedActionParticipant;
} {
  const character = createDefaultCharacter("player");
  character.position = { tileId: "tile", coord: { q: 0, r: 0 } };
  const itemId = "item-on-tile";
  const match: MatchRecord = {
    match_id: "safe-items-test",
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
      seed: "safe-items-test",
      tiles: [
        {
          id: "tile",
          coord: { q: 0, r: 0 },
          localizationType: LocalizationType.House,
          walkable: true,
          itemIds: [itemId],
        },
      ],
    },
    items: [{ item_id: itemId, item_type: itemType }],
  };
  const plan = { actionId: "pick_up" as const };
  character.actionPlan = { main: plan };
  return {
    character,
    itemId,
    match,
    participant: {
      playerId: character.id,
      character,
      plan,
      planKey: "main",
    },
  };
}

test("cell types configure safe counts and their fixed or randomized contents", () => {
  assert.equal(CellLibrary[LocalizationType.Market].safes?.length, 2);
  assert.equal(CellLibrary[LocalizationType.PoliceStation].safes?.length, 2);
  assert.equal(CellLibrary[LocalizationType.Factory].safes?.length, 2);
  assert.equal(CellLibrary[LocalizationType.House].safes?.length, 1);
  assert.deepEqual(
    CellLibrary[LocalizationType.House].safes?.[0].contents,
    ["chemical_weapon"]
  );
  assert.deepEqual(
    CellLibrary[LocalizationType.House].safes?.[0].randomContents?.candidates,
    ["medicine", "zarkan3", "axe", "walkie_talkie", "food"]
  );
  assert.equal(
    CellLibrary[LocalizationType.House].safes?.[0].randomContents?.count,
    2
  );

  const generated = generateGameMap(5, 4, CellLibrary, "safe-counts");
  for (const tile of generated.map.tiles) {
    const actualSafeCount = tile.itemIds.filter(
      (itemId) =>
        generated.items.find((item) => item.item_id === itemId)?.item_type ===
        "safe"
    ).length;
    assert.equal(
      actualSafeCount,
      CellLibrary[tile.localizationType].safes?.length ?? 0
    );
  }
});

test("generated house safe gets its own seeded random contents and a searchable safe item", () => {
  const houseLibrary: CellLibraryDefinition = {
    ...CellLibrary,
    [LocalizationType.House]: {
      ...CellLibrary[LocalizationType.House],
      numberMin: 1,
      numberMax: 1,
    },
  };
  const generated = generateGameMap(1, 1, houseLibrary, "safe-content-seed");
  const tile = generated.map.tiles[0];
  const tileItems = generated.items.filter((item) =>
    tile.itemIds.includes(item.item_id)
  );
  const safeItem = tileItems.find((item) => item.item_type === "safe");
  const safeContents = generated.safeContainers[0]?.contents;

  assert.ok(safeItem);
  assert.equal(generated.safeContainers.length, 1);
  assert.equal(safeContents?.length, 3);
  assert.equal(safeContents?.[0], "chemical_weapon");
  assert.equal(
    safeContents?.slice(1).every((item) =>
      ["medicine", "zarkan3", "axe", "walkie_talkie", "food"].includes(item)
    ),
    true
  );

  const character = createDefaultCharacter("searcher");
  character.position = { tileId: tile.id, coord: tile.coord };
  const match: MatchRecord = {
    match_id: "search-safe-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
    map: {
      ...generated.map,
      tiles: [{ ...tile, itemIds: [safeItem.item_id] }],
    },
    items: [safeItem],
  };
  const plan = { actionId: "search" as const };
  const events = executeSearchAction(
    [
      {
        playerId: character.id,
        character,
        plan,
        planKey: "main",
      },
    ],
    match
  );
  const searchEvent = events.find(
    (event) => event.action.actionId === "search"
  );
  const discoveredItemIds = (
    searchEvent?.action.metadata as { discoveredItemIds?: string[] } | undefined
  )?.discoveredItemIds;

  assert.ok(discoveredItemIds?.includes(safeItem.item_id));
});

test("picking up a three-zarkan coin credits the wallet instead of inventory", () => {
  const { character, itemId, match, participant } = createScenario("zarkan3");
  character.discoveredItemIds = [itemId];
  const initialBalance = character.economy?.zarkans ?? 0;

  executePickUpAction([participant], match);

  assert.equal(character.economy?.zarkans, initialBalance + 3);
  assert.equal(
    character.inventory.carriedItems.some((stack) => stack.itemId === "zarkan3"),
    false
  );
  assert.equal(match.items?.some((item) => item.item_id === itemId), false);
  assert.equal(match.map?.tiles[0].itemIds.includes(itemId), false);
});

test("safe items are discoverable but cannot be picked up", () => {
  const { character, itemId, match, participant } = createScenario("safe");
  character.discoveredItemIds = [itemId];

  executePickUpAction([participant], match);

  assert.equal(match.items?.some((item) => item.item_id === itemId), true);
  assert.equal(match.map?.tiles[0].itemIds.includes(itemId), true);
  assert.equal(
    character.inventory.carriedItems.some((stack) => stack.itemId === "safe"),
    false
  );
});
