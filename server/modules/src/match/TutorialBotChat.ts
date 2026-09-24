/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  MATCH_CHAT_ROOM_CHANNEL_TYPE,
  MATCH_CHAT_ROOM_PREFIX,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_MESSAGES,
  TUTORIAL_BOT_SYSTEM_SENDER_ID,
  TUTORIAL_MATCH_METADATA_KEY,
  type MatchChatMessage,
  type ReplayEvent,
  type TutorialBotMessageKey
} from "@shared";
import type { MatchRecord } from "../models/types";
import { createNakamaWrapper } from "../services/nakamaWrapper";
import { StorageService } from "../services/storageService";
import { TUTORIAL_BOT_NAME } from "./TutorialScenario";

export function getTutorialBotMessageKeyForTurn(
  match: MatchRecord,
  events: ReplayEvent[]
): TutorialBotMessageKey | null {
  if (!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    return null;
  }
  let playerId: string | undefined;
  for (const candidateId of match.players) {
    if (candidateId !== TUTORIAL_BOT_ID) {
      playerId = candidateId;
      break;
    }
  }
  const player = playerId ? match.playerCharacters[playerId] : undefined;
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];
  if (
    !playerId ||
    !player ||
    !bot ||
    !player.position?.tileId ||
    player.position.tileId !== bot.position?.tileId
  ) {
    return null;
  }

  const feedResolved = events.some(
    (event) =>
      event.kind === "player" &&
      event.actorId === playerId &&
      event.action.actionId === "feed"
  );
  const botMovedIntoPlayerCell = events.some(
    (event) =>
      event.kind === "player" &&
      event.actorId === TUTORIAL_BOT_ID &&
      event.action.actionId === "move"
  );
  return feedResolved && botMovedIntoPlayerCell ? "bot_claim" : null;
}

export function sendTutorialBotMessage(
  match: MatchRecord,
  messageKey: TutorialBotMessageKey,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): boolean {
  if (!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    return false;
  }

  const messageId = `tutorial:${match.match_id}:${messageKey}`;
  const storage = new StorageService(createNakamaWrapper(nk));
  const message: MatchChatMessage = {
    matchId: match.match_id,
    messageId,
    senderId: TUTORIAL_BOT_ID,
    displayName: TUTORIAL_BOT_NAME,
    content: TUTORIAL_BOT_MESSAGES[messageKey],
    createdAt: Date.now(),
    system: false
  };
  try {
    if (!storage.appendChatMessage(message)) {
      return false;
    }
  } catch (error) {
    logger.warn(
      "tutorial chat persistence failed for %s: %s",
      match.match_id,
      (error as Error).message || String(error)
    );
    return false;
  }

  try {
    const channelId = nk.channelIdBuild(
      undefined,
      `${MATCH_CHAT_ROOM_PREFIX}${match.match_id}`,
      MATCH_CHAT_ROOM_CHANNEL_TYPE
    );
    nk.channelMessageSend(
      channelId,
      {
        message: message.content,
        displayName: TUTORIAL_BOT_NAME,
        tutorialBotId: TUTORIAL_BOT_ID,
        tutorialMessageKey: messageKey
      },
      TUTORIAL_BOT_SYSTEM_SENDER_ID,
      TUTORIAL_BOT_NAME,
      false
    );
  } catch (error) {
    logger.warn(
      "tutorial chat broadcast failed for %s: %s",
      match.match_id,
      (error as Error).message || String(error)
    );
  }
  return true;
}

export function sendTutorialBotMessageForTurn(
  match: MatchRecord,
  events: ReplayEvent[],
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger
): boolean {
  const messageKey = getTutorialBotMessageKeyForTurn(match, events);
  return messageKey
    ? sendTutorialBotMessage(match, messageKey, nk, logger)
    : false;
}
