import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getActionEnergyDiscount,
  ShopLibrary,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_MESSAGES,
  TUTORIAL_CELL_COORDS,
  TUTORIAL_COMPLETION_PROFILE_KEY,
  TUTORIAL_MATCH_METADATA_KEY,
  TUTORIAL_STEP_IDS,
  type MatchRecord,
  type MatchReport,
  type ReplayEvent,
  type ReplayRecord,
  type TutorialStepId
} from "@shared";
import { buyShopItemRpc } from "../src/rpc/buyShopItem";
import { createMatchRpc } from "../src/rpc/createMatch";
import { createTutorialMatchRpc } from "../src/rpc/createTutorialMatch";
import { getUserAccountRpc } from "../src/rpc/getUserAccount";
import { joinMatchRpc } from "../src/rpc/joinMatch";
import { updateMainActionRpc } from "../src/rpc/updateMainAction";
import { updateReadyStateRpc } from "../src/rpc/updateReadyState";
import { updateSecondaryActionRpc } from "../src/rpc/updateSecondaryAction";
import { upgradeSkillRpc } from "../src/rpc/upgradeSkill";
import { createNakamaWrapper } from "../src/services/nakamaWrapper";
import { StorageService } from "../src/services/storageService";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const PLAYER_ID = "tutorial-integration-player";
const OWNER_ID = "normal-match-owner";
const GATE_MATCH_ID = "normal-gate-match";
const EXPECTED_GAMEPLAY_STEPS: TutorialStepId[] = [
  "choose_skills",
  "search",
  "pickup_items",
  "feed_bot",
  "bot_chat",
  "buy_detective",
  "plan_axe_attack",
  "resolve_bot_scare",
  "return_to_bot",
  "observe_destruction_warning",
  "scare_bot_to_doomed_cell",
  "resolve_destruction",
  "victory_recap"
];

type FakeUser = {
  id: string;
  username: string;
  displayName: string;
  metadata: unknown;
};

type StoredObject = {
  collection: string;
  key: string;
  userId: string;
  value: unknown;
  version: string;
};

type LogEntry = {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  args: unknown[];
};

type TraceEntry = {
  sessionId: string;
  stepId: string;
  turn: number;
  actorId: string;
  actionOrRpcId: string;
  result: "ok" | "expected_rejection" | "failed";
  failureReason?: string;
};

type NormalizedReport = {
  reason: MatchReport["reason"];
  turns: number;
  winningCharacterIds: string[];
  winnerActions: number;
  winnerItemsCollected: number;
};

