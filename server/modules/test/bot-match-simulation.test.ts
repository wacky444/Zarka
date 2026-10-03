import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  generateGameMap,
  type ReplayEvent
} from "@shared";
import type { MatchRecord } from "../src/models/types";
import { advanceTurn } from "../src/match/advanceTurn";
import { processBotActions } from "../src/match/botAI";
import { checkEndGameOutcome } from "../src/match/checkEndGame";
import { distributeTeams } from "../src/match/teams";
import {
  assignSpawnPositions,
  createDefaultCharacter,
  isCharacterDead
} from "../src/utils/playerCharacter";

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface SimulationResult {
  ended: boolean;
  endReason?: string;
  winnerId?: string;
  totalTurns: number;
  totalEvents: number;
  aliveBots: string[];
  deadBotsOrder: string[];
}

function run12BotSimulation(seedNumber: number): SimulationResult {
  const originalRandom = Math.random;
  const originalDateNow = Date.now;

  Math.random = createSeededRandom(seedNumber);
  Date.now = () => 1700000000000;

  try {
    const botIds = Array.from({ length: 12 }, (_, i) => `bot${i + 1}`);
    const mapSeed = `seed-12-bots-${seedNumber}`;
    const generated = generateGameMap(
      DEFAULT_MAP_COLS,
      DEFAULT_MAP_ROWS,
      CellLibrary,
      mapSeed,
      30
    );

    const match: MatchRecord = {
      match_id: `match-sim-${seedNumber}`,
      players: botIds,
      botPlayers: 0,
      playerCharacters: Object.fromEntries(
        botIds.map((id) => [id, createDefaultCharacter(id)])
      ),
      playerList: {},
      readyStates: {},
      size: 12,
      cols: DEFAULT_MAP_COLS,
      rows: DEFAULT_MAP_ROWS,
      map: generated.map,
      items: generated.items,
      safeContainers: generated.safeContainers,
      turnsToBeAt1Tile: 30,
      created_at: 1700000000,
      current_turn: 0,
      started: true,
      removed: 0
    };

    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    } as unknown as nkruntime.Logger;

    assignSpawnPositions(match, logger);
    distributeTeams(match, logger);

    const allEvents: ReplayEvent[] = [];
    const deadBotsOrder: string[] = [];
    const turn0 = advanceTurn(match, 0, logger);
    allEvents.push(...turn0.events);

    let currentTurn = 0;
    const MAX_TURNS = 150;

    while (currentTurn < MAX_TURNS) {
      const outcome = checkEndGameOutcome(match);
      if (outcome.ended) {
        return {
          ended: true,
          endReason: outcome.reason,
          winnerId: outcome.winnerId,
          totalTurns: currentTurn,
          totalEvents: allEvents.length,
          aliveBots: outcome.aliveCharacterIds.sort(),
          deadBotsOrder
        };
      }

      currentTurn += 1;
      match.current_turn = currentTurn;
      processBotActions(match, logger);
      const turnResult = advanceTurn(match, currentTurn, logger);
      allEvents.push(...turnResult.events);

      for (const event of turnResult.events) {
        if (
          event.kind === "player" &&
          event.action.actionId === "status_dead"
        ) {
          if (!deadBotsOrder.includes(event.actorId)) {
            deadBotsOrder.push(event.actorId);
          }
        }
      }

      for (const botId of botIds) {
        if (
          !deadBotsOrder.includes(botId) &&
          isCharacterDead(match.playerCharacters?.[botId])
        ) {
          deadBotsOrder.push(botId);
        }
      }
    }

    const alive = Object.values(match.playerCharacters ?? {})
      .filter((c) => !isCharacterDead(c))
      .map((c) => `${c.id} (hp:${c.stats?.health?.current}, team:${c.teamId})`);

    const finalOutcome = checkEndGameOutcome(match);
    return {
      ended: finalOutcome.ended,
      endReason: finalOutcome.reason,
      winnerId: finalOutcome.winnerId,
      totalTurns: currentTurn,
      totalEvents: allEvents.length,
      aliveBots: alive,
      deadBotsOrder
    };
  } finally {
    Math.random = originalRandom;
    Date.now = originalDateNow;
  }
}

test("12-bot full match runs deterministically to completion", () => {
  const expectedDeadBotsOrder = [
    "bot7",
    "bot1",
    "bot4",
    "bot6",
    "bot8",
    "bot10",
    "bot12",
    "bot3",
    "bot2",
    "bot5"
  ];

  const runA = run12BotSimulation(42);
  const runB = run12BotSimulation(42);

  if (!runA.ended) {
    throw new Error(
      `Match did not end in ${runA.totalTurns} turns, alive: ${runA.aliveBots.join(", ")}, reason: ${runA.endReason}`
    );
  }
  console.log(
    "Dead bots order:",
    JSON.stringify(runA.deadBotsOrder),
    "finished in",
    runA.totalTurns,
    "turns"
  );
  assert.ok(runA.ended);
  assert.ok(runA.totalTurns > 0);
  assert.ok(runA.totalEvents > 0);
  assert.deepEqual(runA.deadBotsOrder, expectedDeadBotsOrder);
  assert.deepEqual(runA, runB);
});
