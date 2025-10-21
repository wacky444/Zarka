/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionEffectMask,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import { ReplayActionEffect } from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";

function sameCoord(
  a: { q: number; r: number } | undefined,
  b: { q: number; r: number } | undefined
): boolean {
  if (!a || !b) {
    return false;
  }
  return a.q === b.q && a.r === b.r;
}

function collectTargets(
  participant: PlannedActionParticipant,
  match: MatchRecord
): string[] {
  const map = match.playerCharacters ?? {};
  const selected: string[] = [];
  const rawTargets = participant.plan.targetPlayerIds ?? [];
  for (const candidate of rawTargets) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }
    if (!map[candidate]) {
      continue;
    }
    if (selected.indexOf(candidate) === -1) {
      selected.push(candidate);
    }
  }
  if (selected.length > 0) {
    return selected;
  }
  const targetCoord = participant.plan.targetLocationId;
  if (targetCoord) {
    for (const playerId in map) {
      if (!Object.prototype.hasOwnProperty.call(map, playerId)) {
        continue;
      }
      if (playerId === participant.playerId) {
        continue;
      }
      const character = map[playerId];
      if (!character?.position?.coord) {
        continue;
      }
      if (sameCoord(character.position.coord, targetCoord)) {
        if (selected.indexOf(playerId) === -1) {
          selected.push(playerId);
        }
      }
    }
  }
  if (selected.length > 0) {
    return selected;
  }
  const actorCoord = participant.character.position?.coord;
  if (actorCoord) {
    for (const playerId in map) {
      if (!Object.prototype.hasOwnProperty.call(map, playerId)) {
        continue;
      }
      if (playerId === participant.playerId) {
        continue;
      }
      const character = map[playerId];
      if (!character?.position?.coord) {
        continue;
      }
      if (sameCoord(character.position.coord, actorCoord)) {
        if (selected.indexOf(playerId) === -1) {
          selected.push(playerId);
        }
      }
    }
  }
  return selected;
}

function hasProtection(target: PlayerCharacter): boolean {
  const statuses = target.statuses;
  if (!statuses?.conditions) {
    return false;
  }
  return statuses.conditions.indexOf("protected") !== -1;
}

function computeDamage(baseDamage: number, guarded: boolean): number {
  if (!guarded) {
    return baseDamage;
  }
  const reduction = Math.ceil(baseDamage / 3);
  const dealt = baseDamage - reduction;
  return dealt > 0 ? dealt : 0;
}

function applyDamage(target: PlayerCharacter, amount: number): number {
  const health = target.stats?.health;
  if (!health) {
    return 0;
  }
  const previous = health.current;
  const next = Math.max(0, previous - amount);
  health.current = next;
  return previous - next;
}

function buildTargetEffects(guarded: boolean): ReplayActionEffectMask {
  let mask = ReplayActionEffect.Hit;
  if (guarded) {
    mask |= ReplayActionEffect.Guard;
  }
  return mask;
}

export function executePunchAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const roster = participants.slice();
  for (let i = roster.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = roster[i];
    roster[i] = roster[j];
    roster[j] = tmp;
  }

  const events: ReplayPlayerEvent[] = [];
  for (const participant of roster) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const targets = collectTargets(participant, match);
    const targetEntries: ReplayActionTarget[] = [];
    let totalDamage = 0;
    for (const targetId of targets) {
      const target = match.playerCharacters?.[targetId];
      if (!target) {
        continue;
      }
      const guarded = hasProtection(target);
      const baseDamage = 2;
      const dealtAmount = computeDamage(baseDamage, guarded);
      const applied = applyDamage(target, dealtAmount);
      totalDamage += applied;
      const eliminated = target.stats?.health?.current === 0;
      match.playerCharacters[targetId] = target;
      const targetEntry: ReplayActionTarget = {
        targetId,
        damageTaken: applied,
        effects: buildTargetEffects(guarded),
      };
      if (eliminated) {
        targetEntry.eliminated = true;
      }
      targetEntries.push(targetEntry);
    }
    clearPlanByKey(participant.character, participant.planKey);
    if (targetEntries.length === 0) {
      continue;
    }
    const action: ReplayActionDone = {
      actionId,
      damageDealt: totalDamage,
      effects: ReplayActionEffect.Hit,
    };
    if (participant.character.position?.coord) {
      action.originLocation = participant.character.position.coord;
    }
    if (participant.plan.targetLocationId) {
      action.targetLocation = participant.plan.targetLocationId;
    }
    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
      targets: targetEntries,
    });
  }
  return events;
}
