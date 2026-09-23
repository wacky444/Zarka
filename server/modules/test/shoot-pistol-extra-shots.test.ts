import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  PlayerCharacter,
  PlayerPlannedAction,
  ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import {
  createDefaultCharacter,
  isCharacterDead,
} from "../src/utils/playerCharacter";
import { executeShootPistolAction } from "../src/match/actions/shootPistol";
import type { PlannedActionParticipant } from "../src/match/actions/utils";

function createMatch(firstTargetHealth = 10): {
  attacker: PlayerCharacter;
  firstTarget: PlayerCharacter;
  secondTarget: PlayerCharacter;
  match: MatchRecord;
  participant: PlannedActionParticipant;
} {
  const attacker = createDefaultCharacter("attacker");
  attacker.position = { tileId: "attacker", coord: { q: 0, r: 0 } };
  attacker.stats.energy.current = 2;
  attacker.inventory.carriedItems = [
    { itemId: "pistol", quantity: 1, weight: 3 },
    { itemId: "bullet", quantity: 2, weight: 1 },
  ];
  const firstTarget = createDefaultCharacter("first");
  firstTarget.position = { tileId: "first", coord: { q: 1, r: 0 } };
  firstTarget.stats.health.current = firstTargetHealth;
  const secondTarget = createDefaultCharacter("second");
  secondTarget.position = { tileId: "second", coord: { q: 0, r: 1 } };

  const plan: PlayerPlannedAction = {
    actionId: "shoot_pistol",
    extraExecutions: 1,
    targetPlayerIds: [firstTarget.id],
    secondTargetPlayerId: firstTarget.id,
  };
  attacker.actionPlan = { main: plan };

  const match: MatchRecord = {
    match_id: "pistol-extra-shots-test",
    players: [attacker.id, firstTarget.id, secondTarget.id],
    playerCharacters: {
      [attacker.id]: attacker,
      [firstTarget.id]: firstTarget,
      [secondTarget.id]: secondTarget,
    },
    playerList: {},
    size: 3,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
  return {
    attacker,
    firstTarget,
    secondTarget,
    match,
    participant: {
      playerId: attacker.id,
      character: attacker,
      plan,
      planKey: "main",
    },
  };
}

function pistolEvent(events: ReplayPlayerEvent[]): ReplayPlayerEvent {
  const event = events.find(
    (candidate) =>
      candidate.kind === "player" &&
      candidate.action.actionId === "shoot_pistol"
  );
  if (!event || event.kind !== "player") {
    throw new Error("Expected a pistol replay event");
  }
  return event;
}

test("extra pistol execution is a second shot and retargets if the first target dies", () => {
  const { attacker, firstTarget, secondTarget, match, participant } =
    createMatch();

  const events = executeShootPistolAction([participant], match);
  const event = pistolEvent(events);

  assert.equal(event.action.damageDealt, 20);
  assert.equal(event.action.metadata?.bulletsConsumed, 2);
  assert.deepEqual(
    event.targets?.map((target) => target.targetId),
    [firstTarget.id, secondTarget.id]
  );
  assert.deepEqual(
    event.targets?.map((target) => target.damageTaken),
    [10, 10]
  );
  assert.equal(isCharacterDead(firstTarget), true);
  assert.equal(isCharacterDead(secondTarget), true);
  assert.equal(
    attacker.inventory.carriedItems.some((item) => item.itemId === "bullet"),
    false
  );
});

test("two pistol shots may target the same player while they remain alive", () => {
  const { firstTarget, match, participant } = createMatch(20);
  firstTarget.stats.health.max = 20;

  const event = pistolEvent(executeShootPistolAction([participant], match));

  assert.deepEqual(
    event.targets?.map((target) => target.targetId),
    [firstTarget.id, firstTarget.id]
  );
  assert.deepEqual(
    event.targets?.map((target) => target.damageTaken),
    [10, 10]
  );
  assert.equal(isCharacterDead(firstTarget), true);
});

test("each pistol shot can use its own selected destination", () => {
  const { firstTarget, secondTarget, match, participant } = createMatch(20);
  firstTarget.stats.health.max = 20;
  participant.plan.targetPlayerIds = [];
  delete participant.plan.secondTargetPlayerId;
  participant.plan.targetLocationId = { q: 1, r: 0 };
  participant.plan.secondTargetLocationId = { q: 0, r: 1 };

  const event = pistolEvent(executeShootPistolAction([participant], match));

  assert.deepEqual(
    event.targets?.map((target) => target.targetId),
    [firstTarget.id, secondTarget.id]
  );
});

test("a second bullet is not charged when only one bullet is carried", () => {
  const { attacker, firstTarget, match, participant } = createMatch();
  const bullet = attacker.inventory.carriedItems.find(
    (item) => item.itemId === "bullet"
  );
  assert.ok(bullet);
  bullet.quantity = 1;

  const event = pistolEvent(executeShootPistolAction([participant], match));

  assert.equal(event.action.metadata?.bulletsConsumed, 1);
  assert.deepEqual(
    event.targets?.map((target) => target.targetId),
    [firstTarget.id]
  );
  assert.equal(attacker.stats.energy.current, 2);
  assert.equal(
    attacker.inventory.carriedItems.some((item) => item.itemId === "bullet"),
    false
  );
});