type IntegrationSignature = {
  gameplaySteps: TutorialStepId[];
  actionOrder: string[][];
  chatMessageIds: string[];
  chatCount: number;
  winnerId: string;
  report: NormalizedReport;
  completionFlag: boolean;
};

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTestHarness() {
  const objects = new Map<string, StoredObject>();
  const users = new Map<string, FakeUser>();
  const logs: LogEntry[] = [];
  const broadcasts: Array<{
    channelId: string;
    content: Record<string, unknown>;
    senderId?: string;
    senderUsername?: string;
    persist?: boolean;
  }> = [];
  const signals: Array<{ matchId: string; data: string }> = [];
  let versionCounter = 0;
  let runtimeMatchCounter = 0;
  let uuidCounter = 0;

  const objectKey = (collection: string, key: string, userId: string) =>
    `${collection}:${key}:${userId}`;
  const logger = {
    debug: (message: string, ...args: unknown[]) =>
      logs.push({ level: "debug", message, args }),
    info: (message: string, ...args: unknown[]) =>
      logs.push({ level: "info", message, args }),
    warn: (message: string, ...args: unknown[]) =>
      logs.push({ level: "warn", message, args }),
    error: (message: string, ...args: unknown[]) =>
      logs.push({ level: "error", message, args })
  } as unknown as nkruntime.Logger;
  const fakeNakama = {
    storageRead: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) =>
      requests.flatMap((request) => {
        const stored = objects.get(
          objectKey(request.collection, request.key, request.userId)
        );
        return stored ? [cloneValue(stored)] : [];
      }),
    storageWrite: (
      requests: Array<{
        collection: string;
        key: string;
        userId: string;
        value: unknown;
        version?: string;
      }>
    ) => {
      for (const request of requests) {
        const key = objectKey(
          request.collection,
          request.key,
          request.userId
        );
        const existing = objects.get(key);
        if (
          request.version !== undefined &&
          request.version !== existing?.version
        ) {
          throw new Error("version conflict");
        }
        objects.set(key, {
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: cloneValue(request.value),
          version: String(++versionCounter)
        });
      }
    },
    storageList: (
      userId: string,
      collection: string,
      limit = 100,
      cursor = ""
    ) => {
      const all = Array.from(objects.values())
        .filter(
          (entry) =>
            entry.userId === userId && entry.collection === collection
        )
        .sort((left, right) => left.key.localeCompare(right.key));
      const offset = cursor ? Number(cursor) : 0;
      const page = all.slice(offset, offset + limit).map(cloneValue);
      const nextOffset = offset + page.length;
      return {
        objects: page,
        cursor: nextOffset < all.length ? String(nextOffset) : ""
      };
    },
    storageDelete: (
      requests: Array<{ collection: string; key: string; userId: string }>
    ) => {
      for (const request of requests) {
        objects.delete(
          objectKey(request.collection, request.key, request.userId)
        );
      }
    },
    matchCreate: () => `runtime-${++runtimeMatchCounter}`,
    matchList: () => ({ matches: [] }),
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
      return "";
    },
    uuidv4: () => `match-${++uuidCounter}`,
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
        content: cloneValue(content),
        senderId,
        senderUsername,
        persist
      });
      return { channelId, messageId: `broadcast-${broadcasts.length}` };
    },
    usersGetId: (userIds: string[]) =>
      userIds.flatMap((userId) => {
        const user = users.get(userId);
        return user ? [cloneValue(user)] : [];
      }),
    accountUpdateId: (...args: unknown[]) => {
      const userId = args[0];
      const metadata = args[7];
      if (typeof userId === "string") {
        const user = users.get(userId);
        if (user) {
          users.set(userId, { ...user, metadata: cloneValue(metadata) });
        }
      }
      return undefined;
    }
  };
  const nakama = fakeNakama as unknown as nkruntime.Nakama;
  const storage = new StorageService(createNakamaWrapper(nakama));

  return {
    logger,
    logs,
    broadcasts,
    signals,
    nakama,
    storage,
    setUser(userId: string, metadata: unknown): void {
      users.set(userId, {
        id: userId,
        username: userId,
        displayName: userId,
        metadata: cloneValue(metadata)
      });
    },
    getUser(userId: string): FakeUser | undefined {
      const user = users.get(userId);
      return user ? cloneValue(user) : undefined;
    },
    clearTestData(): void {
      objects.clear();
      users.clear();
      logs.length = 0;
      broadcasts.length = 0;
      signals.length = 0;
    },
    get storedObjectCount(): number {
      return objects.size;
    },
    get testUserCount(): number {
      return users.size;
    }
  };
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

function isTutorialIncomplete(error: unknown): boolean {
  return errorMessage(error) === "tutorial_incomplete";
}

function stateAt(match: MatchRecord, coord: { q: number; r: number }) {
  const tile = match.map?.tiles.find(
    (candidate) =>
      candidate.coord.q === coord.q && candidate.coord.r === coord.r
  );
  assert.ok(tile, `Missing tutorial tile ${coord.q},${coord.r}`);
  return tile;
}

function normalizeEvent(event: ReplayEvent): string {
  if (event.kind === "map") {
    return `map:${event.action}`;
  }
  const actor = event.actorId === TUTORIAL_BOT_ID ? "bot" : "player";
  return `${actor}:${event.action.actionId}`;
}

