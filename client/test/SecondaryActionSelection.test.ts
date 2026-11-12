import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSecondaryActionSelection,
  buildExtraSecondaryActionSelection,
  type SecondaryActionPlanSnapshot
} from "../src/ui/panel/CharacterPanelActionPlanView.ts";

function createMockSnapshot(
  overrides?: Partial<SecondaryActionPlanSnapshot>
): SecondaryActionPlanSnapshot {
  return {
    actionId: "drop",
    targetLocation: null,
    targetPlayerId: null,
    secondTargetPlayerId: null,
    targetItemIds: ["fuel"],
    extraExecutions: 0,
    prioritizeFoodDrink: false,
    singleTarget: false,
    sellInstead: true,
    supportsLocation: false,
    supportsPlayer: false,
    supportsItems: true,
    supportsExtra: true,
    hasAdditionalTarget: false,
    ...overrides
  };
}

test("buildSecondaryActionSelection includes sellInstead when drop is selected and sellInstead is true", () => {
  const snapshot = createMockSnapshot({
    actionId: "drop",
    sellInstead: true,
    targetItemIds: ["fuel"],
    supportsItems: true
  });

  const selection = buildSecondaryActionSelection(snapshot);

  assert.equal(selection.actionId, "drop");
  assert.equal(selection.sellInstead, true);
  assert.deepEqual(selection.targetItemIds, ["fuel"]);
});

test("buildSecondaryActionSelection sets sellInstead to false when sellInstead is false", () => {
  const snapshot = createMockSnapshot({
    actionId: "drop",
    sellInstead: false,
    targetItemIds: ["fuel"],
    supportsItems: true
  });

  const selection = buildSecondaryActionSelection(snapshot);

  assert.equal(selection.actionId, "drop");
  assert.equal(selection.sellInstead, false);
});

test("buildSecondaryActionSelection ignores sellInstead when action is not drop", () => {
  const snapshot = createMockSnapshot({
    actionId: "search",
    sellInstead: true,
    prioritizeFoodDrink: true
  });

  const selection = buildSecondaryActionSelection(snapshot);

  assert.equal(selection.actionId, "search");
  assert.equal(selection.sellInstead, false);
  assert.equal(selection.prioritizeFoodDrink, true);
});

test("buildExtraSecondaryActionSelection includes toggles and target lists by default", () => {
  const snapshot = createMockSnapshot({
    actionId: "drop",
    sellInstead: true,
    targetItemIds: ["bandage"],
    supportsItems: true
  });

  const selection = buildExtraSecondaryActionSelection(snapshot);

  assert.equal(selection.actionId, "drop");
  assert.equal(selection.sellInstead, true);
  assert.deepEqual(selection.targetItemIds, ["bandage"]);
});
