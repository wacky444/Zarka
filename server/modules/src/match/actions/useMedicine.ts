import type { MatchRecord } from "../../models/types";
import {
  ActionLibrary,
  ReplayActionEffect,
  type ActionId,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import { getUsableExtraExecutions } from "../../utils/energy";
import {
  applyHealthDelta,
  collectPlanTargetIds,
  consumeCarriedItem,
  hasCarriedItem,
  mergeCharacterState,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const MEDICINE_HEAL_AMOUNT = 8;

export class UseMedicineAction extends BaseAction {
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
      if (!hasCarriedItem(participant.character, "medicine")) {
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }

      const extraExecutions = hasCarriedItem(
        participant.character,
        "medicine",
        2
      )
        ? getUsableExtraExecutions(
            participant.character,
            participant.plan,
            ActionLibrary.use_medicine
          )
        : 0;
      const medicinesConsumed = 1 + extraExecutions;
      if (
        !consumeCarriedItem(
          participant.character,
          "medicine",
          medicinesConsumed
        )
      ) {
        this.clearPlan(participant);
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }

      const healedPerTarget = MEDICINE_HEAL_AMOUNT * medicinesConsumed;
      const targets = collectPlanTargetIds(participant, match);
      const appliedTargets: ReplayActionTarget[] = [];
      for (const targetId of targets) {
        const target = match.playerCharacters?.[targetId];
        if (!target) {
          continue;
        }
        const { result: healthChange, character: updatedTarget } =
          applyHealthDelta(target, healedPerTarget);
        mergeCharacterState(target, updatedTarget);
        const healed = Math.max(0, healthChange.delta);
        match.playerCharacters![targetId] = target;
        appliedTargets.push({
          targetId,
          effects: ReplayActionEffect.Heal,
          metadata: {
            healed,
            medicinesConsumed,
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
          consumedItemId: "medicine",
          medicinesConsumed,
          extraExecutions,
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

const useMedicineAction = new UseMedicineAction();

export function executeUseMedicineAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return useMedicineAction.execute(participants, match);
}
