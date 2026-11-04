import test from "node:test";
import assert from "node:assert/strict";
import { ActionLibrary, type PlayerCharacter } from "@shared";
import { getMissingRequirement } from "../src/ui/ActionRequirementWarnings.ts";
import { buildMainActionItems } from "../src/ui/panel/CharacterPanelActionOptions.ts";
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

test("detect action warns when character has perception4 skill", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    const characterWithoutSkill = createMockCharacter({ abilities: [] });
    assert.equal(
      getMissingRequirement(ActionLibrary.detect, characterWithoutSkill, undefined),
      null
    );

    const characterWithPerception4 = createMockCharacter({
      abilities: ["perception4"]
    });
    assert.equal(
      getMissingRequirement(ActionLibrary.detect, characterWithPerception4, undefined),
      "You already have a skill to detect"
    );

    setLocale("es");
    assert.equal(
      t("You already have a skill to detect"),
      "Ya tienes una habilidad para detectar"
    );
    assert.equal(
      getMissingRequirement(ActionLibrary.detect, characterWithPerception4, undefined),
      "Ya tienes una habilidad para detectar"
    );

    const context = {
      character: characterWithPerception4,
      match: null,
      currentTurn: 1,
      allowedMainActionIds: null,
      allowedSecondaryActionIds: null
    };
    const mainItems = buildMainActionItems(["detect"], context);
    const detectItem = mainItems.find((item) => item.id === "detect");
    assert.ok(detectItem);
    assert.equal(
      detectItem.missingRequirement,
      "Ya tienes una habilidad para detectar"
    );
  } finally {
    setLocale(previousLocale);
  }
});
