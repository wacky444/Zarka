import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ReplayActionEffect,
  SkillLibrary,
  hasVengefulSkill,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import {
  maybeTriggerVengefulCounterAttack,
  selectVengefulWeapon,
} from "../../src/match/actions/vengeful";
import { advanceTurn } from "../../src/match/advanceTurn";

function createMatchWithTwoCharacters(
  sameTile = true
): { match: MatchRecord; p1: PlayerCharacter; p2: PlayerCharacter } {
  const p1 = createDefaultCharacter("p1");
  const p2 = createDefaultCharacter("p2");
  p1.position = { tileId: "hex_0_0", coord: { q: 0, r: 0 } };
  p2.position = sameTile
    ? { tileId: "hex_0_0", coord: { q: 0, r: 0 } }
    : { tileId: "hex_1_0", coord: { q: 1, r: 0 } };

  const match: MatchRecord = {
    match_id: "test-vengeful-match",
    players: ["p1", "p2"],
    botPlayers: 0,
    current_turn: 1,
    turn: 1,
    playerCharacters: { p1, p2 },
    map: {
      cols: 5,
      rows: 5,
      tiles: [
        { id: "hex_0_0", type: "grass", coord: { q: 0, r: 0 }, itemIds: [] },
        { id: "hex_1_0", type: "grass", coord: { q: 1, r: 0 }, itemIds: [] },
      ],
    },
  };

  return { match, p1, p2 };
}

const nullLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as nkruntime.Logger;

test("Vengeful skill is implemented, costs 5 points, and has max 1 rank", () => {
  const definition = SkillLibrary.vengeful;
  assert.equal(definition.implemented, true);
  assert.equal(definition.cost, 5);
  assert.equal(definition.max, 1);
  assert.equal(definition.category, "offensive");
  assert.equal(definition.effect?.type, "counterattack_on_attacked");

  const character = createDefaultCharacter("test");
  assert.equal(hasVengefulSkill(character), false);
  character.abilities = ["vengeful"];
  assert.equal(hasVengefulSkill(character), true);
});

test("selectVengefulWeapon picks knife, bat, nail_bat, axe, or punch if unarmed", () => {
  const c = createDefaultCharacter("test-weapons");
  c.inventory.carriedItems = [];

  const punchChoice = selectVengefulWeapon(c);
  assert.equal(punchChoice.actionId, "punch");
  assert.equal(punchChoice.baseDamage, 2);

  c.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  const knifeChoice = selectVengefulWeapon(c);
  assert.equal(knifeChoice.actionId, "knife_attack");
  assert.equal(knifeChoice.baseDamage, 4);

  c.inventory.carriedItems = [{ itemId: "bat", quantity: 1, weight: 2 }];
  const batChoice = selectVengefulWeapon(c);
  assert.equal(batChoice.actionId, "bat_attack");
  assert.equal(batChoice.baseDamage, 5);
  assert.equal(batChoice.metadata?.weaponUsed, "bat");

  c.inventory.carriedItems = [{ itemId: "nail_bat", quantity: 1, weight: 2 }];
  const nailBatChoice = selectVengefulWeapon(c);
  assert.equal(nailBatChoice.actionId, "bat_attack");
  assert.equal(nailBatChoice.baseDamage, 7);
  assert.equal(nailBatChoice.metadata?.weaponUsed, "nail_bat");

  c.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 3 }];
  const axeChoice = selectVengefulWeapon(c);
  assert.equal(axeChoice.actionId, "axe_attack");
  assert.equal(axeChoice.baseDamage, 8);
});

test("when attacked in the same location, defender with vengeful counterattacks immediately", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];

  p1.actionPlan = {
    main: {
      actionId: "punch",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const initialP2Health = p2.stats.health.current;

  const result = advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p2.stats.health.current, initialP2Health - 2);
  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 4);

  const counterEvent = result.events.find(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      e.actorId === "p2" &&
      e.action.actionId === "knife_attack" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.ok(counterEvent, "Expected counterattack event from p2");
  assert.equal(counterEvent.targets?.[0].targetId, "p1");
  assert.equal(counterEvent.targets?.[0].damageTaken, 4);
});

