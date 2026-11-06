import assert from "node:assert/strict";
import { test } from "node:test";
import { SettingsScene } from "../src/scenes/SettingsScene";

test("SettingsScene initializes ranked match slots to 0 and updates via setRankedMatchSlots", () => {
  const scene = new SettingsScene();
  assert.equal(scene.getRankedMatchSlots(), 0);

  scene.setRankedMatchSlots(3);
  assert.equal(scene.getRankedMatchSlots(), 3);

  scene.setRankedMatchSlots(-1);
  assert.equal(scene.getRankedMatchSlots(), 0);

  scene.setRankedMatchSlots(5);
  assert.equal(scene.getRankedMatchSlots(), 3);
});

test("SettingsScene init resets shutting down flag and preserves confirmed slots", () => {
  const scene = new SettingsScene();
  scene.setRankedMatchSlots(3);
  assert.equal(scene.getRankedMatchSlots(), 3);

  // Simulate shutdown event
  (scene as any).settingsSceneShuttingDown = true;
  (scene as any).confirmedRankedMatchSlots = 3;

  // Simulate re-entering the scene
  scene.init();
  assert.equal((scene as any).settingsSceneShuttingDown, false);
  assert.equal(scene.getRankedMatchSlots(), 3);
  assert.equal((scene as any).rankedMatchSlotsRevision, 0);
});
