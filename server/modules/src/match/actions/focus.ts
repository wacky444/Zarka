/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
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
import { isCharacterDead } from "../../utils/playerCharacter";
import { BaseAction } from "./classes/BaseAction";

const FOCUS_BASE_BONUS = 6;

function applyFocusBonus(character: PlayerCharacter, bonus: number): number {
  const stats = character.stats;
  if (!stats?.energy) {
    return 0;
  }
  const track = stats.energy;
  const previous =
    typeof track.temporary === "number" && isFinite(track.temporary)
      ? track.temporary
      : 0;
  const next = previous + bonus;
  track.temporary = next;
  return bonus;
}

function recoverFocusEnergy(character: PlayerCharacter, amount: number): number {
  if (amount <= 0 || !character.stats?.energy) {
    return 0;
  }
  const energy = character.stats.energy;
  const current =
    typeof energy.current === "number" && isFinite(energy.current)
      ? energy.current
      : 0;
  const max =
    typeof energy.max === "number" && isFinite(energy.max)
      ? energy.max
      : current;
  const next = Math.min(max, current + amount);
  energy.current = next;
  return next - current;
}

export class FocusAction extends BaseAction {
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
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.focus
      );
      const healthEvents: ReplayPlayerEvent[] = [];
      let healthLost = 0;
      for (let index = 0; index < extraExecutions; index += 1) {
        const healthOutcome = applyHealthDelta(participant.character, -1);
        mergeCharacterState(participant.character, healthOutcome.character);
        healthLost += Math.max(0, -healthOutcome.result.delta);
        if (healthOutcome.event) {
          healthEvents.push(healthOutcome.event);
        }
        if (healthOutcome.result.dead) {
          break;
        }
      }
      const energyRestored = isCharacterDead(participant.character)
        ? 0
        : recoverFocusEnergy(participant.character, healthLost * 3);
      const granted = isCharacterDead(participant.character)
        ? 0
        : applyFocusBonus(participant.character, FOCUS_BASE_BONUS);
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
      const action: ReplayActionDone = {
        actionId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          energyBonus: granted,
          energyRestored,
          extraExecutions,
          healthLost,
        },
      };
      if (participant.character.position?.coord) {
        action.originLocation = participant.character.position.coord;
      }
      const target: ReplayActionTarget = {
        targetId: participant.playerId,
        effects: ReplayActionEffect.Heal,
        metadata: {
          energyBonus: granted,
          energyRestored,
          extraExecutions,
          healthLost,
        },
      };
      events.push(...healthEvents);
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

const focusAction = new FocusAction();

export function executeFocusAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return focusAction.execute(participants, match);
}