test("counterattack triggers with punch if defender carries no melee weapons", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [];

  p1.actionPlan = {
    main: {
      actionId: "punch",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const result = advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 2);

  const counterEvent = result.events.find(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      e.actorId === "p2" &&
      e.action.actionId === "punch" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.ok(counterEvent, "Expected punch counterattack event from p2");
});

test("defender counterattacks even if knocked unconscious by the attack", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 3 }];
  p2.stats.health.current = 6;
  p2.stats.health.knockoutThreshold = 5;

  p1.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  p1.actionPlan = {
    main: {
      actionId: "knife_attack",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const result = advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p2.stats.health.current, 2);
  assert.ok(match.playerCharacters.p2.statuses.conditions.includes("unconscious"));

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 8);

  const counterEvent = result.events.find(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      e.actorId === "p2" &&
      e.action.actionId === "axe_attack" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.ok(counterEvent, "Expected axe counterattack from unconscious defender");
});

test("defender does not counterattack if killed by the attack", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 3 }];
  p2.stats.health.current = 3;

  p1.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  p1.actionPlan = {
    main: {
      actionId: "knife_attack",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const result = advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p2.stats.health.current, 0);
  assert.ok(match.playerCharacters.p2.statuses.conditions.includes("dead"));

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health);

  const counterEvent = result.events.find(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      e.actorId === "p2" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.equal(counterEvent, undefined, "Dead character should not counterattack");
});

test("no counterattack if aggressor attacked from a different location", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(false);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 3 }];

  p1.inventory.carriedItems = [
    { itemId: "pistol", quantity: 1, weight: 2 },
    { itemId: "bullet", quantity: 1, weight: 1 },
  ];
  p1.actionPlan = {
    main: {
      actionId: "shoot_pistol",
      targetPlayerIds: ["p2"],
      targetLocationId: { q: 1, r: 0 },
    },
  };

  const initialP1Health = p1.stats.health.current;
  advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health);
});

test("counterattack does not trigger a counterattack in return", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p1.abilities = ["vengeful"];
  p2.abilities = ["vengeful"];
  p1.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  p2.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];

  p1.actionPlan = {
    main: {
      actionId: "knife_attack",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const initialP2Health = p2.stats.health.current;

  const result = advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p2.stats.health.current, initialP2Health - 4);
  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 4);

  const counterEvents = result.events.filter(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.equal(counterEvents.length, 1, "Only one counterattack should occur, no chain");
  assert.equal(counterEvents[0].actorId, "p2");
});

test("counterattack does not cost energy and is not blocked by action cooldown", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  p2.stats.energy.current = 0;
  p2.cooldowns = { knife_attack: 3 };

  p1.actionPlan = {
    main: {
      actionId: "punch",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 4);
  assert.equal(match.playerCharacters.p2.stats.energy.current, 0);
});

test("counterattack can be dodged by the aggressor", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful"];
  p2.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];

  p1.abilities = ["agility1", "agility1", "agility1"];
  p1.statuses.dodgeAttempts = 1;

  const initialP1Health = p1.stats.health.current;
  const events = maybeTriggerVengefulCounterAttack(match, "p1", "p2");

  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health);
  assert.equal(p1.statuses.dodgeAttempts, 0);

  const counterEvent = events.find(
    (e): e is ReplayPlayerEvent =>
      e.kind === "player" &&
      e.actorId === "p2" &&
      (e.action.metadata as { isCounterAttack?: boolean })?.isCounterAttack === true
  );
  assert.ok(counterEvent);
  assert.equal(counterEvent.targets?.[0].effects, ReplayActionEffect.Dodged);
  assert.equal(counterEvent.targets?.[0].damageTaken, 0);
});

test("defender dodges attack but still counterattacks", () => {
  const { match, p1, p2 } = createMatchWithTwoCharacters(true);
  p2.abilities = ["vengeful", "agility1", "agility1", "agility1"];
  p2.inventory.carriedItems = [{ itemId: "knife", quantity: 1, weight: 1 }];
  p2.actionPlan = {
    main: {
      actionId: "dodge",
    },
  };

  p1.actionPlan = {
    main: {
      actionId: "punch",
      targetPlayerIds: ["p2"],
    },
  };

  const initialP1Health = p1.stats.health.current;
  const initialP2Health = p2.stats.health.current;
  advanceTurn(match, 1, nullLogger);

  assert.equal(match.playerCharacters.p2.stats.health.current, initialP2Health);
  assert.equal(match.playerCharacters.p1.stats.health.current, initialP1Health - 4);
});