function runTutorialIntegration(runNumber: number): IntegrationSignature {
  const harness = createTestHarness();
  const context = { userId: PLAYER_ID } as nkruntime.Context;
  const originalRandom = Math.random;
  const trace: TraceEntry[] = [];
  const gameplaySteps: TutorialStepId[] = [];
  let sessionId = "match-1";
  let currentStep = "setup";
  let matchId: string | null = null;

  const currentTurn = (): number =>
    matchId
      ? harness.storage.getMatch(matchId)?.match.current_turn ?? 0
      : 0;
  const recordTrace = (
    stepId: string,
    actorId: string,
    actionOrRpcId: string,
    result: TraceEntry["result"],
    failureReason?: string
  ): void => {
    trace.push({
      sessionId,
      stepId,
      turn: currentTurn(),
      actorId,
      actionOrRpcId,
      result,
      ...(failureReason ? { failureReason } : {})
    });
  };
  const invokeRpc = <T>(
    stepId: string,
    rpcId: string,
    operation: () => string
  ): T => {
    currentStep = stepId;
    try {
      const response = JSON.parse(operation()) as T;
      recordTrace(stepId, PLAYER_ID, rpcId, "ok");
      return response;
    } catch (error) {
      recordTrace(stepId, PLAYER_ID, rpcId, "failed", errorMessage(error));
      throw error;
    }
  };
  const expectTutorialGateFailure = (
    stepId: string,
    rpcId: string,
    operation: () => unknown
  ): void => {
    currentStep = stepId;
    try {
      operation();
    } catch (error) {
      if (isTutorialIncomplete(error)) {
        recordTrace(
          stepId,
          PLAYER_ID,
          rpcId,
          "expected_rejection",
          "tutorial_incomplete"
        );
        return;
      }
      recordTrace(stepId, PLAYER_ID, rpcId, "failed", errorMessage(error));
      throw error;
    }
    recordTrace(stepId, PLAYER_ID, rpcId, "failed", "request unexpectedly succeeded");
    throw new Error(`${rpcId} unexpectedly succeeded before tutorial completion`);
  };
  const completeGameplayStep = (stepId: TutorialStepId): void => {
    currentStep = stepId;
    const index = TUTORIAL_STEP_IDS.indexOf(stepId);
    const previous = gameplaySteps[gameplaySteps.length - 1];
    assert.ok(index >= 0, `Unknown tutorial step ${stepId}`);
    if (previous) {
      assert.ok(
        index > TUTORIAL_STEP_IDS.indexOf(previous),
        `Tutorial step ${stepId} followed ${previous} out of order`
      );
    }
    gameplaySteps.push(stepId);
    recordTrace(stepId, "server", "gameplay_step_completed", "ok");
  };
  const replayAt = (turn: number, stepId: string): ReplayRecord => {
    const replay = matchId ? harness.storage.readReplay(matchId, turn) : null;
    assert.ok(replay, `Missing replay for turn ${turn}`);
    for (const event of replay.events) {
      recordTrace(
        stepId,
        event.kind === "player" ? event.actorId : "server",
        normalizeEvent(event),
        "ok"
      );
      if (event.kind === "player") {
        assert.notEqual(
          event.action.actionId,
          "failedAction",
          `Unexpected failed action in turn ${turn}`
        );
      }
      assert.ok(
        event.kind === "player" || event.kind === "map",
        `Malformed replay event in turn ${turn}`
      );
    }
    return replay;
  };
  const readyTurn = (stepId: string, expectedTurn: number): ReplayRecord => {
    const response = invokeRpc<{ advanced: boolean; turn: number }>(
      stepId,
      "update_ready_state",
      () =>
        updateReadyStateRpc(
          context,
          harness.logger,
          harness.nakama,
          JSON.stringify({ match_id: matchId, ready: true })
        )
    );
    assert.equal(response.advanced, true, `Turn ${expectedTurn} did not advance`);
    assert.equal(response.turn, expectedTurn);
    return replayAt(expectedTurn, stepId);
  };
  const stepActions = (replay: ReplayRecord): string[] =>
    replay.events.map(normalizeEvent);

  Math.random = deterministicRandom(0x7a4b3c2d);
  try {
    harness.setUser(PLAYER_ID, {
      otherSetting: "preserved",
      zarka: {
        [TUTORIAL_COMPLETION_PROFILE_KEY]: false,
        cosmetics: { selectedSkinId: { body: "tutorial-test-body" } }
      }
    });

    const profileBefore = invokeRpc<{
      account?: { tutorialCompleted?: boolean };
    }>("profile_gate", "get_user_account", () =>
      getUserAccountRpc(context, harness.logger, harness.nakama, "")
    );
    assert.equal(profileBefore.account?.tutorialCompleted, false);

    const created = invokeRpc<{
      ok: boolean;
      match_id: string;
      runtime_match_id: string;
    }>("fixture", "create_tutorial_match", () =>
      createTutorialMatchRpc(
        context,
        harness.logger,
        harness.nakama,
        ""
      )
    );
    assert.equal(created.ok, true);
    assert.equal(created.match_id, sessionId);
    matchId = created.match_id;
    sessionId = created.match_id;

    const initialRead = harness.storage.getMatch(created.match_id);
    assert.ok(initialRead, "Tutorial match was not persisted");
    const initial = initialRead.match;
    const player = initial.playerCharacters[PLAYER_ID];
    const bot = initial.playerCharacters[TUTORIAL_BOT_ID];
    assert.deepEqual(
      initial.map?.tiles.map((tile) => tile.coord),
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
        { q: 1, r: 1 }
      ]
    );
    assert.equal(initial.cols, 2);
    assert.equal(initial.rows, 2);
    assert.equal(initial.metadata?.[TUTORIAL_MATCH_METADATA_KEY]?.type, "guided_tutorial");
    assert.equal(initial.players.length, 1);
    assert.equal(initial.players[0], PLAYER_ID);
    assert.equal(player.position?.coord.q, TUTORIAL_CELL_COORDS.playerStart.q);
    assert.equal(player.position?.coord.r, TUTORIAL_CELL_COORDS.playerStart.r);
    assert.equal(bot.id, TUTORIAL_BOT_ID);
    assert.notEqual(player.teamId, bot.teamId);
    assert.equal(player.stats.health.current, 12);
    assert.equal(player.stats.health.max, 12);
    assert.equal(player.stats.energy.current, 20);
    assert.equal(player.progression.availableSkillPoints, 5);
    assert.equal(player.economy.zarkans, ShopLibrary.detective.cost);
    assert.deepEqual(player.inventory.carriedItems, []);
    assert.deepEqual(
      initial.items?.map((item) => item.item_type),
      ["bandage", "axe", "food"]
    );
    assert.equal(stateAt(initial, TUTORIAL_CELL_COORDS.doomed).meta?.warningTurn, 5);
    assert.equal(stateAt(initial, TUTORIAL_CELL_COORDS.doomed).meta?.destructionTurn, 6);
    recordTrace("fixture", PLAYER_ID, "fixture_assertions", "ok");

    const normalJoinTarget: MatchRecord = {
      match_id: GATE_MATCH_ID,
      runtime_match_id: "runtime-gate-match",
      players: [OWNER_ID],
      playerCharacters: { [OWNER_ID]: createDefaultCharacter(OWNER_ID) },
      playerList: {
        [OWNER_ID]: { id: OWNER_ID, name: "Normal Match Owner" }
      },
      readyStates: { [OWNER_ID]: false },
      size: 2,
      cols: 2,
      rows: 2,
      roundTime: "23:00",
      autoSkip: true,
      turnsToBeAt1Tile: 30,
      created_at: 1,
      current_turn: 0,
      creator: OWNER_ID,
      name: "Normal gate match",
      started: false,
      removed: 0
    };
    harness.storage.writeMatch(normalJoinTarget);

    expectTutorialGateFailure("profile_gate", "create_match", () =>
      createMatchRpc(context, harness.logger, harness.nakama, "{}")
    );
    expectTutorialGateFailure("profile_gate", "join_match", () =>
      joinMatchRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({ match_id: GATE_MATCH_ID })
      )
    );
    assert.deepEqual(
      harness.storage.getMatch(GATE_MATCH_ID)?.match.players,
      [OWNER_ID]
    );

    const skillUpgrade = invokeRpc<{ ok: boolean; character: MatchRecord["playerCharacters"][string] }>(
      "choose_skills",
      "upgrade_skill",
      () =>
        upgradeSkillRpc(
          context,
          harness.logger,
          harness.nakama,
          JSON.stringify({
            match_id: matchId,
            skill_ids: ["vitality", "strength2"]
          })
        )
    );
    assert.equal(skillUpgrade.ok, true);
    assert.deepEqual(
      [...(skillUpgrade.character.abilities ?? [])].sort(),
      ["strength2", "vitality"]
    );
    assert.equal(skillUpgrade.character.stats.health.max, 13);
    assert.equal(skillUpgrade.character.progression.availableSkillPoints, 0);
    assert.equal(getActionEnergyDiscount(skillUpgrade.character, "axe_attack"), 3);
    completeGameplayStep("choose_skills");

    invokeRpc<{ ok: boolean }>("search", "update_secondary_action", () =>
      updateSecondaryActionRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          submission: { actionId: "search" }
        })
      )
    );
    const searchReplay = readyTurn("search", 1);
    const searchEvent = searchReplay.events.find(
      (event) =>
        event.kind === "player" &&
        event.actorId === PLAYER_ID &&
        event.action.actionId === "search"
    );
    assert.ok(searchEvent && searchEvent.kind === "player");
    assert.equal(searchEvent.action.metadata?.foundAny, true);
    assert.deepEqual(
      (searchEvent.action.metadata?.discoveredItemIds as string[]).slice().sort(),
      initial.items!.map((item) => item.item_id).slice().sort()
    );
    assert.deepEqual(
      harness.storage.getMatch(matchId)!.match.playerCharacters[PLAYER_ID]
        .discoveredItemIds?.slice().sort(),
      initial.items!.map((item) => item.item_id).slice().sort()
    );
    completeGameplayStep("search");

    invokeRpc<{ ok: boolean }>("pickup_items", "update_main_action", () =>
      updateMainActionRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          submission: { actionId: "pick_up" }
        })
      )
    );
    const pickupReplay = readyTurn("pickup_items", 2);
    const pickupEvent = pickupReplay.events.find(
      (event) =>
        event.kind === "player" &&
        event.actorId === PLAYER_ID &&
        event.action.actionId === "pick_up"
    );
    assert.ok(pickupEvent && pickupEvent.kind === "player");
    assert.equal(pickupEvent.action.metadata?.pickedCount, 3);
    const afterPickup = harness.storage.getMatch(matchId)!.match;
    assert.deepEqual(
      afterPickup.playerCharacters[PLAYER_ID].inventory.carriedItems
        .map((item) => item.itemId)
        .sort(),
      ["axe", "bandage", "food"]
    );
    assert.equal(afterPickup.items?.length, 0);
    completeGameplayStep("pickup_items");

    invokeRpc<{ ok: boolean }>("feed_bot", "update_secondary_action", () =>
      updateSecondaryActionRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          submission: { actionId: "feed", targetPlayerIds: [PLAYER_ID] }
        })
      )
    );
    const feedReplay = readyTurn("feed_bot", 3);
    assert.ok(
      feedReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === PLAYER_ID &&
          event.action.actionId === "feed"
      ),
      "Feed did not resolve"
    );
    assert.ok(
      feedReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === TUTORIAL_BOT_ID &&
          event.action.actionId === "move"
      ),
      "The tutorial bot did not move into the player's cell"
    );
    const afterFeed = harness.storage.getMatch(matchId)!.match;
    assert.equal(
      afterFeed.playerCharacters[PLAYER_ID].position?.tileId,
      afterFeed.playerCharacters[TUTORIAL_BOT_ID].position?.tileId
    );
    assert.equal(
      afterFeed.playerCharacters[PLAYER_ID].inventory.carriedItems.some(
        (item) => item.itemId === "food"
      ),
      false
    );
    completeGameplayStep("feed_bot");

    let chatLog = harness.storage.listChatMessages(matchId);
    assert.equal(chatLog.length, 1);
    assert.equal(chatLog[0].content, TUTORIAL_BOT_MESSAGES.bot_claim);
    assert.equal(chatLog[0].senderId, TUTORIAL_BOT_ID);
    assert.equal(chatLog[0].messageId, `tutorial:${matchId}:bot_claim`);
    assert.equal(harness.broadcasts.length, 1);
    completeGameplayStep("bot_chat");

    const beforeDetective = harness.storage.getMatch(matchId)!.match
      .playerCharacters[PLAYER_ID].economy.zarkans;
    const detective = invokeRpc<{
      ok: boolean;
      target_team_id?: string;
      event: Extract<ReplayEvent, { kind: "player" }>;
    }>("buy_detective", "buy_shop_item", () =>
      buyShopItemRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          shop_id: "detective",
          target_player_id: TUTORIAL_BOT_ID
        })
      )
    );
    assert.equal(detective.ok, true);
    assert.equal(
      detective.target_team_id,
      harness.storage.getMatch(matchId)!.match.playerCharacters[TUTORIAL_BOT_ID]
        .teamId
    );
    assert.notEqual(
      detective.target_team_id,
      harness.storage.getMatch(matchId)!.match.playerCharacters[PLAYER_ID]
        .teamId
    );
    assert.equal(
      beforeDetective -
        harness.storage.getMatch(matchId)!.match.playerCharacters[PLAYER_ID]
          .economy.zarkans,
      ShopLibrary.detective.cost
    );
    assert.deepEqual(detective.event.visibility, {
      scope: "limited",
      playerIds: [PLAYER_ID]
    });
    assert.equal(
      harness.storage.getMatch(matchId)!.match.playerCharacters[PLAYER_ID]
        .revealedTeamIdsByPlayerId?.[TUTORIAL_BOT_ID],
      detective.target_team_id
    );
    const detectiveReplay = replayAt(3, "buy_detective");
    assert.ok(
      detectiveReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.action.actionId === "buy_detective" &&
          event.visibility?.scope === "limited" &&
          event.visibility.playerIds.includes(PLAYER_ID)
      ),
      "Detective result was not stored as a private replay event"
    );
    chatLog = harness.storage.listChatMessages(matchId);
    assert.equal(chatLog.length, 2);
    assert.equal(chatLog[1].messageId, `tutorial:${matchId}:detective_result`);
    completeGameplayStep("buy_detective");

    invokeRpc<{ ok: boolean }>("plan_axe_attack", "update_main_action", () =>
      updateMainActionRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          submission: {
            actionId: "axe_attack",
            targetPlayerIds: [TUTORIAL_BOT_ID]
          }
        })
      )
    );
    const axePlan = harness.storage.getMatch(matchId)!.match.playerCharacters[
      PLAYER_ID
    ].actionPlan?.main;
    assert.equal(axePlan?.actionId, "axe_attack");
    assert.deepEqual(axePlan?.targetPlayerIds, [TUTORIAL_BOT_ID]);
    chatLog = harness.storage.listChatMessages(matchId);
    assert.equal(chatLog.length, 3);
    assert.equal(chatLog[2].messageId, `tutorial:${matchId}:axe_ordering`);
    completeGameplayStep("plan_axe_attack");

    const combatReplay = readyTurn("resolve_bot_scare", 4);
    const scareEvent = combatReplay.events.find(
      (event) =>
        event.kind === "player" &&
        event.actorId === TUTORIAL_BOT_ID &&
        event.action.actionId === "scare"
    );
    assert.ok(scareEvent && scareEvent.kind === "player");
    const scareTarget = scareEvent.targets?.find(
      (target) => target.targetId === PLAYER_ID
    );
    assert.deepEqual(scareTarget?.metadata?.movedTo, TUTORIAL_CELL_COORDS.doomed);
    assert.equal(
      combatReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === PLAYER_ID &&
          event.action.actionId === "axe_attack"
      ),
      false,
      "The planned Axe attack should miss after Scare moves the player"
    );
    const afterCombat = harness.storage.getMatch(matchId)!.match;
    assert.equal(afterCombat.playerCharacters[TUTORIAL_BOT_ID].stats.health.current, 12);
    assert.equal(afterCombat.playerCharacters[PLAYER_ID].stats.energy.current, 17);
    completeGameplayStep("resolve_bot_scare");

    invokeRpc<{ ok: boolean }>("return_to_bot", "update_main_action", () =>
      updateMainActionRpc(
        context,
        harness.logger,
        harness.nakama,
        JSON.stringify({
          match_id: matchId,
          submission: {
            actionId: "move",
            targetLocationId: TUTORIAL_CELL_COORDS.playerStart
          }
        })
      )
    );
    const returnReplay = readyTurn("return_to_bot", 5);
    assert.ok(
      returnReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === PLAYER_ID &&
          event.action.actionId === "move"
      ),
      "The player did not move back to the bot"
    );
    const beforeFinal = harness.storage.getMatch(matchId)!.match;
    assert.deepEqual(
      beforeFinal.playerCharacters[PLAYER_ID].position?.coord,
      beforeFinal.playerCharacters[TUTORIAL_BOT_ID].position?.coord
    );
    const doomedTile = stateAt(beforeFinal, TUTORIAL_CELL_COORDS.doomed);
    assert.equal(doomedTile.meta?.warningTurn, 5);
    assert.equal(doomedTile.meta?.destructionTurn, 6);
    assert.equal(doomedTile.meta?.destroyed, undefined);
    assert.ok(beforeFinal.current_turn >= 5 && beforeFinal.current_turn < 6);
    completeGameplayStep("return_to_bot");
    completeGameplayStep("observe_destruction_warning");
    chatLog = harness.storage.listChatMessages(matchId);
    assert.equal(chatLog.length, 4);
    assert.equal(
      chatLog[3].messageId,
      `tutorial:${matchId}:destruction_warning`
    );
    assert.equal(
      chatLog[3].content,
      TUTORIAL_BOT_MESSAGES.destruction_warning
    );

    const energyBeforeFinalScare = beforeFinal.playerCharacters[PLAYER_ID].stats.energy.current;
    invokeRpc<{ ok: boolean }>(
      "scare_bot_to_doomed_cell",
      "update_main_action",
      () =>
        updateMainActionRpc(
          context,
          harness.logger,
          harness.nakama,
          JSON.stringify({
            match_id: matchId,
            submission: {
              actionId: "scare",
              extraExecutions: 1,
              targetPlayerIds: [TUTORIAL_BOT_ID],
              targetLocationId: TUTORIAL_CELL_COORDS.doomed
            }
          })
        )
    );
    const scarePlan = harness.storage.getMatch(matchId)!.match.playerCharacters[
      PLAYER_ID
    ].actionPlan?.main;
    assert.equal(scarePlan?.actionId, "scare");
    assert.equal(scarePlan?.extraExecutions, 1);
    assert.deepEqual(scarePlan?.targetPlayerIds, [TUTORIAL_BOT_ID]);
    assert.deepEqual(scarePlan?.targetLocationId, TUTORIAL_CELL_COORDS.doomed);
    completeGameplayStep("scare_bot_to_doomed_cell");

    const finalReplay = readyTurn("resolve_destruction", 6);
    const finalScareEvent = finalReplay.events.find(
      (event) =>
        event.kind === "player" &&
        event.actorId === PLAYER_ID &&
        event.action.actionId === "scare"
    );
    assert.ok(finalScareEvent && finalScareEvent.kind === "player");
    const finalTarget = finalScareEvent.targets?.find(
      (target) => target.targetId === TUTORIAL_BOT_ID
    );
    assert.deepEqual(finalTarget?.metadata?.movedTo, TUTORIAL_CELL_COORDS.doomed);
    assert.equal(
      harness.storage.getMatch(matchId)!.match.playerCharacters[PLAYER_ID]
        .stats.energy.current,
      energyBeforeFinalScare - 6
    );
    assert.ok(
      finalReplay.events.some(
        (event) => event.kind === "map" && event.action === "destroyed"
      ),
      "The scheduled cell was not destroyed"
    );
    assert.ok(
      finalReplay.events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === TUTORIAL_BOT_ID &&
          event.action.actionId === "status_dead"
      ),
      "Environmental damage did not kill the tutorial bot"
    );
    const finalState = harness.storage.getMatch(matchId)!.match;
    assert.equal(finalState.playerCharacters[TUTORIAL_BOT_ID].stats.health.current, 0);
    assert.equal(finalState.removed, 1);
    assert.equal(finalState.started, false);
    completeGameplayStep("resolve_destruction");

    const report = harness.storage.getMatchReport(matchId);
    assert.ok(report, "Normal match report was not generated");
    assert.equal(report.reason, "last_alive");
    assert.deepEqual(report.winning_character_ids, [PLAYER_ID]);
    const winnerReport = report.players.find((entry) => entry.player_id === PLAYER_ID);
    assert.ok(winnerReport);
    assert.equal(winnerReport.players_killed, 0);
    assert.equal(winnerReport.items_collected, 3);
    completeGameplayStep("victory_recap");

    const profileAfter = invokeRpc<{
      account?: { tutorialCompleted?: boolean };
    }>("victory_recap", "get_user_account", () =>
      getUserAccountRpc(context, harness.logger, harness.nakama, "")
    );
    assert.equal(profileAfter.account?.tutorialCompleted, true);
    const updatedUser = harness.getUser(PLAYER_ID);
    assert.equal(
      (updatedUser?.metadata as { otherSetting?: string }).otherSetting,
      "preserved"
    );
    assert.equal(
      (updatedUser?.metadata as { zarka?: { tutorialCompleted?: boolean } })
        .zarka?.tutorialCompleted,
      true
    );

    const completedCreate = invokeRpc<{ match_id: string }>(
      "profile_gate_after_completion",
      "create_match",
      () => createMatchRpc(context, harness.logger, harness.nakama, "{}")
    );
    const createdNormalMatch = harness.storage.getMatch(completedCreate.match_id);
    assert.ok(createdNormalMatch);
    assert.equal(
      createdNormalMatch.match.metadata?.[TUTORIAL_MATCH_METADATA_KEY],
      undefined
    );
    const completedJoin = invokeRpc<{ ok: boolean; joined: boolean }>(
      "profile_gate_after_completion",
      "join_match",
      () =>
        joinMatchRpc(
          context,
          harness.logger,
          harness.nakama,
          JSON.stringify({ match_id: GATE_MATCH_ID })
        )
    );
    assert.equal(completedJoin.ok, true);
    assert.equal(completedJoin.joined, true);
    assert.ok(
      harness.storage.getMatch(GATE_MATCH_ID)!.match.players.includes(PLAYER_ID)
    );

    assert.deepEqual(gameplaySteps, EXPECTED_GAMEPLAY_STEPS);
    assert.equal(new Set(chatLog.map((message) => message.messageId)).size, 4);
    assert.equal(harness.storage.listChatMessages(matchId).length, 4);
    assert.equal(harness.broadcasts.length, 4);
    assert.equal(
      harness.broadcasts.filter(
        (entry) => entry.content.tutorialMessageKey === "bot_claim"
      ).length,
      1
    );
    assert.equal(
      harness.logs.filter((entry) => entry.level === "error").length,
      0,
      "Unexpected server error log"
    );
    assert.equal(
      harness.logs.filter((entry) => entry.level === "warn").length,
      0,
      "Unexpected server warning log"
    );

    const actionOrder = Array.from({ length: 6 }, (_unused, index) =>
      stepActions(replayAt(index + 1, `verify_turn_${index + 1}`))
    );
    const turn4 = actionOrder[3];
    assert.ok(turn4);
    assert.ok(
      turn4.indexOf(`bot:scare`) !== -1,
      "Bot Scare was missing from its turn"
    );
    assert.equal(turn4.indexOf("player:axe_attack"), -1);
    const turn6 = actionOrder[5];
    assert.ok(turn6);
    assert.ok(turn6.indexOf("player:scare") < turn6.indexOf("map:destroyed"));
    assert.ok(turn6.indexOf("map:destroyed") < turn6.indexOf("bot:status_dead"));

    const normalizedReport: NormalizedReport = {
      reason: report.reason,
      turns: report.turns,
      winningCharacterIds: report.winning_character_ids,
      winnerActions: winnerReport.actions_used,
      winnerItemsCollected: winnerReport.items_collected
    };
    return {
      gameplaySteps,
      actionOrder,
      chatMessageIds: harness.storage
        .listChatMessages(matchId)
        .map((message) => message.messageId),
      chatCount: harness.storage.listChatMessages(matchId).length,
      winnerId: PLAYER_ID,
      report: normalizedReport,
      completionFlag: profileAfter.account?.tutorialCompleted === true
    };
  } catch (error) {
    const snapshot = matchId
      ? harness.storage.getMatch(matchId)?.match
      : undefined;
    const snapshotSummary = snapshot
      ? {
          turn: snapshot.current_turn,
          removed: snapshot.removed,
          player: snapshot.playerCharacters[PLAYER_ID],
          bot: snapshot.playerCharacters[TUTORIAL_BOT_ID],
          doomedTile:
            snapshot.map?.tiles.find(
              (tile) =>
                tile.coord.q === TUTORIAL_CELL_COORDS.doomed.q &&
                tile.coord.r === TUTORIAL_CELL_COORDS.doomed.r
            ) ?? null,
          chatCount: harness.storage.listChatMessages(matchId!).length
        }
      : null;
    throw new Error(
      `Tutorial integration run ${runNumber} failed at step ${currentStep}; session=${sessionId}\n` +
        `cause=${errorMessage(error)}\n` +
        `snapshot=${JSON.stringify(snapshotSummary)}\n` +
        `trace=${JSON.stringify(trace.slice(-35))}\n` +
        `recentLogs=${JSON.stringify(harness.logs.slice(-20))}`
    );
  } finally {
    Math.random = originalRandom;
    harness.clearTestData();
    assert.equal(harness.storedObjectCount, 0, "Test storage cleanup failed");
    assert.equal(harness.testUserCount, 0, "Test account cleanup failed");
  }
}

Object.assign(globalThis, {
  nkruntime: {
    Codes: {
      INVALID_ARGUMENT: 3,
      PERMISSION_DENIED: 7,
      FAILED_PRECONDITION: 9,
      NOT_FOUND: 5,
      INTERNAL: 13
    }
  }
});

test("tutorial RPC flow is deterministic across three complete runs", () => {
  const runs = [0, 1, 2].map(runTutorialIntegration);
  assert.deepEqual(runs[1], runs[0]);
  assert.deepEqual(runs[2], runs[0]);
  assert.deepEqual(runs[0].gameplaySteps, EXPECTED_GAMEPLAY_STEPS);
  assert.equal(runs[0].chatCount, 4);
  assert.equal(runs[0].completionFlag, true);
  assert.ok(runs[0].report.turns > 0);
});
