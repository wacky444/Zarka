import test from "node:test";
import assert from "node:assert/strict";
import { ActionLibrary, type MatchRecord, type PlayerCharacter } from "@shared";
import { getMissingRequirement } from "../src/ui/ActionRequirementWarnings.ts";
import { buildCharacterPanelItemOptions } from "../src/ui/panel/CharacterPanelItemOptions.ts";
import { getLocale, setLocale, t } from "../src/services/i18n.ts";

function createMockCharacter(
  overrides?: Partial<PlayerCharacter>
): PlayerCharacter {
  return {
    id: "test-player",
    userId: "test-user",
    name: "Hero",
    color: "#ff0000",
    position: { tileId: "0,0", coord: { q: 0, r: 0 } },
    alive: true,
    stats: {
      health: { current: 10, max: 10 },
      energy: { current: 10, max: 10 }
    },
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [],
      storedItems: []
    },
    statuses: {},
    progression: {
      level: 1,
      experience: 0,
      availableSkillPoints: 0
    },
    abilities: [],
    ...overrides
  };
}

test("give action warns when character has no items to give", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    const characterEmpty = createMockCharacter({
      inventory: {
        carriedWeight: 0,
        maxWeight: 100,
        carriedItems: [],
        storedItems: []
      }
    });
    assert.equal(
      getMissingRequirement(ActionLibrary.give, characterEmpty, undefined),
      "Must have an item to give."
    );

    const characterWithItem = createMockCharacter({
      inventory: {
        carriedWeight: 1,
        maxWeight: 100,
        carriedItems: [{ itemId: "bandage", quantity: 1, weight: 1 }],
        storedItems: []
      }
    });
    assert.equal(
      getMissingRequirement(ActionLibrary.give, characterWithItem, undefined),
      null
    );

    setLocale("es");
    assert.equal(
      t("Debe tener el objeto a entregar."),
      "Debe tener el objeto a entregar."
    );
  } finally {
    setLocale(previousLocale);
  }
});

test("buildCharacterPanelItemOptions presents inventory items unstacked", () => {
  const character = createMockCharacter({
    id: "test-user",
    inventory: {
      carriedWeight: 3,
      maxWeight: 100,
      carriedItems: [
        { itemId: "bandage", quantity: 2, weight: 2 },
        { itemId: "food", quantity: 1, weight: 1 }
      ],
      storedItems: []
    }
  });
  const match = {
    match_id: "test",
    players: ["test-user"],
    playerCharacters: { "test-user": character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0
  } as unknown as MatchRecord;

  const { inventoryItems } = buildCharacterPanelItemOptions(match, "test-user");
  assert.equal(inventoryItems.length, 3);
  assert.equal(inventoryItems[0].id, "bandage:0");
  assert.equal(inventoryItems[0].label, "Venda");
  assert.equal(inventoryItems[1].id, "bandage:1");
  assert.equal(inventoryItems[1].label, "Venda");
  assert.equal(inventoryItems[2].id, "food:2");
  assert.equal(inventoryItems[2].label, "Comida");
});

