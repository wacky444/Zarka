import assert from "node:assert/strict";
import { test } from "node:test";
import { TutorialProgressController } from "../src/tutorial/TutorialProgressController.ts";
import {
  getTutorialSkillHighlights,
  getTutorialUiPolicy,
  isTutorialReadyActionAllowed
} from "../src/tutorial/TutorialUiPolicy.ts";
import { TUTORIAL_INSTRUCTIONS } from "../src/tutorial/TutorialInstructions.ts";
import {
  clearActiveTutorialMatchId,
  clearTutorialPresentationSteps,
  readActiveTutorialMatchId,
  readTutorialPresentationSteps,
  saveActiveTutorialMatchId,
  saveTutorialPresentationStep,
  type TutorialMatchStorage
} from "../src/tutorial/ActiveTutorialMatch.ts";
import {
  TUTORIAL_STEP_IDS,
  TUTORIAL_STEP_GROUPS,
  getTutorialStepDisplay,
  formatTutorialHeader,
  type TutorialStepId
} from "@shared";

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
  assert.equal(controller.isComplete, true);
  assert.equal(controller.recordGameplay("search"), false);
  assert.equal(controller.recordPresentation("search"), false);

  const gameplayController = new TutorialProgressController(steps);
  gameplayController.recordPresentation("map_pan");
  gameplayController.recordPresentation("inspect_current_cell");
  assert.equal(gameplayController.currentStep, "search");
  assert.equal(gameplayController.recordGameplay("search"), true);
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

  const returnToBot = getTutorialUiPolicy("return_to_bot");
  assert.equal(returnToBot.readyEnabled, true);
  assert.ok(returnToBot.highlightedControls.includes("location_target"));

  assert.equal(
    isTutorialReadyActionAllowed("return_to_bot", {
      mainActionId: "move",
      targetLocation: { q: 0, r: 0 }
    }),
    true
  );
  assert.equal(
    isTutorialReadyActionAllowed("return_to_bot", {
      mainActionId: "move",
      targetLocation: { q: 0, r: 1 }
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("return_to_bot", {
      mainActionId: "move",
      targetLocation: null
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("return_to_bot", {
      mainActionId: "axe_attack",
      targetLocation: { q: 0, r: 0 }
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("scare_bot_to_doomed_cell", {
      mainActionId: "scare",
      extraExecutions: 1,
      targetLocation: { q: 0, r: 1 }
    }),
    true
  );
  assert.equal(
    isTutorialReadyActionAllowed("scare_bot_to_doomed_cell", {
      mainActionId: "scare",
      extraExecutions: 0,
      targetLocation: { q: 0, r: 1 }
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("scare_bot_to_doomed_cell", {
      mainActionId: "scare",
      extraExecutions: 1,
      targetLocation: { q: 0, r: 0 }
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("scare_bot_to_doomed_cell", {
      mainActionId: "scare",
      extraExecutions: 1,
      targetLocation: null
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("scare_bot_to_doomed_cell", {
      mainActionId: "axe_attack",
      extraExecutions: 1,
      targetLocation: { q: 0, r: 1 }
    }),
    false
  );

  assert.equal(
    isTutorialReadyActionAllowed("plan_axe_attack", {
      mainActionId: "axe_attack",
      targetPlayerId: "bot1"
    }),
    true
  );
  assert.equal(
    isTutorialReadyActionAllowed("plan_axe_attack", {
      mainActionId: "axe_attack",
      targetPlayerId: null
    }),
    false
  );
  assert.equal(
    isTutorialReadyActionAllowed("plan_axe_attack", {
      mainActionId: "punch",
      targetPlayerId: "bot1"
    }),
    false
  );
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

test("presentation progress persists across reloads with restored gameplay progress", () => {
  const values = new Map<string, string>();
  const storage: TutorialMatchStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const matchId = "tutorial-match";
  const presentationSteps: readonly TutorialStepId[] = [
    "map_pan",
    "inspect_current_cell",
    "inspect_nearby_cell"
  ];
  const initial = new TutorialProgressController(TUTORIAL_STEP_IDS);

  for (const stepId of presentationSteps) {
    assert.equal(initial.currentStep, stepId);
    assert.equal(initial.recordPresentation(stepId), true);
    assert.equal(
      saveTutorialPresentationStep(storage, "user-a", matchId, stepId),
      true
    );
  }
  assert.equal(initial.currentStep, "choose_skills");

  const resumed = new TutorialProgressController(TUTORIAL_STEP_IDS);
  assert.equal(resumed.recordGameplay("choose_skills"), false);
  assert.equal(resumed.currentStep, "map_pan");
  const savedSteps = readTutorialPresentationSteps(storage, "user-a", matchId);
  assert.deepEqual(savedSteps, presentationSteps);
  assert.equal(resumed.restorePresentationSteps(savedSteps), true);
  assert.equal(resumed.currentStep, "search");
  assert.deepEqual(
    readTutorialPresentationSteps(storage, "user-a", "another-match"),
    []
  );
  assert.equal(clearTutorialPresentationSteps(storage, "user-a", matchId), true);
  assert.deepEqual(readTutorialPresentationSteps(storage, "user-a", matchId), []);
});

test("every ordered tutorial step has an instruction and optional hint", () => {
  for (const stepId of TUTORIAL_STEP_IDS) {
    const copy = TUTORIAL_INSTRUCTIONS[stepId];
    assert.ok(copy.instruction.length > 0, `missing instruction: ${stepId}`);
    assert.ok(copy.hint.length > 0, `missing hint: ${stepId}`);
  }
});

test("tutorial steps are grouped into 5 display steps while preserving all progress steps", () => {
  assert.equal(TUTORIAL_STEP_GROUPS.length, 5);

  const flattened = TUTORIAL_STEP_GROUPS.flat();
  assert.deepEqual(flattened, TUTORIAL_STEP_IDS);

  const group1Steps: TutorialStepId[] = [
    "map_pan",
    "inspect_current_cell",
    "inspect_nearby_cell"
  ];
  for (const stepId of group1Steps) {
    const display = getTutorialStepDisplay(stepId);
    assert.equal(display.step, 1);
    assert.equal(display.totalSteps, 5);
  }

  for (let groupIdx = 0; groupIdx < TUTORIAL_STEP_GROUPS.length; groupIdx++) {
    for (const stepId of TUTORIAL_STEP_GROUPS[groupIdx]) {
      const display = getTutorialStepDisplay(stepId);
      assert.equal(display.step, groupIdx + 1);
      assert.equal(display.totalSteps, 5);
    }
  }

  const mockTranslate = (key: string) =>
    key === "Tutorial" ? "Tutorial" : key === "Step" ? "Paso" : key;

  for (const stepId of group1Steps) {
    assert.equal(formatTutorialHeader(stepId, mockTranslate), "Tutorial");
  }

  assert.equal(
    formatTutorialHeader("choose_skills", mockTranslate),
    "Tutorial · Paso 2/5"
  );
  assert.equal(
    formatTutorialHeader("victory_recap", mockTranslate),
    "Tutorial · Paso 5/5"
  );
});

test("tutorial skills highlights guide player to defense tab and confirm button", () => {
  // Inactive tutorial mode
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: false,
      pendingUpgrades: []
    }),
    { highlightedCategory: null, confirmHighlighted: false }
  );

  // Active tutorial mode, neither selected -> Defense subtab highlighted
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: []
    }),
    { highlightedCategory: "defense", confirmHighlighted: false }
  );

  // Only strength2 selected -> Defense subtab highlighted
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: ["strength2"]
    }),
    { highlightedCategory: "defense", confirmHighlighted: false }
  );

  // Only vitality selected -> Offensive subtab highlighted
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: ["vitality"]
    }),
    { highlightedCategory: "offensive", confirmHighlighted: false }
  );

  // Both skills selected -> No subtab highlighted, confirm button highlighted
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: ["vitality", "strength2"]
    }),
    { highlightedCategory: null, confirmHighlighted: true }
  );

  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: ["strength2", "vitality"]
    }),
    { highlightedCategory: null, confirmHighlighted: true }
  );

  // With committed abilities
  assert.deepEqual(
    getTutorialSkillHighlights({
      isTutorialChooseSkills: true,
      pendingUpgrades: ["strength2"],
      abilities: ["vitality"]
    }),
    { highlightedCategory: null, confirmHighlighted: true }
  );
});

