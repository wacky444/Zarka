import type { MatchRecord } from "../../models/types";
import {
  ReplayActionEffect,
  type ActionId,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import {
  applyHealthDelta,
  collectPlanTargetIds,
  consumeCarriedItem,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

export class UseBandageAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

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
      const hadBandage = consumeCarriedItem(
        participant.character,
        "bandage",
        1
      );
      if (!hadBandage) {
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }
      const targets = collectPlanTargetIds(participant, match);
      const appliedTargets: ReplayActionTarget[] = [];
      for (const targetId of targets) {
        const target = match.playerCharacters?.[targetId];
        if (!target) {
          continue;
        }
        const { result: healthChange, character: updatedTarget } =
          applyHealthDelta(target, 5);
        mergeCharacterState(target, updatedTarget);
        const healed = Math.max(0, healthChange.delta);
        match.playerCharacters[targetId] = target;
        appliedTargets.push({
          targetId,
          effects: ReplayActionEffect.Heal,
          metadata: {
            healed,
          },
        });
      }
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      if (appliedTargets.length === 0) {
        continue;
      }
      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          consumedItemId: "bandage",
        },
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: appliedTargets,
      });
    }
    return events;
  }
}

const useBandageAction = new UseBandageAction();

export function executeUseBandageAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return useBandageAction.execute(participants, match);
}
