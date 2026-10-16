import {
  ActionLibrary,
  ReplayActionEffect,
  type ActionId,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { countCarriedItem, consumeCarriedItem, createFailedActionEvent, type PlannedActionParticipant } from "./utils";
import { getUsableExtraExecutions } from "../../utils/energy";
import { collectTargets } from "./targeting";
import { BaseAction } from "./classes/BaseAction";

function foodCount(character: PlannedActionParticipant["character"]): number {
  return countCarriedItem(character, "food") + countCarriedItem(character, "drink");
}

function availableFood(character: PlannedActionParticipant["character"]): number {
  return Math.max(0, foodCount(character) - Math.max(0, character.poisonedFoodCount ?? 0));
}

export class PoisonFoodAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      const targets = collectTargets(actionId, participant, match, {
        deadCharacterPolicy: "exclude",
        allowMultiple: true,
        filter: (candidate) => availableFood(candidate.character) > 0,
      });
      const poisonCount = countCarriedItem(participant.character, "poison");
      const availableServings = targets.reduce(
        (sum, target) => sum + availableFood(target.character),
        0,
      );
      if (!targets.length || poisonCount <= 0 || availableServings <= 0) {
        this.clearPlan(participant);
        events.push(createFailedActionEvent(participant, actionId, {
          reason: poisonCount <= 0 ? "missing_item" : "invalid_target",
          ...(poisonCount <= 0 ? { missingItemId: "poison" } : {}),
        }));
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }
      const requestedExtra = Math.max(0, Math.floor(participant.plan.extraExecutions ?? 0));
      const possibleUses = Math.min(availableServings, poisonCount, requestedExtra + 1);
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        { ...participant.plan, extraExecutions: possibleUses - 1 },
        ActionLibrary.poison_food,
      );
      const uses = 1 + extraExecutions;
      let poisonedServings = 0;
      const poisonedTargets: ReplayActionTarget[] = [];
      for (const target of targets) {
        if (poisonedServings >= uses) break;
        const requestedAmount = Math.min(availableFood(target.character), uses - poisonedServings);
        let amount = 0;
        while (amount < requestedAmount && consumeCarriedItem(participant.character, "poison", 1)) {
          amount += 1;
        }
        if (amount <= 0) break;
        target.character.poisonedFoodCount = Math.max(0, target.character.poisonedFoodCount ?? 0) + amount;
        match.playerCharacters![target.id] = target.character;
        poisonedServings += amount;
        poisonedTargets.push({
          targetId: target.id,
          effects: ReplayActionEffect.Hit,
          metadata: { poisonedServings: amount },
        });
      }
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      if (poisonedServings > 0) {
        const action: ReplayActionDone = {
          actionId,
          effects: ReplayActionEffect.Hit,
          metadata: { consumedItemId: "poison", poisonedServings, extraExecutions },
        };
        if (participant.character.position?.coord) {
          action.originLocation = participant.character.position.coord;
        }
        events.push({ kind: "player", actorId: participant.playerId, action, targets: poisonedTargets });
      } else {
        events.push(createFailedActionEvent(participant, actionId, { reason: "missing_item", missingItemId: "poison" }));
      }
    }
    return events;
  }
}

const poisonFoodAction = new PoisonFoodAction();

export function executePoisonFoodAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return poisonFoodAction.execute(participants, match);
}
