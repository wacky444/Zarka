import {
  TUTORIAL_BOT_ID,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter
} from "@shared";
import type { MatchRecord } from "../models/types";
import { getTutorialBotPlan } from "./TutorialScenario";

function sharesTile(left: PlayerCharacter, right: PlayerCharacter): boolean {
  const tileId = left.position?.tileId;
  return typeof tileId === "string" && tileId === right.position?.tileId;
}

export function planTutorialBotActions(match: MatchRecord): void {
  if (!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    return;
  }

  const playerId = match.players[0];
  const player = playerId ? match.playerCharacters[playerId] : undefined;
  const bot = match.playerCharacters[TUTORIAL_BOT_ID];
  if (!playerId || playerId === TUTORIAL_BOT_ID || !player || !bot) {
    return;
  }

  const feedPlan = player.actionPlan?.secondary;
  const feedPlanned =
    feedPlan?.actionId === "feed" &&
    (!feedPlan.targetPlayerIds ||
      feedPlan.targetPlayerIds.length === 0 ||
      feedPlan.targetPlayerIds.indexOf(playerId) !== -1);
  const hasCarriedFood =
    player.inventory?.carriedItems?.some(
      (item) => item.itemId === "food" && item.quantity > 0
    ) ?? false;
  const hasPickedUpAxe =
    player.inventory?.carriedItems?.some(
      (item) => item.itemId === "axe" && item.quantity > 0
    ) ?? false;
  const foodConsumed = hasPickedUpAxe && !hasCarriedFood;

  if ((feedPlanned || foodConsumed) && !sharesTile(player, bot)) {
    const plan = getTutorialBotPlan("feed_bot", playerId);
    if (plan) {
      bot.actionPlan = { main: plan };
    }
    return;
  }

  const axePlan = player.actionPlan?.main;
  if (
    axePlan?.actionId === "axe_attack" &&
    (axePlan.targetPlayerIds?.indexOf(TUTORIAL_BOT_ID) ?? -1) !== -1 &&
    sharesTile(player, bot)
  ) {
    const plan = getTutorialBotPlan("resolve_bot_scare", playerId);
    if (plan) {
      bot.actionPlan = { main: plan };
    }
    return;
  }

  delete bot.actionPlan;
}
