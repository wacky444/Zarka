import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  LocalizationType,
  type PlayerCharacter,
} from "@shared";
import type { MatchRecord } from "../../src/models/types";
import { executeUseBinocularsAction } from "../../src/match/actions/observeLocation";
import type { PlannedActionParticipant } from "../../src/match/actions/utils";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";

function createBinocularsScenario(options: {
  target?: { q: number; r: number };
  otherPlayer?: {
    id: string;
    coord: { q: number; r: number };
    hidden?: boolean;
    dead?: boolean;
  };
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
    },
  ];

  const playerCharacters: Record<string, PlayerCharacter> = {
    [character.id]: character,
  };

  if (options.otherPlayer) {
    const other = createDefaultCharacter(options.otherPlayer.id);
    other.position = {
      tileId: "tile_neighbor_1",
      coord: options.otherPlayer.coord,
    };
    if (options.otherPlayer.hidden) {
      other.abilities = ["coward"];
      other.cowardRevealedTurn = -1;
    }
    if (options.otherPlayer.dead) {
      other.statuses = {
        conditions: ["dead"],
        immunities: [],
        temporaryArmor: 0,
        invisibilityTurns: 0,
      };
      if (other.stats?.health) {
        other.stats.health.current = 0;
      }
    }
    playerCharacters[other.id] = other;
  }

  const match: MatchRecord = {
    match_id: "binoculars-test",
    players: Object.keys(playerCharacters),
    playerCharacters,
    playerList: {},
    size: Object.keys(playerCharacters).length,
    created_at: 1,
    current_turn: 2,
    started: true,
    removed: 0,
    map: {
      cols: 3,
      rows: 3,
      seed: "binoculars-test-seed",
      tiles,
    },
    items: [],
  };

  const plan = {
    actionId: ActionLibrary.use_binoculars.id,
    targetLocationId: options.target,
  };
  character.actionPlan = { main: plan };

  const participant: PlannedActionParticipant = {
    playerId: character.id,
    character,
    plan,
    planKey: "main",
  };

  return { character, match, participant };
}

test("use_binoculars reports observedCount 0 when no one is in target cell", () => {
  const { match, participant, character } = createBinocularsScenario({
    target: { q: 1, r: 0 },
  });

  const events = executeUseBinocularsAction([participant], match);

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.kind, "player");
  assert.equal(event.actorId, "player1");
  assert.equal(event.action.actionId, "use_binoculars");
  const metadata = event.action.metadata as {
    observed?: boolean;
    observedCount?: number;
    observedPlayerIds?: string[];
  };
  assert.equal(metadata?.observed, true);
  assert.equal(metadata?.observedCount, 0);
  assert.deepEqual(metadata?.observedPlayerIds, []);
  assert.deepEqual(character.remoteView, {
    coord: { q: 1, r: 0 },
    turn: 3,
  });
});

test("use_binoculars reports observedCount 1 when visible player is in target cell", () => {
  const { match, participant } = createBinocularsScenario({
    target: { q: 1, r: 0 },
    otherPlayer: {
      id: "player2",
      coord: { q: 1, r: 0 },
    },
  });

  const events = executeUseBinocularsAction([participant], match);

  assert.equal(events.length, 1);
  const metadata = events[0].action.metadata as {
    observed?: boolean;
    observedCount?: number;
    observedPlayerIds?: string[];
  };
  assert.equal(metadata?.observed, true);
  assert.equal(metadata?.observedCount, 1);
  assert.deepEqual(metadata?.observedPlayerIds, ["player2"]);
});

test("use_binoculars reports observedCount 0 when player in target cell is hidden", () => {
  const { match, participant } = createBinocularsScenario({
    target: { q: 1, r: 0 },
    otherPlayer: {
      id: "player2",
      coord: { q: 1, r: 0 },
      hidden: true,
    },
  });

  const events = executeUseBinocularsAction([participant], match);

  assert.equal(events.length, 1);
  const metadata = events[0].action.metadata as {
    observed?: boolean;
    observedCount?: number;
    observedPlayerIds?: string[];
  };
  assert.equal(metadata?.observed, true);
  assert.equal(metadata?.observedCount, 0);
  assert.deepEqual(metadata?.observedPlayerIds, []);
});

test("use_binoculars reports observedCount 0 when player in target cell is dead", () => {
  const { match, participant } = createBinocularsScenario({
    target: { q: 1, r: 0 },
    otherPlayer: {
      id: "player2",
      coord: { q: 1, r: 0 },
      dead: true,
    },
  });

  const events = executeUseBinocularsAction([participant], match);

  assert.equal(events.length, 1);
  const metadata = events[0].action.metadata as {
    observed?: boolean;
    observedCount?: number;
    observedPlayerIds?: string[];
  };
  assert.equal(metadata?.observed, true);
  assert.equal(metadata?.observedCount, 0);
  assert.deepEqual(metadata?.observedPlayerIds, []);
});
