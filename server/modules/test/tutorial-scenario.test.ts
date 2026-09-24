import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MATCH_CHAT_ROOM_CHANNEL_TYPE,
  MATCH_CHAT_ROOM_PREFIX,
  NAKAMA_SYSTEM_USER_ID,
  ShopLibrary,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_MESSAGES,
  TUTORIAL_MATCH_METADATA_KEY,
  type MatchChatMessage
} from "@shared";
import {
  createTutorialMatch,
  getTutorialBotPlan,
  TUTORIAL_BOT_NAME,
  TUTORIAL_CELL_COORDS
} from "../src/match/TutorialScenario";
import { planTutorialBotActions } from "../src/match/TutorialBotPlanner";
import { resolveTurnForMatch } from "../src/match/turnResolution";
import {
  sendTutorialBotMessageForTurn
} from "../src/match/TutorialBotChat";

type FakeStoredValue = { value: unknown; version: string };
type FakeBroadcast = {
  channelId: string;
  content: Record<string, unknown>;
  senderId?: string;
  senderUsername?: string;
  persist?: boolean;
};

function createFakeNakama() {
  const storedValues = new Map<string, FakeStoredValue>();
  const storedMessages: MatchChatMessage[] = [];
  const broadcasts: FakeBroadcast[] = [];
  let nextVersion = 0;
  const fake = {
    storageRead: (requests: Array<{ collection: string; key: string }>) =>
      requests.flatMap((request) => {
        const stored = storedValues.get(`${request.collection}:${request.key}`);
        return stored ? [{ value: stored.value, version: stored.version }] : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        value: unknown;
      }>
    ) => {
      for (const request of requests) {
        const key = `${request.collection}:${request.key}`;
        const value = request.value as { messages?: MatchChatMessage[] };
        if (Array.isArray(value.messages)) {
          storedMessages.splice(0, storedMessages.length, ...value.messages);
        }
        storedValues.set(key, {
          value: request.value,
          version: String(++nextVersion)
        });
      }
    },
    storageList: () => [],
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: () => "",
    channelIdBuild: (
      _sender: string | undefined,
      target: string,
      channelType: number
    ) => `${channelType}:${target}`,
    channelMessageSend: (
      channelId: string,
      content: Record<string, unknown>,
      senderId?: string,
      senderUsername?: string,
      persist?: boolean
    ) => {
      broadcasts.push({
        channelId,
        content,
        senderId,
        senderUsername,
        persist
      });
      return { channelId, messageId: "tutorial-chat" };
    }
  };
  return {
    nakama: fake as unknown as nkruntime.Nakama,
    broadcasts,
    storedMessages
  };
}

function createTestLogger(): nkruntime.Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
}

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

  const logger = createTestLogger();
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

test("a successful Feed turn sends one persistent, live bot claim", () => {
  const match = createTutorialMatch({
    matchId: "tutorial-feed-chat-test",
    playerId: "player-test",
    createdAt: 123
  });
  const playerId = match.players[0];
  const player = match.playerCharacters[playerId];
  player.inventory.carriedItems = [
    { itemId: "food", quantity: 1, weight: 3 }
  ];
  player.actionPlan = {
    secondary: { actionId: "feed", targetPlayerIds: [playerId] }
  };

  const result = resolveTurnForMatch(
    match,
    createTestLogger(),
    undefined as unknown as nkruntime.Nakama
  );
  const fake = createFakeNakama();

  assert.equal(
    sendTutorialBotMessageForTurn(match, result.events, fake.nakama, createTestLogger()),
    true
  );
  assert.equal(
    sendTutorialBotMessageForTurn(match, result.events, fake.nakama, createTestLogger()),
    false
  );
  assert.equal(fake.storedMessages.length, 1);
  assert.equal(fake.storedMessages[0].senderId, TUTORIAL_BOT_ID);
  assert.equal(
    fake.storedMessages[0].messageId,
    `tutorial:${match.match_id}:bot_claim`
  );
  assert.equal(fake.storedMessages[0].content, TUTORIAL_BOT_MESSAGES.bot_claim);
  assert.equal(fake.broadcasts.length, 1);
  assert.equal(
    fake.broadcasts[0].channelId,
    `${MATCH_CHAT_ROOM_CHANNEL_TYPE}:${MATCH_CHAT_ROOM_PREFIX}${match.match_id}`
  );
  assert.equal(fake.broadcasts[0].senderId, NAKAMA_SYSTEM_USER_ID);
  assert.equal(fake.broadcasts[0].senderUsername, TUTORIAL_BOT_NAME);
  assert.equal(fake.broadcasts[0].persist, false);
  assert.equal(fake.broadcasts[0].content.tutorialBotId, TUTORIAL_BOT_ID);
  assert.equal(fake.broadcasts[0].content.tutorialMessageKey, "bot_claim");
});

test("the final tutorial Scare uses one extra execution and its selected cell", () => {
  const match = createTutorialMatch({
    matchId: "tutorial-final-scare-test",
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
  bot.actionPlan = {
    main: {
      actionId: "move",
      targetLocationId: TUTORIAL_CELL_COORDS.spare
    }
  };
  player.actionPlan = {
    main: {
      actionId: "scare",
      extraExecutions: 1,
      targetPlayerIds: [TUTORIAL_BOT_ID],
      targetLocationId: TUTORIAL_CELL_COORDS.doomed
    }
  };

  const result = resolveTurnForMatch(
    match,
    createTestLogger(),
    undefined as unknown as nkruntime.Nakama
  );
  const scareEvent = result.events.find(
    (event) =>
      event.kind === "player" &&
      event.actorId === playerId &&
      event.action.actionId === "scare"
  );
  if (!scareEvent || scareEvent.kind !== "player") {
    throw new Error("Expected the player Scare event");
  }
  const target = scareEvent.targets?.find(
    (entry) => entry.targetId === TUTORIAL_BOT_ID
  );

  assert.deepEqual(bot.position?.coord, TUTORIAL_CELL_COORDS.doomed);
  assert.deepEqual(player.position?.coord, TUTORIAL_CELL_COORDS.playerStart);
  assert.equal(player.stats.energy.current, 14);
  assert.deepEqual(target?.metadata?.movedTo, TUTORIAL_CELL_COORDS.doomed);
  assert.equal(
    result.events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === TUTORIAL_BOT_ID &&
        (event.action.actionId === "move" ||
          event.action.actionId === "scare")
    ),
    false
  );
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

  player.actionPlan = {
    main: { actionId: "axe_attack" }
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
