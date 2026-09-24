import assert from "node:assert/strict";
import { test } from "node:test";
import { TutorialProgressController } from "../src/tutorial/TutorialProgressController.ts";
import { getTutorialUiPolicy } from "../src/tutorial/TutorialUiPolicy.ts";
import { TUTORIAL_INSTRUCTIONS } from "../src/tutorial/TutorialInstructions.ts";
import {
  clearActiveTutorialMatchId,
  readActiveTutorialMatchId,
  saveActiveTutorialMatchId,
  type TutorialMatchStorage
} from "../src/tutorial/ActiveTutorialMatch.ts";
import { TUTORIAL_STEP_IDS, type TutorialStepId } from "@shared";

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

test("restored gameplay events wait for presentation steps, then resume in order", () => {
  const controller = new TutorialProgressController(TUTORIAL_STEP_IDS);
  const restoredGameplaySteps: TutorialStepId[] = [
    "choose_skills",
    "search",
    "pickup_items",
    "feed_bot",
    "bot_chat",
    "buy_detective",
    "plan_axe_attack",
    "resolve_bot_scare",
    "return_to_bot",
    "observe_destruction_warning",
    "scare_bot_to_doomed_cell",
    "resolve_destruction",
    "victory_recap"
  ];
  for (const stepId of restoredGameplaySteps) {
    controller.recordGameplay(stepId);
  }
  assert.equal(controller.currentStep, "map_pan");

  controller.recordPresentation("map_pan");
  controller.recordPresentation("inspect_current_cell");
  controller.recordPresentation("inspect_nearby_cell");
  assert.equal(controller.currentStep, "search");
  controller.recordPresentation("search");
  assert.equal(controller.currentStep, "open_chat");
});

test("tutorial UI policy exposes only the actions and items for the current lesson", () => {
  const inspect = getTutorialUiPolicy("inspect_current_cell");
  assert.deepEqual(inspect.primaryActionIds, []);
  assert.deepEqual(inspect.secondaryActionIds, []);
  assert.equal(inspect.readyEnabled, false);

  const skills = getTutorialUiPolicy("choose_skills");
  assert.deepEqual(skills.skillIds, ["vitality", "strength2"]);
  assert.equal(skills.highlightedCharacterSubtab, "skills");
  assert.equal(skills.autoSelectCharacterSubtab, false);

  const search = getTutorialUiPolicy("search");
  assert.equal(search.highlightedCharacterSubtab, "status");
  assert.equal(search.autoSelectCharacterSubtab, true);

  const detective = getTutorialUiPolicy("buy_detective");
  assert.deepEqual(detective.shopIds, ["detective"]);
  assert.equal(detective.highlightedTab, "shop");

  const finalScare = getTutorialUiPolicy("scare_bot_to_doomed_cell");
  assert.deepEqual(finalScare.primaryActionIds, ["scare"]);
  assert.equal(finalScare.readyEnabled, true);
  assert.ok(finalScare.highlightedControls.includes("extra_execution"));
  assert.ok(finalScare.highlightedControls.includes("location_target"));

  const resolveScare = getTutorialUiPolicy("resolve_bot_scare");
  assert.equal(resolveScare.actionEditingEnabled, false);
  assert.equal(resolveScare.readyEnabled, true);
});

test("active tutorial match storage is user-scoped and survives scene reloads", () => {
  const values = new Map<string, string>();
  const storage: TutorialMatchStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };

  assert.equal(saveActiveTutorialMatchId(storage, "user-a", "match-a"), true);
  assert.equal(readActiveTutorialMatchId(storage, "user-a"), "match-a");
  assert.equal(readActiveTutorialMatchId(storage, "user-b"), null);
  assert.equal(
    clearActiveTutorialMatchId(storage, "user-a", "stale-match"),
    false
  );
  assert.equal(readActiveTutorialMatchId(storage, "user-a"), "match-a");
  assert.equal(clearActiveTutorialMatchId(storage, "user-a", "match-a"), true);
  assert.equal(readActiveTutorialMatchId(storage, "user-a"), null);
});

test("every ordered tutorial step has an instruction and optional hint", () => {
  for (const stepId of TUTORIAL_STEP_IDS) {
    const copy = TUTORIAL_INSTRUCTIONS[stepId];
    assert.ok(copy.instruction.length > 0, `missing instruction: ${stepId}`);
    assert.ok(copy.hint.length > 0, `missing hint: ${stepId}`);
  }
});
