import assert from "node:assert/strict";
import { test } from "node:test";
import { TutorialProgressController } from "../src/tutorial/TutorialProgressController.ts";
import type { TutorialStepId } from "@shared";

test("tutorial progress is ordered and repeated events are idempotent", () => {
  const steps: readonly TutorialStepId[] = [
    "map_pan",
    "inspect_current_cell",
    "search"
  ];
  const controller = new TutorialProgressController(steps);

  assert.equal(controller.currentStep, "map_pan");
  assert.equal(controller.recordPresentation("search"), false);
  assert.equal(controller.recordGameplay("search"), false);
  assert.equal(controller.currentStep, "map_pan");

  assert.equal(controller.recordPresentation("map_pan"), true);
  assert.equal(controller.currentStep, "inspect_current_cell");
  assert.equal(controller.recordPresentation("map_pan"), false);
  assert.equal(controller.recordPresentation("inspect_current_cell"), true);
  assert.equal(controller.currentStep, "search");
  assert.equal(controller.hasObservedGameplayStep("search"), true);
  assert.equal(controller.recordGameplay("search"), false);
  assert.equal(controller.recordPresentation("search"), true);
  assert.equal(controller.isComplete, true);
  assert.equal(controller.recordGameplay("search"), false);
  assert.equal(controller.recordPresentation("search"), false);

  const gameplayController = new TutorialProgressController(steps);
  gameplayController.recordPresentation("map_pan");
  gameplayController.recordPresentation("inspect_current_cell");
  assert.equal(gameplayController.currentStep, "search");
  assert.equal(gameplayController.recordGameplay("search"), false);
  assert.equal(gameplayController.recordPresentation("search"), true);
  assert.equal(gameplayController.isComplete, true);
});
