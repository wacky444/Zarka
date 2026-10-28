import {
  ActionLibrary,
  ReplayActionEffect,
  type ActionId,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { areSameLocation } from "../../utils/location";
import { getUsableExtraExecutions } from "../../utils/energy";
import { clearPlanByKey, consumeCarriedItem, createFailedActionEvent, hasCarriedItem, type PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";
import { hasActiveIntoxication } from "./intoxication";

function clearIntoxication(character: PlannedActionParticipant["character"]): void {
  const statuses = character.statuses ?? { conditions: [] };
  character.statuses = {
    ...statuses,
    conditions: (statuses.conditions ?? []).filter((condition) => condition !== "intoxicated"),
    intoxication: undefined,
  };
}

export class UseAntidoteAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!hasCarriedItem(participant.character, "antidote")) {
        this.clearPlan(participant);
        events.push(createFailedActionEvent(participant, actionId, { reason: "missing_item", missingItemId: "antidote" }));
        continue;
      }
      const position = participant.character.position;
      const sameTileTargets = Object.entries(match.playerCharacters ?? {})
        .filter(([playerId, character]) =>
          playerId !== participant.playerId &&
          areSameLocation(position?.coord, character.position?.coord) &&
          hasActiveIntoxication(character)
        )
        .map(([playerId]) => playerId);
      const requestedIds = participant.plan.targetPlayerIds ?? [];
      const ownIsTarget = requestedIds.includes(participant.playerId) || requestedIds.length === 0;
      const candidates = [
        ...(ownIsTarget && hasActiveIntoxication(participant.character) ? [participant.playerId] : []),
        ...requestedIds.filter((id) => id !== participant.playerId && sameTileTargets.includes(id)),
        ...(requestedIds.length > 0 && (participant.plan.extraExecutions ?? 0) > 0
          ? sameTileTargets.filter((id) => !requestedIds.includes(id))
          : []),
      ];
      if (candidates.length === 0) {
        this.clearPlan(participant);
        events.push(createFailedActionEvent(participant, actionId, { reason: "invalid_target" }));
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }
      const possibleExtra = Math.min(
        Math.max(0, participant.plan.extraExecutions ?? 0),
        countAvailableAntidotes(participant.character) - 1,
        candidates.length - 1,
      );
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        { ...participant.plan, extraExecutions: possibleExtra },
        ActionLibrary.use_antidote,
      );
      const targetIds = candidates.slice(0, 1 + extraExecutions);
      if (!consumeCarriedItem(participant.character, "antidote", targetIds.length)) {
        this.clearPlan(participant);
        events.push(createFailedActionEvent(participant, actionId, { reason: "missing_item", missingItemId: "antidote" }));
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }
      const targets: ReplayActionTarget[] = [];
      for (const targetId of targetIds) {
        const target = match.playerCharacters?.[targetId];
        if (!target || !hasActiveIntoxication(target)) continue;
        clearIntoxication(target);
        match.playerCharacters![targetId] = target;
        targets.push({ targetId, effects: ReplayActionEffect.Heal, metadata: { curedIntoxication: true } });
      }
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      if (targets.length > 0) {
        const action: ReplayActionDone = {
          actionId,
          effects: ReplayActionEffect.Heal,
          metadata: { consumedItemId: "antidote", antidotesConsumed: targets.length, extraExecutions },
        };
        if (position?.coord) action.originLocation = position.coord;
        events.push({ kind: "player",
  importance: 1, actorId: participant.playerId, action, targets });
      }
    }
    return events;
  }
}

function countAvailableAntidotes(character: PlannedActionParticipant["character"]): number {
  return character.inventory?.carriedItems.reduce(
    (count, stack) => count + (stack.itemId === "antidote" ? Math.max(0, stack.quantity) : 0),
    0,
  ) ?? 0;
}

const useAntidoteAction = new UseAntidoteAction();

export function executeUseAntidoteAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return useAntidoteAction.execute(participants, match);
}
