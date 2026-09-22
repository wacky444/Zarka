/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  HexTileSnapshot,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
} from "@shared";
import {
  ActionLibrary,
  ReplayActionEffect,
  axialDistance,
  getDamageReduction,
} from "@shared";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  consumeCarriedItem,
  isTargetProtected,
  mergeCharacterState,
  getInventoryDamageReduction,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const ROCKET_DAMAGE = 20;

function findTileAtCoord(
  match: MatchRecord,
  coord: { q: number; r: number },
): HexTileSnapshot | undefined {
  for (const tile of match.map?.tiles ?? []) {
    if (tile.coord.q === coord.q && tile.coord.r === coord.r) {
      return tile;
    }
  }
  return undefined;
}

export class ShootRocketLauncherAction extends BaseAction {
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

      const origin = participant.character.position?.coord;
      const target = participant.plan.targetLocationId;
      const targetTile = target ? findTileAtCoord(match, target) : undefined;
      const validTarget =
        !!origin &&
        !!target &&
        !!targetTile &&
        targetTile.meta?.destroyed !== true &&
        axialDistance(origin, target) <= 1;

      // The launcher is consumed by the firing attempt and cannot be reused.
      const consumed = consumeCarriedItem(
        participant.character,
        "rocket_launcher",
      );
      if (!consumed || !validTarget || !target || !targetTile) {
        this.clearPlan(participant);
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const targetEntries: ReplayActionTarget[] = [];
      let totalDamage = 0;
      const postEvents: ReplayPlayerEvent[] = [];
      const characters = match.playerCharacters ?? {};
      for (const targetId in characters) {
        if (!Object.prototype.hasOwnProperty.call(characters, targetId)) {
          continue;
        }
        const character = characters[targetId];
        const characterCoord = character.position?.coord;
        if (
          !characterCoord ||
          characterCoord.q !== target.q ||
          characterCoord.r !== target.r
        ) {
          continue;
        }

        const guarded = isTargetProtected(character);
        const guardedDamage = resolveGuardedDamage(ROCKET_DAMAGE, guarded);
        const damageReduction =
          getDamageReduction(character) +
          getInventoryDamageReduction(character, "explosive");
        const dealtAmount = Math.max(0, guardedDamage - damageReduction);
        const outcome = applyHealthDelta(character, -dealtAmount);
        mergeCharacterState(character, outcome.character);
        match.playerCharacters![targetId] = character;
        if (outcome.event) {
          postEvents.push(outcome.event);
        }

        const applied = Math.max(0, -outcome.result.delta);
        totalDamage += applied;
        const targetEntry: ReplayActionTarget = {
          targetId,
          damageTaken: applied,
          effects: buildGuardedEffectMask(guarded),
        };
        if (outcome.result.current === 0 && outcome.result.previous > 0) {
          targetEntry.eliminated = true;
        }
        targetEntries.push(targetEntry);
      }

      if (!Array.isArray(targetTile.itemIds)) {
        targetTile.itemIds = [];
      }
      const destroyedItemIds = targetTile.itemIds.slice();
      targetTile.itemIds = [];
      if (destroyedItemIds.length > 0 && Array.isArray(match.items)) {
        match.items = match.items.filter(
          (item) => destroyedItemIds.indexOf(item.item_id) === -1,
        );
      }
      targetTile.meta = {
        ...(targetTile.meta ?? {}),
        destructionTurn: (match.current_turn ?? 0) + 1,
        rocketLauncherExplosionVisible: true,
      };

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      const action: ReplayActionDone = {
        actionId,
        originLocation: origin,
        targetLocation: target,
        damageDealt: totalDamage,
        effects: ReplayActionEffect.Hit,
        metadata: {
          weaponUsed: "rocket_launcher",
          consumed: true,
          destroyedItemCount: destroyedItemIds.length,
        },
      };
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: targetEntries,
        visibility: { scope: "all" },
      });
      events.push(...postEvents);
    }

    return events;
  }
}

const shootRocketLauncherAction = new ShootRocketLauncherAction();

export function executeShootRocketLauncherAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return shootRocketLauncherAction.execute(participants, match);
}
