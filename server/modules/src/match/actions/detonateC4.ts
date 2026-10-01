/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, ReplayActionEffect, axialDistance, getDamageReduction } from "@shared";
import type { ActionId, Axial, C4Record, ReplayPlayerEvent } from "@shared";
import type { MatchRecord } from "../../models/types";
import { getRequestedExtraExecutions, getUsableExtraExecutions } from "../../utils/energy";
import {
  applyHealthDelta,
  consumeCarriedItem,
  countCarriedItem,
  createFailedActionEvent,
  getInventoryDamageReduction,
  isTargetProtected,
  matchesDeadCharacterPolicy,
  mergeCharacterState,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const C4_DAMAGE = 12;
const C4_AUDIBLE_RANGE = 2;

function sameCoord(left: Axial | undefined, right: Axial | undefined): boolean {
  return !!left && !!right && left.q === right.q && left.r === right.r;
}

function findOwnedCharge(
  charges: C4Record[],
  ownerId: string,
  coord: Axial,
  excludedIds: Set<string>,
): C4Record | undefined {
  return charges.find(
    (charge) =>
      charge.ownerId === ownerId &&
      !excludedIds.has(charge.id) &&
      sameCoord(charge.coord, coord),
  );
}

function getVisiblePlayerIds(
  match: MatchRecord,
  ownerId: string,
  explosionCoord: Axial,
): string[] {
  const visiblePlayerIds = new Set<string>([ownerId]);
  for (const playerId of match.players ?? []) {
    const coord = match.playerCharacters?.[playerId]?.position?.coord;
    if (coord && axialDistance(coord, explosionCoord) <= C4_AUDIBLE_RANGE) {
      visiblePlayerIds.add(playerId);
    }
  }
  return [...visiblePlayerIds];
}

function detonateCharge(
  charge: C4Record,
  participant: PlannedActionParticipant,
  match: MatchRecord,
): ReplayPlayerEvent[] {
  const postEvents: ReplayPlayerEvent[] = [];
  for (const playerId in match.playerCharacters) {
    if (!Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)) {
      continue;
    }
    const target = match.playerCharacters[playerId];
    if (
      !target ||
      !matchesDeadCharacterPolicy(target, "exclude") ||
      !sameCoord(target.position?.coord, charge.coord)
    ) {
      continue;
    }

    const guarded = isTargetProtected(target);
    const guardedDamage = resolveGuardedDamage(C4_DAMAGE, guarded);
    const damageReduction =
      getDamageReduction(target) + getInventoryDamageReduction(target, "explosive");
    const outcome = applyHealthDelta(
      target,
      -Math.max(0, guardedDamage - damageReduction),
    );
    mergeCharacterState(target, outcome.character);
    match.playerCharacters[playerId] = target;
    if (outcome.event) {
      postEvents.push(outcome.event);
    }
  }

  return [
    {
      kind: "player",
      actorId: participant.playerId,
      action: {
        actionId: ActionLibrary.detonate_c4.id as ActionId,
        targetLocation: { ...charge.coord },
        effects: ReplayActionEffect.Hit,
      },
      visibility: {
        scope: "limited",
        playerIds: getVisiblePlayerIds(match, participant.playerId, charge.coord),
      },
    },
    ...postEvents,
  ];
}

export class DetonateC4Action extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const charges = match.c4s ?? [];
      const ownedCharges = charges.filter(
        (charge) => charge.ownerId === participant.playerId,
      );
      const primaryCoord =
        participant.plan.targetLocationId ??
        participant.character.position?.coord;
      const primaryCharge = primaryCoord
        ? findOwnedCharge(charges, participant.playerId, primaryCoord, new Set())
        : undefined;
      if (!primaryCharge) {
        events.push(
          createFailedActionEvent(participant, ActionLibrary.detonate_c4.id, {
            reason: "invalid_target",
          }),
        );
        this.clearPlan(participant);
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const requestedExtraExecutions = getRequestedExtraExecutions(
        participant.plan,
      );
      const excludedIds = new Set([primaryCharge.id]);
      const secondaryCoord = participant.plan.secondTargetLocationId;
      const secondaryCharge = secondaryCoord
        ? findOwnedCharge(
            charges,
            participant.playerId,
            secondaryCoord,
            excludedIds,
          )
        : ownedCharges.find((charge) => !excludedIds.has(charge.id));
      const detonatorCount = countCarriedItem(
        participant.character,
        "detonator",
      );
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        {
          ...participant.plan,
          extraExecutions: Math.min(
            requestedExtraExecutions,
            secondaryCharge ? 1 : 0,
            Math.max(0, detonatorCount - 1),
          ),
        },
        ActionLibrary.detonate_c4,
      );
      const chargesToDetonate =
        extraExecutions > 0 && secondaryCharge
          ? [primaryCharge, secondaryCharge]
          : [primaryCharge];

      for (const charge of chargesToDetonate) {
        if (!consumeCarriedItem(participant.character, "detonator")) {
          break;
        }
        match.c4s = (match.c4s ?? []).filter(
          (placedCharge) => placedCharge.id !== charge.id,
        );
        events.push(...detonateCharge(charge, participant, match));
      }

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }
    return events;
  }
}

const detonateC4Action = new DetonateC4Action();

export function executeDetonateC4Action(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return detonateC4Action.execute(participants, match);
}
