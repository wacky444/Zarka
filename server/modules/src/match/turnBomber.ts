/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionLibrary,
  type ReplayEvent,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import { applyDamage } from "./actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";
import { areSameLocation } from "../utils/location";

export function executeBomberStrikes(
  match: MatchRecord,
  resolvedTurn: number,
  logger?: nkruntime.Logger,
): ReplayEvent[] {
  if (!match.pendingBomberStrikes || match.pendingBomberStrikes.length === 0) {
    return [];
  }

  const strikesToExecute = match.pendingBomberStrikes.filter(
    (strike) => strike.purchasedTurn < resolvedTurn,
  );
  if (strikesToExecute.length === 0) {
    return [];
  }

  match.pendingBomberStrikes = match.pendingBomberStrikes.filter(
    (strike) => strike.purchasedTurn >= resolvedTurn,
  );
  if (match.pendingBomberStrikes.length === 0) {
    delete match.pendingBomberStrikes;
  }

  const characters = match.playerCharacters ?? {};
  const events: ReplayEvent[] = [];

  for (const strike of strikesToExecute) {
    const { buyerPlayerId, targetLocation } = strike;

    const bomberTargetIds = Object.keys(characters).filter((playerId) => {
      const candidate = characters[playerId];
      return (
        !!candidate &&
        !isCharacterDead(candidate) &&
        areSameLocation(candidate.position?.coord, targetLocation)
      );
    });

    const targets = bomberTargetIds.map((playerId) => ({
      targetId: playerId,
      damageTaken: 5,
    }));

    const mainStrikeEvent: ReplayPlayerEvent = {
      kind: "player",
      importance: 1,
      actorId: buyerPlayerId,
      action: {
        actionId: ActionLibrary.buy_bomber.id,
        targetLocation,
        metadata: {
          targetLocation,
          bomberStrike: true,
          fromPlayerId: buyerPlayerId,
        },
      },
      targets: targets.length > 0 ? targets : undefined,
      visibility: { scope: "all" },
    };
    events.push(mainStrikeEvent);

    for (const playerId of bomberTargetIds) {
      const candidate = characters[playerId];
      if (!candidate) {
        continue;
      }
      const outcome = applyDamage(candidate, 5, "explosive", {
        ignoreGuarded: true,
        ignoreSkillReduction: true,
        canDamageUnconscious: true,
      });
      characters[playerId] = outcome.character;
      const damageTaken = Math.max(0, -outcome.result.delta);
      if (damageTaken > 0) {
        events.push({
          kind: "player",
          importance: 1,
          actorId: playerId,
          action: {
            actionId: ActionLibrary.buy_bomber.id,
            metadata: {
              personalDamage: damageTaken,
              fromPlayerId: buyerPlayerId,
            },
          },
          visibility: { scope: "limited", playerIds: [playerId] },
        });
      }
      if (outcome.event) {
        events.push(outcome.event);
      }
    }
  }

  return events;
}
