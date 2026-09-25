import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  axialDistance,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { executeLookThroughWindowAction } from "../src/match/actions/observeLocation";
import type { PlannedActionParticipant } from "../src/match/actions/utils";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

function createLookScenario(options: {
  target?: { q: number; r: number };
  destroyNearby?: boolean;
}): {
  character: PlayerCharacter;
  match: MatchRecord;
  participant: PlannedActionParticipant;
} {
  const character = createDefaultCharacter("player1");
  character.position = { tileId: "tile_center", coord: { q: 0, r: 0 } };

  const tiles = [
    {
      id: "tile_center",
      coord: { q: 0, r: 0 },
      localizationType: LocalizationType.House,
      walkable: true,
      itemIds: [],
    },
    {
      id: "tile_neighbor_1",
      coord: { q: 1, r: 0 },
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
      meta: options.destroyNearby ? { destroyed: true } : undefined,
    },
    {
      id: "tile_neighbor_2",
      coord: { q: 0, r: 1 },
      localizationType: LocalizationType.Road,
      walkable: true,
      itemIds: [],
      meta: options.destroyNearby ? { destroyed: true } : undefined,
    },
  ];

  const match: MatchRecord = {
    match_id: "look-test",
    players: [character.id],
    playerCharacters: { [character.id]: character },
    playerList: {},
    size: 1,
    created_at: 1,
    current_turn: 2,
    started: true,
    removed: 0,
    map: {
      cols: 3,
      rows: 3,
      seed: "look-test-seed",
      tiles,
    },
    items: [],
  };

  const plan = {
    actionId: ActionLibrary.look_through_window.id,
    targetLocationId: options.target,
  };
  character.actionPlan = { secondary: plan };

  const participant: PlannedActionParticipant = {
    playerId: character.id,
    character,
    plan,
    planKey: "secondary",
  };

  return { character, match, participant };
}

test("look_through_window with target observes specified nearby cell", () => {
  const { match, participant, character } = createLookScenario({
    target: { q: 1, r: 0 },
  });

  const events = executeLookThroughWindowAction([participant], match);

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.kind, "player");
  assert.equal(event.actorId, "player1");
  assert.equal(event.action.actionId, "look_through_window");
  assert.deepEqual(event.action.targetLocation, { q: 1, r: 0 });
  assert.deepEqual(
    (event.action.metadata as { observedLocation?: unknown })
      ?.observedLocation,
    { q: 1, r: 0 }
  );
  assert.equal(
    (event.action.metadata as { observed?: boolean })?.observed,
    true
  );
  assert.deepEqual(character.remoteView, {
    coord: { q: 1, r: 0 },
    turn: 3,
  });
});

test("look_through_window without target selects a random nearby cell", () => {
  const { match, participant, character } = createLookScenario({});

  const events = executeLookThroughWindowAction([participant], match);

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.kind, "player");
  assert.equal(event.actorId, "player1");
  assert.equal(event.action.actionId, "look_through_window");
  const targetLoc = event.action.targetLocation;
  assert.ok(targetLoc);
  assert.equal(axialDistance({ q: 0, r: 0 }, targetLoc), 1);
  assert.deepEqual(
    (event.action.metadata as { observedLocation?: unknown })
      ?.observedLocation,
    targetLoc
  );
  assert.equal(
    (event.action.metadata as { observed?: boolean })?.observed,
    true
  );
  assert.deepEqual(character.remoteView, {
    coord: targetLoc,
    turn: 3,
  });
});

test("look_through_window without target fails gracefully if all neighbors destroyed", () => {
  const { match, participant, character } = createLookScenario({
    destroyNearby: true,
  });

  const events = executeLookThroughWindowAction([participant], match);

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(
    (event.action.metadata as { observed?: boolean })?.observed,
    false
  );
  assert.equal(character.remoteView, undefined);
});
