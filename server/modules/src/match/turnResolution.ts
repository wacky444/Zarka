import { TUTORIAL_MATCH_METADATA_KEY, type ReplayEvent } from "@shared";
import { MatchRecord } from "../models/types";
import { advanceTurn } from "./advanceTurn";
import { processBotActions } from "./botAI";
import { planTutorialBotActions } from "./TutorialBotPlanner";
import { isCharacterDead, isCharacterIncapacitated } from "../utils/playerCharacter";

export interface TurnResolutionResult {
  advanced: boolean;
  resolvedTurn?: number;
  events: ReplayEvent[];
}

export function resolveTurnForMatch(
  match: MatchRecord,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama
): TurnResolutionResult {
  const players = Array.isArray(match.players) ? match.players : [];
  if (players.length === 0) {
    return { advanced: false, events: [] };
  }

  const resolvedTurn = (match.current_turn || 0) + 1;
  if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    planTutorialBotActions(match);
  } else {
    processBotActions(match, logger);
  }
  const { events } = advanceTurn(match, resolvedTurn, logger, nk);

  const resetStates: Record<string, boolean> = {};
  for (const playerId of players) {
    const character = match.playerCharacters?.[playerId] ?? null;
    resetStates[playerId] = isCharacterIncapacitated(character) ? true : false;
  }
  match.current_turn = resolvedTurn;
  match.readyStates = resetStates;

  const deadCharacters: Record<string, boolean> = {
    ...(match.deadCharacters ?? {}),
  };
  for (const id in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, id)) {
      continue;
    }
    const char = match.playerCharacters[id];
    const isDead =
      deadCharacters[id] === true ||
      isCharacterDead(char) ||
      (typeof char?.stats?.health?.current === "number" &&
        char.stats.health.current <= 0);
    deadCharacters[id] = !!isDead;
  }
  match.deadCharacters = deadCharacters;

  return { advanced: true, resolvedTurn, events };
}
