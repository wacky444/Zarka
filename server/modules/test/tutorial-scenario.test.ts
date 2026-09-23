import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ShopLibrary,
  TUTORIAL_MATCH_METADATA_KEY
} from "@shared";
import {
  createTutorialMatch,
  getTutorialBotPlan,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_NAME,
  TUTORIAL_CELL_COORDS
} from "../src/match/TutorialScenario";
import { planTutorialBotActions } from "../src/match/TutorialBotPlanner";
import { resolveTurnForMatch } from "../src/match/turnResolution";

test("tutorial fixture and scripted bot plans are deterministic", () => {
  const options = {
    matchId: "tutorial-session-test",
    playerId: "player-test",
    createdAt: 123
  };
  const first = createTutorialMatch(options);
  const second = createTutorialMatch(options);

  assert.deepEqual(first, second);
  assert.equal(
    first.metadata?.[TUTORIAL_MATCH_METADATA_KEY]?.type,
    "guided_tutorial"
  );
  assert.equal(first.metadata?.[TUTORIAL_MATCH_METADATA_KEY]?.version, 1);
  const concurrentSession = createTutorialMatch({
    ...options,
    matchId: "tutorial-session-concurrent"
  });
  assert.notDeepEqual(
    first.items?.map((item) => item.item_id),
    concurrentSession.items?.map((item) => item.item_id)
  );
  assert.deepEqual(
    first.map?.tiles.map((tile) => tile.coord),
    [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 }
    ]
  );
  assert.deepEqual(
    first.playerCharacters[first.players[0]]?.position?.coord,
    TUTORIAL_CELL_COORDS.playerStart
  );
  assert.deepEqual(
    first.playerCharacters[TUTORIAL_BOT_ID]?.position?.coord,
    TUTORIAL_CELL_COORDS.botStart
  );
  assert.equal(
    first.playerCharacters[TUTORIAL_BOT_ID]?.name,
    TUTORIAL_BOT_NAME
  );
  assert.notEqual(
    first.playerCharacters[first.players[0]]?.teamId,
    first.playerCharacters[TUTORIAL_BOT_ID]?.teamId
  );
  assert.deepEqual(
    first.items?.map((item) => item.item_type),
    ["bandage", "axe", "food"]
  );
  assert.deepEqual(
    first.map?.tiles[0]?.itemIds,
    first.items?.map((item) => item.item_id)
  );

  const player = first.playerCharacters[first.players[0]];
  assert.equal(player.stats.health.current, 12);
  assert.equal(player.stats.health.max, 12);
  assert.equal(player.stats.energy.current, 20);
  assert.equal(player.stats.energy.max, 20);
  assert.equal(player.progression.availableSkillPoints, 5);
  assert.equal(player.economy.zarkans, ShopLibrary.detective.cost);
  assert.deepEqual(player.inventory.carriedItems, []);
  assert.equal(first.cols, 2);
  assert.equal(first.rows, 2);
  assert.equal(first.roundTime, "23:00");
  assert.equal(first.autoSkip, false);
  assert.equal(first.turnsToBeAt1Tile, 30);

  assert.deepEqual(getTutorialBotPlan("feed_bot", player.id), {
    actionId: "move",
    targetLocationId: TUTORIAL_CELL_COORDS.playerStart
  });
  assert.deepEqual(getTutorialBotPlan("resolve_bot_scare", player.id), {
    actionId: "scare",
    extraExecutions: 1,
    targetPlayerIds: [player.id],
    targetLocationId: TUTORIAL_CELL_COORDS.doomed
  });
  assert.equal(getTutorialBotPlan("buy_detective", player.id), null);
});

test("scripted Scare moves the player out of Axe range before Axe resolves", () => {
  const match = createTutorialMatch({
    matchId: "tutorial-scare-test",
    playerId: "player-test",
    createdAt: 123
  });
  const playerId = match.players[0];
  const player = match.playerCharacters[playerId];
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];
  if (!player.position) {
    throw new Error("Tutorial player has no starting position");
  }
  bot.position = {
    tileId: player.position.tileId,
    coord: { ...player.position.coord }
  };
  player.inventory.carriedItems = [
    { itemId: "axe", quantity: 1, weight: 3 }
  ];
  player.actionPlan = {
    main: { actionId: "axe_attack", targetPlayerIds: [TUTORIAL_BOT_ID] }
  };

  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
  const result = resolveTurnForMatch(
    match,
    logger,
    undefined as unknown as nkruntime.Nakama
  );

  assert.equal(result.advanced, true);
  assert.deepEqual(player.position.coord, TUTORIAL_CELL_COORDS.doomed);
  assert.equal(bot.stats.health.current, 12);
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" && event.action.actionId === "axe_attack"
    ),
    false
  );
  const scareEvent = result.events.find(
    (event) =>
      event.kind === "player" &&
      event.actorId === TUTORIAL_BOT_ID &&
      event.action.actionId === "scare"
  );
  if (!scareEvent || scareEvent.kind !== "player") {
    throw new Error("Expected the tutorial bot's Scare event");
  }
  const target = scareEvent.targets?.find(
    (entry) => entry.targetId === playerId
  );
  if (!target) {
    throw new Error("Expected Scare to move the tutorial player");
  }
  assert.deepEqual(target.metadata?.movedTo, TUTORIAL_CELL_COORDS.doomed);
});

test("tutorial bot only executes the scripted feed and scare plans", () => {
  const match = createTutorialMatch({
    matchId: "tutorial-bot-test",
    playerId: "player-test",
    createdAt: 123
  });
  const playerId = match.players[0];
  const player = match.playerCharacters[playerId];
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];

  player.actionPlan = {
    secondary: { actionId: "feed", targetPlayerIds: [playerId] }
  };
  planTutorialBotActions(match);
  assert.deepEqual(
    bot.actionPlan?.main,
    getTutorialBotPlan("feed_bot", playerId)
  );

  if (!player.position) {
    throw new Error("Tutorial player has no starting position");
  }
  bot.position = {
    tileId: player.position.tileId,
    coord: { ...player.position.coord }
  };
  player.actionPlan = {
    main: { actionId: "axe_attack", targetPlayerIds: [TUTORIAL_BOT_ID] }
  };
  planTutorialBotActions(match);
  assert.deepEqual(
    bot.actionPlan?.main,
    getTutorialBotPlan("resolve_bot_scare", playerId)
  );

  player.actionPlan = undefined;
  planTutorialBotActions(match);
  assert.equal(bot.actionPlan, undefined);
});
