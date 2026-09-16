/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import {
  collectPlanTargetIds,
  consumeCarriedItem,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";
import { isCharacterDead } from "../../utils/playerCharacter";

function ensureVirusCondition(
  character: PlannedActionParticipant["character"],
  turn: number,
): void {
  const statuses = character.statuses ?? { conditions: [] };
  const conditions = Array.isArray(statuses.conditions)
    ? statuses.conditions
    : [];
  if (conditions.indexOf("infected") === -1) {
    conditions.push("infected");
  }
  character.statuses = {
    ...statuses,
    conditions,
    virus: {
      ...(statuses.virus ?? {}),
      containsVirus: true,
      contagious: true,
      lastTickTurn: turn,
    },
  };
}

export class InjectVirusAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }

      const targetIds = collectPlanTargetIds(participant, match);
      const targetId = targetIds[0];
      const target = targetId
        ? match.playerCharacters?.[targetId]
        : undefined;
      const origin = participant.character.position?.coord;
      const targetCoord = target?.position?.coord;
      const sameLocation =
        !!origin &&
        !!targetCoord &&
        !isCharacterDead(target) &&
        origin.q === targetCoord.q &&
        origin.r === targetCoord.r;
      const consumed = consumeCarriedItem(participant.character, "virus");

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      if (!consumed || !target || !sameLocation) {
        continue;
      }

      ensureVirusCondition(target, (match.current_turn ?? 0) + 1);
      match.playerCharacters![targetId] = target;
      const targetEntry: ReplayActionTarget = {
        targetId,
        metadata: { infected: true },
      };
      const action: ReplayActionDone = {
        actionId,
        originLocation: origin,
        damageDealt: 0,
        effects: ReplayActionEffect.Hit,
        metadata: {
          consumedItemId: "virus",
          infectedTargetId: targetId,
        },
      };
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: [targetEntry],
      });
    }
    return events;
  }
}

const injectVirusAction = new InjectVirusAction();

export function executeInjectVirusAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return injectVirusAction.execute(participants, match);
}

