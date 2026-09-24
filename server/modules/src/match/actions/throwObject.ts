/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import {
  ActionLibrary,
  axialDistance,
  getDamageReduction,
  getDodgeSuccessChance,
  ItemLibrary,
  ReplayActionEffect,
  type ActionId,
  type Axial,
  type HexTileSnapshot,
  type ItemId,
  type PlayerCharacter,
  type ReplayActionDone,
  type ReplayActionTarget,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { getUsableExtraExecutions } from "../../utils/energy";
import { isCharacterDead } from "../../utils/playerCharacter";
import { collectTargets } from "./targeting";
import {
  applyHealthDelta,
  buildGuardedEffectMask,
  consumeCarriedItem,
  createFailedActionEvent,
  getInventoryDamageReduction,
  isTargetProtected,
  mergeCharacterState,
  resolveGuardedDamage,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

interface ThrownItem {
  itemType: ItemId;
  itemId: string;
}

function findTileAtCoord(
  match: MatchRecord,
  coord: Axial
): HexTileSnapshot | undefined {
  for (const tile of match.map?.tiles ?? []) {
    if (tile.coord.q === coord.q && tile.coord.r === coord.r) {
      return tile;
    }
  }
  return undefined;
}

function addDiscoveredItem(
  character: PlayerCharacter,
  itemId: string
): void {
  if (!Array.isArray(character.discoveredItemIds)) {
    character.discoveredItemIds = [];
  }
  if (character.discoveredItemIds.indexOf(itemId) === -1) {
    character.discoveredItemIds.push(itemId);
  }
}

function selectThrowableItemTypes(
  character: PlayerCharacter,
  priorities: string[],
  limit: number
): ItemId[] {
  const counts: Record<string, number> = {};
  for (const stack of character.inventory?.carriedItems ?? []) {
    const itemType = stack?.itemId;
    if (
      typeof itemType !== "string" ||
      itemType === "zarkans" ||
      !Object.prototype.hasOwnProperty.call(ItemLibrary, itemType) ||
      typeof stack.quantity !== "number" ||
      !isFinite(stack.quantity)
    ) {
      continue;
    }
    counts[itemType] =
      (counts[itemType] ?? 0) + Math.max(0, Math.floor(stack.quantity));
  }

  const selected: ItemId[] = [];
  for (const itemType of priorities) {
    if (!Object.prototype.hasOwnProperty.call(counts, itemType)) {
      continue;
    }
    while (selected.length < limit && counts[itemType] > 0) {
      selected.push(itemType as ItemId);
      counts[itemType] -= 1;
    }
  }
  if (selected.length < limit) {
    for (const stack of character.inventory?.carriedItems ?? []) {
      const itemType = stack?.itemId;
      if (typeof itemType !== "string") {
        continue;
      }
      while (
        selected.length < limit &&
        Object.prototype.hasOwnProperty.call(counts, itemType) &&
        counts[itemType] > 0
      ) {
        selected.push(itemType as ItemId);
        counts[itemType] -= 1;
      }
      if (selected.length >= limit) {
        break;
      }
    }
  }
  return selected;
}

function createMatchItemId(): string {
  return `itm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

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

function getItemDamage(itemType: ItemId): number {
  return itemType === "molotov" ? 4 : 1;
}

export class ThrowObjectAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];

    for (const participant of roster) {
      const origin = participant.character.position?.coord;
      const targetCoord = participant.plan.targetLocationId ?? origin;
      const targetTile = targetCoord
        ? findTileAtCoord(match, targetCoord)
        : undefined;
      const distance = origin && targetCoord
        ? axialDistance(origin, targetCoord)
        : -1;
      if (
        !origin ||
        !targetCoord ||
        !targetTile ||
        targetTile.meta?.destroyed === true ||
        (distance !== 0 && distance !== 1)
      ) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, ActionLibrary.throw_object.id, {
            reason: "invalid_target",
          })
        );
        continue;
      }

      const affordableExtra = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.throw_object,
        false
      );
      const selectedItemTypes = selectThrowableItemTypes(
        participant.character,
        participant.plan.targetItemIds ?? [],
        1 + affordableExtra
      );
      if (selectedItemTypes.length === 0) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, ActionLibrary.throw_object.id, {
            reason: "missing_item",
          })
        );
        continue;
      }

      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        {
          ...participant.plan,
          extraExecutions: Math.min(
            affordableExtra,
            selectedItemTypes.length - 1
          ),
        },
        ActionLibrary.throw_object
      );
      const itemTypesToThrow = selectedItemTypes.slice(
        0,
        1 + extraExecutions
      );
      const thrownItems: ThrownItem[] = [];
      for (const itemType of itemTypesToThrow) {
        if (!consumeCarriedItem(participant.character, itemType)) {
          continue;
        }
        const itemId = createMatchItemId();
        if (!Array.isArray(match.items)) {
          match.items = [];
        }
        match.items.push({ item_id: itemId, item_type: itemType });
        if (!Array.isArray(targetTile.itemIds)) {
          targetTile.itemIds = [];
        }
        targetTile.itemIds.push(itemId);
        addDiscoveredItem(participant.character, itemId);
        thrownItems.push({ itemType, itemId });
      }

      if (thrownItems.length === 0) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, ActionLibrary.throw_object.id, {
            reason: "missing_item",
          })
        );
        continue;
      }

      const targets = collectTargets(
        ActionLibrary.throw_object.id,
        participant,
        match,
        {
          allowMultiple: true,
          filter: (candidate) =>
            !isCharacterDead(candidate.character) &&
            candidate.coord.q === targetCoord.q &&
            candidate.coord.r === targetCoord.r,
        }
      );
      const targetEntries: ReplayActionTarget[] = [];
      const postEvents: ReplayPlayerEvent[] = [];
      const baseDamage = thrownItems.reduce(
        (total, item) => total + getItemDamage(item.itemType),
        0
      );
      let totalDamage = 0;
      for (const candidate of targets) {
        const target = candidate.character;
        if (resolveDodge(target)) {
          match.playerCharacters![candidate.id] = target;
          for (const item of thrownItems) {
            addDiscoveredItem(target, item.itemId);
          }
          targetEntries.push({
            targetId: candidate.id,
            damageTaken: 0,
            effects: ReplayActionEffect.Dodged,
          });
          continue;
        }

        const guarded = isTargetProtected(target);
        const guardedDamage = resolveGuardedDamage(baseDamage, guarded);
        const damageReduction =
          getDamageReduction(target) +
          getInventoryDamageReduction(target, "physical");
        const dealtAmount = Math.max(0, guardedDamage - damageReduction);
        const {
          result: healthChange,
          character: updatedTarget,
          event,
        } = applyHealthDelta(target, -dealtAmount);
        mergeCharacterState(target, updatedTarget);
        match.playerCharacters![candidate.id] = target;
        for (const item of thrownItems) {
          addDiscoveredItem(target, item.itemId);
        }
        if (event) {
          postEvents.push(event);
        }

        const applied = Math.max(0, -healthChange.delta);
        totalDamage += applied;
        const targetEntry: ReplayActionTarget = {
          targetId: candidate.id,
          damageTaken: applied,
          effects: buildGuardedEffectMask(guarded),
          metadata: {
            thrownItemTypes: thrownItems.map((item) => item.itemType),
          },
        };
        if (healthChange.current === 0 && healthChange.previous > 0) {
          targetEntry.eliminated = true;
        }
        targetEntries.push(targetEntry);
      }

      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }

      const actionMetadata: Record<string, unknown> = {
        thrownItems: thrownItems.map((item) => ({ ...item })),
        extraExecutions,
      };
      const action: ReplayActionDone = {
        actionId: ActionLibrary.throw_object.id as ActionId,
        originLocation: { ...origin },
        targetLocation: { ...targetCoord },
        damageDealt: totalDamage,
        effects: ReplayActionEffect.Hit,
        metadata: actionMetadata,
      };
      const playerIds = [participant.playerId];
      for (const target of targets) {
        if (playerIds.indexOf(target.id) === -1) {
          playerIds.push(target.id);
        }
      }
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
        targets: targetEntries,
        visibility: { scope: "limited", playerIds },
      });
      events.push(...postEvents);
    }
    return events;
  }
}

const throwObjectAction = new ThrowObjectAction();

export function executeThrowObjectAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return throwObjectAction.execute(participants, match);
}
