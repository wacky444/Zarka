import test from "node:test";
import assert from "node:assert/strict";
import type { PlayerCharacter } from "@shared";
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
      carriedItems: [{ itemId: "detonator", quantity: 2 }],
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

// Logic replicate matching CharacterPanelActionPlanView.hasDetonateC4LocationWarning
function hasDetonateC4LocationWarning(
  character: PlayerCharacter | null,
  mainActionSelection: string | null,
  mainActionTarget: { q: number; r: number } | null
): boolean {
  const isDetonateC4 =
    mainActionSelection === "detonate_c4" ||
    (!mainActionSelection &&
      character?.actionPlan?.main?.actionId === "detonate_c4");
  if (!isDetonateC4) {
    return false;
  }
  const carried = character?.inventory?.carriedItems ?? [];
  const detonatorCount = carried.reduce(
    (sum, stack) =>
      stack.itemId === "detonator" &&
      typeof stack.quantity === "number" &&
      Number.isFinite(stack.quantity)
        ? sum + Math.max(0, Math.floor(stack.quantity))
        : sum,
    0
  );
  if (detonatorCount < 2) {
    return false;
  }
  const hasTargetLocation =
    mainActionTarget !== null ||
    (!mainActionSelection &&
      character?.actionPlan?.main?.targetLocationId != null);
  return !hasTargetLocation;
}

test("detonate C4 location warning activates when carrying 2 detonators and no target location selected", () => {
  const character = createMockCharacter({
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [{ itemId: "detonator", quantity: 2 }],
      storedItems: []
    }
  });

  // 1. detonate_c4 selected, 2 detonators, no target -> warns
  assert.equal(
    hasDetonateC4LocationWarning(character, "detonate_c4", null),
    true
  );

  // 2. detonate_c4 selected, 2 detonators, target selected -> no warning
  assert.equal(
    hasDetonateC4LocationWarning(character, "detonate_c4", { q: 1, r: 2 }),
    false
  );

  // 3. detonate_c4 in actionPlan from server, no local selection, no target -> warns
  const charWithPlan = createMockCharacter({
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [{ itemId: "detonator", quantity: 2 }],
      storedItems: []
    },
    actionPlan: {
      main: { actionId: "detonate_c4" }
    }
  });
  assert.equal(hasDetonateC4LocationWarning(charWithPlan, null, null), true);

  // 4. detonate_c4 in actionPlan from server, with target -> no warning
  const charWithPlanAndTarget = createMockCharacter({
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [{ itemId: "detonator", quantity: 2 }],
      storedItems: []
    },
    actionPlan: {
      main: { actionId: "detonate_c4", targetLocationId: { q: 0, r: 0 } }
    }
  });
  assert.equal(
    hasDetonateC4LocationWarning(charWithPlanAndTarget, null, null),
    false
  );

  // 5. detonate_c4 selected, only 1 detonator, no target -> no warning (server auto-selects)
  const charOneDetonator = createMockCharacter({
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [{ itemId: "detonator", quantity: 1 }],
      storedItems: []
    }
  });
  assert.equal(
    hasDetonateC4LocationWarning(charOneDetonator, "detonate_c4", null),
    false
  );

  // 6. other action (move) selected, 2 detonators, no target -> no warning
  assert.equal(
    hasDetonateC4LocationWarning(character, "move", null),
    false
  );
});

test("detonate C4 warning translations in English and Spanish", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    assert.equal(t("Select C4 target"), "Select C4 target");
    assert.equal(
      t("You have two detonators and have not selected a target location for C4 detonation."),
      "You have two detonators and have not selected a target location for C4 detonation."
    );
    assert.equal(
      t("Target location required (2 detonators)"),
      "Target location required (2 detonators)"
    );

    setLocale("es");
    assert.equal(t("Select C4 target"), "Selecciona objetivo de C4");
    assert.equal(
      t("You have two detonators and have not selected a target location for C4 detonation."),
      "Tienes dos detonadores y no has seleccionado una localización objetivo para detonar el C4."
    );
    assert.equal(
      t("Target location required (2 detonators)"),
      "Localización requerida (2 detonadores)"
    );
  } finally {
    setLocale(previousLocale);
  }
});
