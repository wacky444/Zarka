/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { PlayerCharacter, PlayerPlannedAction } from "@shared";

export interface PlannedActionParticipant {
  playerId: string;
  character: PlayerCharacter;
  plan: PlayerPlannedAction;
}

export function clearMainPlan(character: PlayerCharacter): void {
  if (!character.actionPlan) {
    return;
  }
  delete character.actionPlan.main;
  if (
    character.actionPlan.secondary === undefined &&
    character.actionPlan.nextMain === undefined &&
    character.actionPlan.main === undefined
  ) {
    delete character.actionPlan;
  }
}
