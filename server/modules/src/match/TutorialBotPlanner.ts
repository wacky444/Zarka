import {
  TUTORIAL_BOT_ID,
  TUTORIAL_MATCH_METADATA_KEY,
  type PlayerCharacter
} from "@shared";
import type { MatchRecord } from "../models/types";
import { getTutorialBotPlan } from "./TutorialScenario";

function sharesTile(left: PlayerCharacter, right: PlayerCharacter): boolean {
  if (
    typeof left.position?.tileId === "string" &&
    left.position.tileId === right.position?.tileId
  ) {
    return true;
  }
  if (left.position?.coord && right.position?.coord) {
    return (
      left.position.coord.q === right.position.coord.q &&
      left.position.coord.r === right.position.coord.r
    );
  }
  return false;
}

export function planTutorialBotActions(match: MatchRecord): void {
  if (!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    return;
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
  if (!playerId || !player || !bot) {
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
  const axePlanned =
    axePlan?.actionId === "axe_attack" &&
    (!axePlan.targetPlayerIds ||
      axePlan.targetPlayerIds.length === 0 ||
      axePlan.targetPlayerIds.indexOf(TUTORIAL_BOT_ID) !== -1);

  if (axePlanned && sharesTile(player, bot)) {
    const plan = getTutorialBotPlan("resolve_bot_scare", playerId);
    if (plan) {
      bot.actionPlan = { main: plan };
    }
    return;
  }

  delete bot.actionPlan;
}
