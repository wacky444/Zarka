import test from "node:test";
import assert from "node:assert/strict";
import type { MatchRecord, PlayerCharacter } from "@shared";
import {
  buildPlayerTargetOptionSets,
  type PlayerTargetOptionSets
} from "../src/ui/panel/CharacterPanelPlayerOptions.ts";
import type { PlayerOption } from "../src/ui/PlayerSelector.ts";

function createMockCharacter(
  id: string,
  coord: { q: number; r: number },
  overrides?: Partial<PlayerCharacter>
): PlayerCharacter {
  return {
    id,
    userId: id,
    name: `Player_${id}`,
    color: "#ff0000",
    position: { tileId: `${coord.q},${coord.r}`, coord },
    alive: true,
    stats: {
      health: { current: 10, max: 10 },
      energy: { current: 10, max: 10 }
    },
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [],
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

test("turn 0 only counts characters on the same cell (distance 0) as visible", () => {
  const actor = createMockCharacter("actor", { q: 0, r: 0 });
  const sameCellPlayer = createMockCharacter("co-located", { q: 0, r: 0 });
  const distantPlayer = createMockCharacter("distant", { q: 1, r: 0 });

  const match = {
    match_id: "match-1",
    current_turn: 0,
    players: ["actor", "co-located", "distant"],
    playerCharacters: {
      actor,
      "co-located": sameCellPlayer,
      distant: distantPlayer
    },
    playerList: {
      actor: { id: "actor", name: "Actor" },
      "co-located": { id: "co-located", name: "CoLocated" },
      distant: { id: "distant", name: "Distant" }
    },
    deadCharacters: {}
  } as unknown as MatchRecord;

  const playerOptions: PlayerOption[] = [
    { id: "actor", label: "Actor" },
    { id: "co-located", label: "CoLocated" },
    { id: "distant", label: "Distant" }
  ];

  const sets: PlayerTargetOptionSets = buildPlayerTargetOptionSets({
    match,
    playerOptions,
    currentUserId: "actor",
    mainActionId: "attack",
    secondaryActionId: null,
    extraSecondaryActionId: null,
    mainAllowsSelf: false,
    secondaryAllowsSelf: false,
    extraSecondaryAllowsSelf: false
  });

  const coLocatedOption = sets.main.find((opt) => opt.id === "co-located");
  const distantOption = sets.main.find((opt) => opt.id === "distant");

  assert.ok(coLocatedOption, "Co-located player option should exist");
  assert.equal(
    coLocatedOption?.warning,
    undefined,
    "Co-located player should be visible with no warning"
  );

  assert.ok(distantOption, "Distant player option should exist");
  assert.equal(
    distantOption?.warning,
    "Not visible",
    "Distant player on turn 0 should have 'Not visible' warning"
  );

  // Visible option should be sorted before not-visible option
  assert.equal(sets.main[0].id, "co-located");
  assert.equal(sets.main[1].id, "distant");
});

test("turn > 0 counts any player in playerCharacters as visible", () => {
  const actor = createMockCharacter("actor", { q: 0, r: 0 });
  const distantPlayer = createMockCharacter("distant", { q: 2, r: -1 });

  const match = {
    match_id: "match-1",
    current_turn: 1,
    players: ["actor", "distant"],
    playerCharacters: {
      actor,
      distant: distantPlayer
    },
    playerList: {
      actor: { id: "actor", name: "Actor" },
      distant: { id: "distant", name: "Distant" }
    },
    deadCharacters: {}
  } as unknown as MatchRecord;

  const playerOptions: PlayerOption[] = [
    { id: "actor", label: "Actor" },
    { id: "distant", label: "Distant" },
    { id: "unknown", label: "Unknown" }
  ];

  const sets = buildPlayerTargetOptionSets({
    match,
    playerOptions,
    currentUserId: "actor",
    mainActionId: "attack",
    secondaryActionId: null,
    extraSecondaryActionId: null,
    mainAllowsSelf: false,
    secondaryAllowsSelf: false,
    extraSecondaryAllowsSelf: false
  });

  const distantOption = sets.main.find((opt) => opt.id === "distant");
  const unknownOption = sets.main.find((opt) => opt.id === "unknown");

  assert.equal(
    distantOption?.warning,
    undefined,
    "On turn 1, players present in playerCharacters are visible"
  );
  assert.equal(
    unknownOption?.warning,
    "Not visible",
    "Players absent from playerCharacters are not visible"
  );
});

test("turn 0 treats actor themselves as visible when action allows self", () => {
  const actor = createMockCharacter("actor", { q: 1, r: 2 });

  const match = {
    match_id: "match-1",
    current_turn: 0,
    players: ["actor"],
    playerCharacters: { actor },
    playerList: { actor: { id: "actor", name: "Actor" } },
    deadCharacters: {}
  } as unknown as MatchRecord;

  const playerOptions: PlayerOption[] = [
    { id: "actor", label: "Actor" }
  ];

  const sets = buildPlayerTargetOptionSets({
    match,
    playerOptions,
    currentUserId: "actor",
    mainActionId: "protect",
    secondaryActionId: null,
    extraSecondaryActionId: null,
    mainAllowsSelf: true,
    secondaryAllowsSelf: false,
    extraSecondaryAllowsSelf: false
  });

  const selfOption = sets.main.find((opt) => opt.id === "actor");
  assert.ok(selfOption);
  assert.equal(selfOption?.warning, undefined, "Self should be visible on turn 0");
});
