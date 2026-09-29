import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  type ActionId,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeAxeAttackAction } from "../src/match/actions/axeAttack";
import { canFeedParticipant } from "../src/match/actions/feed";
import { executeUseChemicalWeaponAction } from "../src/match/actions/UseChemicalWeapon";
import { collectTargets } from "../src/match/actions/targeting";
import {
  collectPlanTargetIds,
  type DeadCharacterTargetPolicy,
  type PlannedActionParticipant,
} from "../src/match/actions/utils";
import { createDefaultCharacter, isCharacterDead } from "../src/utils/playerCharacter";

function createScenario(): {
  actor: PlayerCharacter;
  corpse: PlayerCharacter;
  livingTarget: PlayerCharacter;
  match: MatchRecord;
} {
  const actor = createDefaultCharacter("actor");
  const corpse = createDefaultCharacter("corpse");
  const livingTarget = createDefaultCharacter("living-target");
  for (const character of [actor, corpse, livingTarget]) {
    character.position = { tileId: "same-tile", coord: { q: 0, r: 0 } };
  }
  corpse.stats.health.current = 0;
  corpse.statuses.conditions.push("dead");
  livingTarget.stats.health.current = 20;
  livingTarget.stats.health.max = 20;

  const match: MatchRecord = {
    match_id: "dead-target-policy-test",
    players: [actor.id, corpse.id, livingTarget.id],
    playerCharacters: {
      [actor.id]: actor,
      [corpse.id]: corpse,
      [livingTarget.id]: livingTarget,
    },
    playerList: {},
    size: 3,
    created_at: 1,
    current_turn: 0,
    started: true,
    removed: 0,
  };
  return { actor, corpse, livingTarget, match };
}

function createParticipant(
  actor: PlayerCharacter,
  actionId: ActionId
): PlannedActionParticipant {
  return {
    playerId: actor.id,
    character: actor,
    plan: { actionId },
    planKey: "main",
  };
}

function getTargetIds(
  policy: DeadCharacterTargetPolicy
): string[] {
  const { actor, match } = createScenario();
  const participant = createParticipant(actor, ActionLibrary.punch.id);
  return collectTargets(ActionLibrary.punch.id, participant, match, {
    deadCharacterPolicy: policy,
    allowMultiple: true,
  }).map((candidate) => candidate.id);
}

test("target collector supports include, exclude, and onlyDead policies", () => {
  assert.deepEqual(getTargetIds("include"), ["corpse", "living-target"]);
  assert.deepEqual(getTargetIds("exclude"), ["living-target"]);
  assert.deepEqual(getTargetIds("onlyDead"), ["corpse"]);
});

test("direct target collection applies dead-character policy without self-fallback", () => {
  const { actor, corpse, match } = createScenario();
  const participant = createParticipant(actor, ActionLibrary.use_medicine.id);
  participant.plan.targetPlayerIds = [corpse.id];

  assert.deepEqual(
    collectPlanTargetIds(participant, match, { deadCharacterPolicy: "exclude" }),
    []
  );
  assert.deepEqual(
    collectPlanTargetIds(participant, match, { deadCharacterPolicy: "include" }),
    [corpse.id]
  );
});

test("Feed ignores temporary energy but still requires an available corpse", () => {
  const { actor, corpse, match } = createScenario();
  actor.inventory.carriedItems = [];
  actor.stats.energy.current = 1;
  const energy = actor.stats.energy as typeof actor.stats.energy & {
    activeTemporary?: number;
  };
  energy.activeTemporary = 6;
  energy.temporary = 4;
  assert.equal(canFeedParticipant(actor, match), false);

  actor.stats.energy.current = 0;
  assert.equal(canFeedParticipant(actor, match), true);

  corpse.stats.health.current = 20;
  corpse.statuses.conditions = corpse.statuses.conditions.filter(
    (condition) => condition !== "dead"
  );
  assert.equal(canFeedParticipant(actor, match), false);
});

test("axe attack auto-targets a living character instead of an earlier corpse", () => {
  const { actor, corpse, livingTarget, match } = createScenario();
  const participant = createParticipant(actor, ActionLibrary.axe_attack.id);

  const events = executeAxeAttackAction([participant], match);
  const attack = events.find(
    (event) => event.kind === "player" && event.action.actionId === "axe_attack"
  );

  assert.ok(attack && attack.kind === "player");
  assert.deepEqual(attack.targets?.map((target) => target.targetId), [livingTarget.id]);
  assert.equal(livingTarget.stats.health.current, 12);
  assert.equal(isCharacterDead(corpse), true);
});

test("single-target chemical weapon skips dead characters", () => {
  const { actor, corpse, livingTarget, match } = createScenario();
  actor.inventory.carriedItems = [
    { itemId: "chemical_weapon", quantity: 1, weight: 6 },
  ];
  const participant = createParticipant(actor, ActionLibrary.use_chemical_weapon.id);
  participant.plan.singleTarget = true;

  const events = executeUseChemicalWeaponAction([participant], match);
  const attack = events.find(
    (event) =>
      event.kind === "player" &&
      event.action.actionId === "use_chemical_weapon"
  );

  assert.ok(attack && attack.kind === "player");
  assert.deepEqual(attack.targets?.map((target) => target.targetId), [livingTarget.id]);
  assert.equal(livingTarget.stats.health.current, 9);
  assert.equal(isCharacterDead(corpse), true);
});
