import { ActionLibrary, type ActionId } from "@shared";
import type { MatchRecord } from "../models/types";
import { isActionOnCooldown } from "./actions/cooldowns";
import { isCharacterIncapacitated } from "../utils/playerCharacter";

const afkActions: readonly ActionId[] = [
  ActionLibrary.dodge.id,
  ActionLibrary.protect.id,
  ActionLibrary.sleep.id
];

export function assignAfkActions(match: MatchRecord): void {
  const currentTurn = match.current_turn ?? 0;
  const characterIds = match.gameMasterMode
    ? Object.keys(match.playerCharacters ?? {})
    : (match.players ?? []);

  for (const characterId of characterIds) {
    const character = match.playerCharacters?.[characterId];
    if (
      !character ||
      isCharacterIncapacitated(character) ||
      character.actionPlan?.main?.actionId
    ) {
      continue;
    }

    const availableActions = afkActions.filter(
      (actionId) => !isActionOnCooldown(character, actionId, currentTurn)
    );
    if (availableActions.length === 0) {
      continue;
    }

    const actionId =
      availableActions[Math.floor(Math.random() * availableActions.length)];
    character.actionPlan = character.actionPlan ?? {};
    character.actionPlan.main = { actionId };
  }
}
