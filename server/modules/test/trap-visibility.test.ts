/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TrapRecord } from "@shared";
import type { MatchRecord } from "../src/models/types";
import { tailorMatchForPlayer, tailorTrapsForViewer } from "../src/utils/matchView";

function createTrap(id: string, ownerId: string): TrapRecord {
  return {
    id,
    ownerId,
    from: { tileId: `${id}-from`, coord: { q: 0, r: 0 } },
    to: { tileId: `${id}-to`, coord: { q: 1, r: 0 } },
    damage: 7,
    placedTurn: 1,
  };
}

function createMatch(traps: TrapRecord[]): MatchRecord {
  return {
    match_id: "trap-visibility-test",
    players: ["owner", "other", "admin"],
    playerCharacters: {},
    playerList: {},
    size: 3,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    traps,
  };
}

test("normal match views only include viewer-owned traps; admin view includes all", () => {
  const traps = [createTrap("owner-trap", "owner"), createTrap("other-trap", "other")];
  const match = createMatch(traps);

  assert.deepEqual(
    tailorMatchForPlayer(match, "owner").traps?.map((trap) => trap.id),
    ["owner-trap"],
  );
  assert.deepEqual(tailorTrapsForViewer(traps, "other")?.map((trap) => trap.id), [
    "other-trap",
  ]);
  assert.deepEqual(tailorMatchForPlayer(match, "admin").traps, []);
  assert.deepEqual(
    tailorMatchForPlayer(match, "admin", true).traps?.map((trap) => trap.id),
    ["owner-trap", "other-trap"],
  );
});
