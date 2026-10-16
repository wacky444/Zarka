import test from "node:test";
import assert from "node:assert/strict";
import { ActionLibrary, type PlayerCharacter } from "@shared";
import { getMissingRequirement } from "../src/ui/ActionRequirementWarnings.ts";
import {
  buildMainActionItems,
  buildSecondaryActionItems
} from "../src/ui/panel/CharacterPanelActionOptions.ts";
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
      carriedItems: [
        { itemId: "chainsaw", quantity: 1 },
        { itemId: "fuel", quantity: 2 }
      ],
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

test("chainsaw warning warns if start is in secondary and attack is in primary", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    const characterNotRunning = createMockCharacter();

    // 1. Chainsaw attack when not running and no start chainsaw planned
    const warningDefault = getMissingRequirement(
      ActionLibrary.chainsaw_attack,
      characterNotRunning,
      undefined
    );
    assert.equal(warningDefault, "Chainsaw is not running");

    // 2. Chainsaw attack when not running and start_chainsaw planned in secondary
    const characterWithStartSecondary = createMockCharacter({
      actionPlan: {
        secondary: { actionId: "start_chainsaw" }
      }
    });
    const warningWithPlan = getMissingRequirement(
      ActionLibrary.chainsaw_attack,
      characterWithStartSecondary,
      undefined
    );
    assert.equal(
      warningWithPlan,
      "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
    );

    // 3. Chainsaw attack with start passed as selectedSecondaryActionId argument
    const warningWithArg = getMissingRequirement(
      ActionLibrary.chainsaw_attack,
      characterNotRunning,
      undefined,
      "start_chainsaw"
    );
    assert.equal(
      warningWithArg,
      "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
    );

    // 4. Chainsaw attack when chainsaw is already running: no warning
    const characterRunning = createMockCharacter({
      statuses: {
        chainsaw: { remainingTurns: 3 }
      }
    });
    assert.equal(
      getMissingRequirement(
        ActionLibrary.chainsaw_attack,
        characterRunning,
        undefined,
        "start_chainsaw"
      ),
      null
    );

    // 5. Start chainsaw in secondary warns when chainsaw_attack is in main
    const characterWithAttackMain = createMockCharacter({
      actionPlan: {
        main: { actionId: "chainsaw_attack" }
      }
    });
    const startWarning = getMissingRequirement(
      ActionLibrary.start_chainsaw,
      characterWithAttackMain,
      undefined
    );
    assert.equal(
      startWarning,
      "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
    );

    // 6. Spanish localization check
    setLocale("es");
    assert.equal(
      t(
        "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack"
      ),
      "El ataque con motosierra va primero, no estará arrancada, requiere dos turnos, primero arrancar y luego atacar"
    );

    // 7. Options context integration with buildMainActionItems
    const context = {
      character: characterNotRunning,
      match: null,
      currentTurn: 1,
      allowedMainActionIds: null,
      allowedSecondaryActionIds: null,
      selectedSecondaryActionId: "start_chainsaw"
    };
    const mainItems = buildMainActionItems(["chainsaw_attack"], context);
    const attackItem = mainItems.find(
      (item) => item.id === "chainsaw_attack"
    );
    assert.ok(attackItem);
    assert.equal(
      attackItem.missingRequirement,
      "El ataque con motosierra va primero, no estará arrancada, requiere dos turnos, primero arrancar y luego atacar"
    );
  } finally {
    setLocale(previousLocale);
  }
});
