/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import type {
  ActionId,
  ReplayEvent,
} from "@shared";
import type { MatchRecord } from "../models/types";
import {
  applyHealthDelta,
  getInventoryDamageReduction,
  type PlannedActionKey,
} from "./actions/utils";
import { isCharacterDead } from "../utils/playerCharacter";

export function applyFireDamageBeforeAction(
  match: MatchRecord,
  actionId: ActionId,
  resolvedTurn: number,
  logger: nkruntime.Logger,
): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const characters = match.playerCharacters;
  if (!characters) {
    return events;
  }
  const planKeys: PlannedActionKey[] = [
    "main",
    "secondary",
    "extraSecondary",
  ];
  const tileLookup: Record<string, NonNullable<MatchRecord["map"]>["tiles"][number]> = {};
  for (const tile of match.map?.tiles ?? []) {
    tileLookup[tile.id] = tile;
  }

  for (const playerId in characters) {
    if (!Object.prototype.hasOwnProperty.call(characters, playerId)) {
      continue;
    }
    let character = characters[playerId];
    if (!character || isCharacterDead(character)) {
      continue;
    }
    const tile = character.position?.tileId
      ? tileLookup[character.position.tileId]
      : undefined;
    const fireStartTurn =
      typeof tile?.meta?.fireStartTurn === "number"
        ? tile.meta.fireStartTurn
        : undefined;
    const fireEndTurn =
      typeof tile?.meta?.fireEndTurn === "number"
        ? tile.meta.fireEndTurn
        : undefined;
    if (
      fireStartTurn === undefined ||
      fireEndTurn === undefined ||
      resolvedTurn < fireStartTurn ||
      resolvedTurn > fireEndTurn
    ) {
      continue;
    }
    for (const planKey of planKeys) {
      const plan = character.actionPlan?.[planKey];
      if (!plan || plan.actionId !== actionId) {
        continue;
      }
      const damage = Math.max(
        0,
        2 - getInventoryDamageReduction(character, "fire"),
      );
      const outcome = applyHealthDelta(character, -damage, true, logger);
      character = outcome.character;
      characters[playerId] = character;
      const damageTaken = Math.max(0, -outcome.result.delta);
      events.push({
        kind: "player",
        actorId: playerId,
        action: {
          actionId: "fire_damage",
          originLocation: character.position?.coord,
          damageDealt: damageTaken,
          metadata: {
            source: "fire",
            fireTurn: resolvedTurn,
          },
        },
        targets: [
          {
            targetId: playerId,
            damageTaken,
            eliminated: outcome.result.dead,
          },
        ],
      });
      if (outcome.event) {
        events.push(outcome.event);
      }
    }
  }
  return events;
}

export function clearExpiredFires(
  match: MatchRecord,
  resolvedTurn: number,
): void {
  if (!match.map?.tiles) {
    return;
  }
  for (const tile of match.map.tiles) {
    if (
      typeof tile.meta?.fireEndTurn === "number" &&
      tile.meta.fireEndTurn <= resolvedTurn
    ) {
      delete tile.meta.fireStartTurn;
      delete tile.meta.fireEndTurn;
    }
  }
}
