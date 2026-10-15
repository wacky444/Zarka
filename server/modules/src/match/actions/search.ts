/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionDefinition,
  ActionId,
  HexTileSnapshot,
  MatchItemRecord,
  PlayerCharacter,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";
import {
  ActionLibrary,
  ExtraExecutionEffect,
  getSkillEffectTotal
} from "@shared";
import { type PlannedActionParticipant } from "./utils";
import { getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";

const BASE_DISCOVERY_COUNT = 5;

type ItemLookup = Record<string, MatchItemRecord>;

type DiscoveredItemTracking = {
  list: string[];
  lookup: Record<string, true>;
};

type SearchTarget =
  | { kind: "item"; id: string }
  | { kind: "c4"; id: string };

export function buildItemLookup(match: MatchRecord): ItemLookup {
  const lookup: ItemLookup = {};
  const items = Array.isArray(match.items) ? match.items : [];
  for (const entry of items) {
    if (!entry || typeof entry.item_id !== "string") {
      continue;
    }
    lookup[entry.item_id] = entry;
  }
  return lookup;
}

export function findTileById(
  match: MatchRecord,
  tileId: string
): HexTileSnapshot | undefined {
  const tiles = match.map?.tiles ?? [];
  for (const tile of tiles) {
    if (tile && tile.id === tileId) {
      return tile;
    }
  }
  return undefined;
}

function ensureDiscoveredItemTracking(
  character: PlayerCharacter
): DiscoveredItemTracking {
  const existing = Array.isArray(character.discoveredItemIds)
    ? character.discoveredItemIds
    : [];
  const lookup: Record<string, true> = {};
  const list: string[] = [];
  for (const entry of existing) {
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(lookup, entry)) {
      continue;
    }
    lookup[entry] = true;
    list.push(entry);
  }
  character.discoveredItemIds = list;
  return { list, lookup };
}

function shuffleItems<T>(items: T[]): T[] {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }
  return shuffled;
}

function sampleSearchTargets(
  pool: SearchTarget[],
  count: number,
  itemLookup: ItemLookup,
  prioritizeFoodDrink: boolean
): SearchTarget[] {
  const limit = Math.min(count, pool.length);
  if (limit <= 0) {
    return [];
  }

  const shuffledPool = shuffleItems(pool);
  if (!prioritizeFoodDrink) {
    return shuffledPool.slice(0, limit);
  }

  const priority = shuffledPool.filter((target) => {
    if (target.kind !== "item") {
      return false;
    }
    const itemType = itemLookup[target.id]?.item_type;
    return itemType === "food" || itemType === "drink";
  });
  const selected = priority.slice(0, limit);
  if (selected.length >= limit) {
    return selected;
  }
  const selectedIds = new Set(
    selected.map((target) => `${target.kind}:${target.id}`)
  );
  for (const target of shuffledPool) {
    if (selected.length >= limit) {
      break;
    }
    const key = `${target.kind}:${target.id}`;
    if (!selectedIds.has(key)) {
      selected.push(target);
      selectedIds.add(key);
    }
  }
  return selected;
}

function computeDiscoveryCount(
  character: PlayerCharacter,
  extraReps: number,
  definition: ActionDefinition | undefined,
  available: number
): number {
  const hasIncreaseScope =
    definition?.extraExecution?.effectType ===
    ExtraExecutionEffect.IncreaseScope;
  const extra = hasIncreaseScope ? extraReps : 0;
  const skillBonus = getSkillEffectTotal(
    character,
    "search_discovery_increase"
  );
  const baseTarget = BASE_DISCOVERY_COUNT + skillBonus + extra;
  return Math.min(available, baseTarget > 0 ? baseTarget : 0);
}

export class SearchAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    const itemLookup = buildItemLookup(match);
    match.playerCharacters = match.playerCharacters ?? {};

    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const position = participant.character.position;
      const tileId = position?.tileId;
      if (!tileId) {
        this.clearPlan(participant);
        continue;
      }
      const tile = findTileById(match, tileId);
      const tileItems = Array.isArray(tile?.itemIds) ? tile!.itemIds : [];
      const { list, lookup } = ensureDiscoveredItemTracking(participant.character);
      const undiscoveredItems = tile
        ? tileItems.filter(
            (itemId) => !Object.prototype.hasOwnProperty.call(lookup, itemId)
          )
        : [];
      const discoveredC4Ids = new Set(
        participant.character.discoveredC4Ids ?? []
      );
      const tileC4s = (match.c4s ?? []).filter(
        (charge) => charge.tileId === tileId
      );
      const undiscoveredC4s = tileC4s.filter(
        (charge) => !discoveredC4Ids.has(charge.id)
      );
      const searchTargets: SearchTarget[] = [
        ...undiscoveredItems.map((id) => ({ kind: "item" as const, id })),
        ...undiscoveredC4s.map((charge) => ({
          kind: "c4" as const,
          id: charge.id,
        })),
      ];
      const definition = ActionLibrary[actionId];
      const extraReps = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        definition
      );
      const discoveryCount = tile
        ? computeDiscoveryCount(
            participant.character,
            extraReps,
            definition,
            searchTargets.length
          )
        : 0;
      const discovered =
        discoveryCount > 0
          ? sampleSearchTargets(
              searchTargets,
              discoveryCount,
              itemLookup,
              participant.plan.prioritizeFoodDrink === true
            )
          : [];
      const discoveredItemIds = discovered
        .filter((target) => target.kind === "item")
        .map((target) => target.id);
      const foundC4Ids = discovered
        .filter((target) => target.kind === "c4")
        .map((target) => target.id);

      for (const itemId of discoveredItemIds) {
        if (Object.prototype.hasOwnProperty.call(lookup, itemId)) {
          continue;
        }
        lookup[itemId] = true;
        list.push(itemId);
      }
      if (discoveredItemIds.length > 0) {
        participant.character.discoveredItemIds = list;
      }
      if (foundC4Ids.length > 0) {
        participant.character.discoveredC4Ids = Array.from(
          new Set([...discoveredC4Ids, ...foundC4Ids])
        );
      }
      const remainingHidden = Math.max(
        0,
        searchTargets.length - discovered.length
      );
      const action: ReplayActionDone = {
        actionId,
        originLocation: position?.coord,
        targetLocation: position?.coord,
        metadata: {
          tileId,
          tileMissing: !tile,
          foundAny: discovered.length > 0,
          discoveredItemIds,
          discoveredC4Ids: foundC4Ids,
          discoveredItems: discovered.map((target) => ({
            id: target.id,
            itemType:
              target.kind === "c4"
                ? "c4"
                : itemLookup[target.id]?.item_type ?? null,
          })),
          revealedCount: discovered.length,
          remainingHidden,
          totalItems: tileItems.length + tileC4s.length,
          totalC4: tileC4s.length,
          extraExecutions: extraReps,
        },
      };

      this.clearPlan(participant);
      match.playerCharacters[participant.playerId] = participant.character;

      events.push({
        kind: "player",
        actorId: participant.playerId,
        action,
      });
    }

    return events;
  }
}

const searchAction = new SearchAction();

export function executeSearchAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return searchAction.execute(participants, match);
}
