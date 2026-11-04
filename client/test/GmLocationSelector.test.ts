import test from "node:test";
import assert from "node:assert/strict";
import { ActionLibrary, axialDistance, type Axial, type MatchRecord, type PlayerCharacter } from "@shared";

function createMockCharacter(
  id: string,
  coord: Axial,
  overrides?: Partial<PlayerCharacter>
): PlayerCharacter {
  return {
    id,
    userId: id,
    name: `Char ${id}`,
    color: "#ff0000",
    position: { tileId: `${coord.q},${coord.r}`, coord },
    alive: true,
    stats: {
      health: { current: 10, max: 10 },
      energy: { current: 10, max: 10 },
      baseViewRange: 3
    },
    inventory: {
      carriedWeight: 0,
      maxWeight: 100,
      carriedItems: [
        { itemId: "fuel", quantity: 5 }
      ],
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

function createMockGmMatch(): MatchRecord {
  const char1 = createMockCharacter("gm_char_1", { q: 2, r: 2 });
  const char2 = createMockCharacter("gm_char_2", { q: 5, r: 5 });
  return {
    id: "match-gm",
    started: true,
    removed: 0,
    current_turn: 1,
    gameMasterMode: true,
    gameMasterUserIds: ["gm_admin_user"],
    players: ["gm_admin_user"],
    playerCharacters: {
      gm_char_1: char1,
      gm_char_2: char2
    },
    c4s: [
      {
        id: "c4_1",
        ownerId: "gm_char_1",
        tileId: "2,3",
        coord: { q: 2, r: 3 }
      },
      {
        id: "c4_2",
        ownerId: "gm_char_2",
        tileId: "5,6",
        coord: { q: 5, r: 6 }
      }
    ],
    map: {
      cols: 10,
      rows: 10,
      tiles: [
        { id: "2,2", coord: { q: 2, r: 2 }, cellType: "street" as any, walkable: true },
        { id: "2,3", coord: { q: 2, r: 3 }, cellType: "street" as any, walkable: true },
        { id: "2,4", coord: { q: 2, r: 4 }, cellType: "street" as any, walkable: true },
        { id: "3,2", coord: { q: 3, r: 2 }, cellType: "street" as any, walkable: true },
        { id: "5,5", coord: { q: 5, r: 5 }, cellType: "street" as any, walkable: true },
        { id: "5,6", coord: { q: 5, r: 6 }, cellType: "street" as any, walkable: true }
      ]
    }
  } as unknown as MatchRecord;
}

test("effective character in Game Master mode resolves active controlled character and not admin user ID", () => {
  const match = createMockGmMatch();
  const currentUserId = "gm_admin_user";

  const getEffectiveCharacterId = (activeControlledCharacterId: string | null): string | null => {
    if (match.gameMasterMode) {
      return (
        activeControlledCharacterId ??
        Object.keys(match.playerCharacters ?? {})[0] ??
        null
      );
    }
    return currentUserId;
  };

  assert.equal(getEffectiveCharacterId("gm_char_1"), "gm_char_1");
  assert.equal(getEffectiveCharacterId("gm_char_2"), "gm_char_2");
  // Default fallback when none selected
  assert.equal(getEffectiveCharacterId(null), "gm_char_1");
});

test("location range check in Game Master mode correctly uses active controlled character coordinates", () => {
  const match = createMockGmMatch();
  let activeCharId = "gm_char_1";

  const getEffectiveCharacterId = (): string | null => {
    if (match.gameMasterMode) {
      return (
        activeCharId ??
        Object.keys(match.playerCharacters ?? {})[0] ??
        null
      );
    }
    return "gm_admin_user";
  };

  const getCurrentPlayerCoord = (): Axial | null => {
    const effectiveCharId = getEffectiveCharacterId();
    if (
      effectiveCharId &&
      match.playerCharacters?.[effectiveCharId]?.position?.coord
    ) {
      return match.playerCharacters[effectiveCharId].position.coord;
    }
    return null;
  };

  const isLocationInRange = (actionId: string, target: Axial): boolean => {
    const effectiveCharId = getEffectiveCharacterId();
    if (actionId === "detonate_c4") {
      return (match.c4s ?? []).some(
        (charge) =>
          charge.ownerId === effectiveCharId &&
          charge.coord.q === target.q &&
          charge.coord.r === target.r
      );
    }
    const origin = getCurrentPlayerCoord();
    if (!origin) {
      return false;
    }
    const definition = ActionLibrary[actionId as keyof typeof ActionLibrary];
    const allowed = definition?.range && definition.range.length > 0 ? [...definition.range] : [0];
    const distance = axialDistance(origin, target);
    return allowed.includes(distance);
  };

  // For gm_char_1 at (2, 2):
  // (2, 3) is distance 1 -> in range for move
  assert.equal(isLocationInRange("move", { q: 2, r: 3 }), true);
  // (5, 5) is far -> not in range for move
  assert.equal(isLocationInRange("move", { q: 5, r: 5 }), false);
  // Detonate C4 at (2, 3) owned by gm_char_1 -> true
  assert.equal(isLocationInRange("detonate_c4", { q: 2, r: 3 }), true);
  // Detonate C4 at (5, 6) owned by gm_char_2 -> false (not owned by active char 1)
  assert.equal(isLocationInRange("detonate_c4", { q: 5, r: 6 }), false);

  // Switch to gm_char_2 at (5, 5):
  activeCharId = "gm_char_2";
  // (5, 6) is distance 1 -> in range for move
  assert.equal(isLocationInRange("move", { q: 5, r: 6 }), true);
  // (2, 3) is far -> not in range for move
  assert.equal(isLocationInRange("move", { q: 2, r: 3 }), false);
  // Detonate C4 at (5, 6) owned by gm_char_2 -> true
  assert.equal(isLocationInRange("detonate_c4", { q: 5, r: 6 }), true);
  // Detonate C4 at (2, 3) owned by gm_char_1 -> false
  assert.equal(isLocationInRange("detonate_c4", { q: 2, r: 3 }), false);
});
