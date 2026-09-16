/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ActionLibrary, ReplayActionEffect } from "@shared";
import { getUsableExtraExecutions } from "../../utils/energy";
import {
  applyHealthDelta,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";
import { BaseSelfHealAction } from "./classes/BaseSelfHealAction";

function getCellKey(participant: PlannedActionParticipant): string | null {
  const position = participant.character.position;
  if (!position) {
    return null;
  }
  if (typeof position.tileId === "string" && position.tileId.length > 0) {
    return `tile:${position.tileId}`;
  }
  const coord = position.coord;
  if (!coord) {
    return null;
  }
  return `coord:${coord.q},${coord.r}`;
}

export class SleepAction extends BaseSelfHealAction {
  readonly healAmount = 2;

  protected override processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const extraExecutionsByPlayerId: Record<string, number> = {};
    const extraPoweredByCell: Record<string, number> = {};

    for (const participant of roster) {
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.sleep,
      );
      extraExecutionsByPlayerId[participant.playerId] = extraExecutions;
      const cellKey = getCellKey(participant);
      if (extraExecutions > 0 && cellKey) {
        extraPoweredByCell[cellKey] = (extraPoweredByCell[cellKey] ?? 0) + 1;
      }
    }

    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const extraExecutions =
        extraExecutionsByPlayerId[participant.playerId] ?? 0;
      const cellKey = getCellKey(participant);
      const sharedExtraPower =
        extraExecutions > 0 &&
        cellKey !== null &&
        (extraPoweredByCell[cellKey] ?? 0) > 1;
      const healed = this.healAmount + (sharedExtraPower ? 5 : 0);
      const { result: healthChange, character: updatedCharacter } =
        applyHealthDelta(participant.character, healed);
      mergeCharacterState(participant.character, updatedCharacter);
      const restored = Math.max(0, healthChange.delta);
      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          healed: restored,
          extraExecutions,
          sharedExtraPower,
        },
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      const target: ReplayActionTarget = {
        targetId: participant.playerId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          healed: restored,
          extraExecutions,
          sharedExtraPower,
        },
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

const sleepAction = new SleepAction();

export function executeSleepAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return sleepAction.execute(participants, match);
}
