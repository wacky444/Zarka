/// <reference path="../../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import {
  applyHealthDelta,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "../utils";
import { BaseAction } from "./BaseAction";

export abstract class BaseSelfHealAction extends BaseAction {
  abstract readonly healAmount: number;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const { result: healthChange, character: updatedCharacter } =
        applyHealthDelta(participant.character, this.healAmount);
      mergeCharacterState(participant.character, updatedCharacter);
      const restored = Math.max(0, healthChange.delta);
      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: { healed: restored },
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      const target: ReplayActionTarget = {
        targetId: participant.playerId,
        effects: ReplayActionEffect.Heal,
        metadata: { healed: restored },
      };
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: [target],
      });
    }
    return events;
  }
}
