import { TUTORIAL_MATCH_METADATA_KEY, type ReplayEvent } from "@shared";
import { MatchRecord } from "../models/types";
import { advanceTurn } from "./advanceTurn";
import { processBotActions } from "./botAI";
import { planTutorialBotActions } from "./TutorialBotPlanner";
import { isCharacterDead, isCharacterIncapacitated } from "../utils/playerCharacter";
import { assignAfkActions } from "./afkActions";
import { assignAfkSkillPoints } from "./afkSkills";
import { incrementAutoAdvanceAfkCounters } from "../utils/activityClock";
import { checkAndProcessRankedAfkForfeits } from "./rankedAfkForfeit";
import type { EndGameOutcome } from "./checkEndGame";

export interface TurnResolutionResult {
  advanced: boolean;
  resolvedTurn?: number;
  events: ReplayEvent[];
  outcome?: EndGameOutcome;
}

export function resolveTurnForMatch(
  match: MatchRecord,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  options?: { isAutoAdvance?: boolean }
): TurnResolutionResult {
  const players = Array.isArray(match.players) ? match.players : [];
  if (
    players.length === 0 &&
    (!match.gameMasterMode ||
      Object.keys(match.playerCharacters ?? {}).length === 0)
  ) {
    return { advanced: false, events: [] };
  }

  const resolvedTurn = (match.current_turn || 0) + 1;
  if (match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
    planTutorialBotActions(match);
  } else {
    processBotActions(match, logger);
  }
  if (options?.isAutoAdvance === true) {
    incrementAutoAdvanceAfkCounters(match);
    assignAfkSkillPoints(match);
  }
  assignAfkActions(match);
  const { events } = advanceTurn(match, resolvedTurn, logger, nk);

  let endGameOutcome: EndGameOutcome | undefined;
  if ((!match.removed || match.removed === 0) && nk) {
    const forfeitResult = checkAndProcessRankedAfkForfeits(
      match,
      nk,
      logger,
      events,
      resolvedTurn
    );
    if (forfeitResult.matchEnded && forfeitResult.outcome) {
      endGameOutcome = forfeitResult.outcome;
    }
  }

  const resetStates: Record<string, boolean> = {};
  if (match.gameMasterMode) {
    for (const charId in match.playerCharacters) {
      if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, charId)) {
        continue;
      }
      const character = match.playerCharacters[charId];
      resetStates[charId] = isCharacterIncapacitated(character) ? true : false;
    }
  } else {
    for (const playerId of players) {
      const character = match.playerCharacters?.[playerId] ?? null;
      resetStates[playerId] = isCharacterIncapacitated(character) ? true : false;
    }
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

  return { advanced: true, resolvedTurn, events, outcome: endGameOutcome };
}
