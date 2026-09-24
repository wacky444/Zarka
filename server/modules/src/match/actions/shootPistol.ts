/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  Axial,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  ActionLibrary,
  ReplayActionEffect,
  axialDistance,
  getDamageReduction,
  getDodgeSuccessChance,
} from "@shared";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  consumeCarriedItem,
  hasCarriedItem,
  getInventoryDamageReduction,
  isTargetProtected,
  mergeCharacterState,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { getUsableExtraExecutions } from "../../utils/energy";
import { isCharacterDead } from "../../utils/playerCharacter";
import { collectTargets } from "./targeting";
import { BaseAction } from "./classes/BaseAction";

function resolveDodge(target: PlayerCharacter): boolean {
  const attempts = target.statuses?.dodgeAttempts ?? 0;
  if (attempts <= 0) {
    return false;
  }
  const isDodged = Math.random() < getDodgeSuccessChance(target);
  if (isDodged && target.statuses) {
    target.statuses.dodgeAttempts = attempts - 1;
  }
  return isDodged;
}

export class ShootPistolAction extends BaseAction {
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

      const hasSuppressed = hasCarriedItem(
        participant.character,
        "suppressed_pistol"
      );
      const weaponUsed = hasSuppressed ? "suppressed_pistol" : "pistol";

      const definition = ActionLibrary[actionId];
      const canAffordExtraAmmo = hasCarriedItem(
        participant.character,
        "bullet",
        2
      );
      const usableExtra =
        definition && canAffordExtraAmmo
          ? getUsableExtraExecutions(
              participant.character,
              participant.plan,
              definition
            )
          : 0;
      const extraExecutions = usableExtra > 0 ? 1 : 0;
      const bulletsConsumed = 1 + extraExecutions;

      consumeCarriedItem(participant.character, "bullet", bulletsConsumed);

      const targetEntries: ReplayActionTarget[] = [];
      const shotTargetLocations: Axial[] = [];
      let totalDamage = 0;
      const postEvents: ReplayPlayerEvent[] = [];

      for (let shotIndex = 0; shotIndex < bulletsConsumed; shotIndex += 1) {
        const requestedTargetId =
          shotIndex === 0
            ? participant.plan.targetPlayerIds?.[0]
            : participant.plan.secondTargetPlayerId;
        const targetLocationId =
          shotIndex === 0
            ? participant.plan.targetLocationId
            : participant.plan.secondTargetLocationId;
        const shotParticipant: PlannedActionParticipant = {
          ...participant,
          plan: {
            ...participant.plan,
            targetPlayerIds: requestedTargetId ? [requestedTargetId] : [],
            targetLocationId,
          },
        };
        const targetCandidate = collectTargets(
          actionId,
          shotParticipant,
          match,
          {
            allowMultiple: false,
            filter: (candidate) => !isCharacterDead(candidate.character),
          }
        )[0];
        if (!targetCandidate) {
          continue;
        }
        shotTargetLocations.push(targetCandidate.coord);
        const targetId = targetCandidate.id;
        const target = match.playerCharacters?.[targetId];
        if (!target) {
          continue;
        }

        if (resolveDodge(target)) {
          match.playerCharacters[targetId] = target;
          targetEntries.push({
            targetId,
            damageTaken: 0,
            effects: ReplayActionEffect.Dodged,
            metadata: {
              shotNumber: shotIndex + 1,
              targetLocation: targetCandidate.coord,
            },
          });
          continue;
        }

        const guarded = isTargetProtected(target);
        const guardedDamage = resolveGuardedDamage(10, guarded);
        const damageReduction =
          getDamageReduction(target) +
          getInventoryDamageReduction(target, "bullet");
        const dealtAmount = Math.max(0, guardedDamage - damageReduction);

        const {
          result: healthChange,
          character: updatedTarget,
          event,
        } = applyHealthDelta(target, -dealtAmount);
        mergeCharacterState(target, updatedTarget);
        match.playerCharacters[targetId] = target;

        if (event) {
          postEvents.push(event);
        }

        const applied = Math.max(0, -healthChange.delta);
        totalDamage += applied;
        const eliminated =
          healthChange.current === 0 && healthChange.previous > 0;

        const targetEntry: ReplayActionTarget = {
          targetId,
          damageTaken: applied,
          effects: buildGuardedEffectMask(guarded),
          metadata: {
            shotNumber: shotIndex + 1,
            targetLocation: targetCandidate.coord,
          },
        };
        if (eliminated) {
          targetEntry.eliminated = true;
        }
        targetEntries.push(targetEntry);
      }

      this.clearPlan(participant);

      const actionMetadata: Record<string, unknown> = {
        weaponUsed,
        bulletsConsumed,
        shotTargetLocations,
        ...(extraExecutions > 0 ? { extraExecutions } : {}),
      };

      const action: ReplayActionDone = {
        actionId,
        damageDealt: totalDamage,
        effects: ReplayActionEffect.Hit,
        metadata: actionMetadata,
      };
      const originLocation = participant.character.position?.coord;
      if (originLocation) {
        action.originLocation = originLocation;
      }
      const hearingRadious = ActionLibrary[actionId].hearingRadious;
      let visibility: ReplayPlayerEvent["visibility"];
      if (
        weaponUsed !== "suppressed_pistol" &&
        typeof hearingRadious === "number" &&
        isFinite(hearingRadious) &&
        hearingRadious >= 0
      ) {
        const hearingPlayerIds = [participant.playerId];
        for (const target of targetEntries) {
          if (hearingPlayerIds.indexOf(target.targetId) === -1) {
            hearingPlayerIds.push(target.targetId);
          }
        }
        if (originLocation) {
          const characters = match.playerCharacters ?? {};
          for (const playerId in characters) {
            if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
              continue;
            }
            const character = characters[playerId];
            const coord = character?.position?.coord;
            if (
              !isCharacterDead(character) &&
              coord &&
              axialDistance(originLocation, coord) <= hearingRadious
            ) {
              if (hearingPlayerIds.indexOf(playerId) === -1) {
                hearingPlayerIds.push(playerId);
              }
            }
          }
        }
        visibility = {
          scope: "limited",
          playerIds: hearingPlayerIds,
        };
      }
      if (shotTargetLocations.length > 0) {
        action.targetLocation = shotTargetLocations[0];
      } else if (participant.plan.targetLocationId) {
        action.targetLocation = participant.plan.targetLocationId;
      }

      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: targetEntries,
        ...(visibility ? { visibility } : {}),
      });

      if (postEvents.length > 0) {
        events.push(...postEvents);
      }
    }
    return events;
  }
}

const shootPistolAction = new ShootPistolAction();

export function executeShootPistolAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return shootPistolAction.execute(participants, match);
}
