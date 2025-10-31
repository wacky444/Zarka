/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  HexTileSnapshot,
  MatchItemRecord,
  PlayerCharacter,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";
import { clearPlanByKey, type PlannedActionParticipant } from "./utils";

const BASE_DISCOVERY_COUNT = 5;

type ItemLookup = Record<string, MatchItemRecord>;

type FoundTracking = {
  list: string[];
  lookup: Record<string, true>;
};

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
): HexTileSnapshot | null {
  const tiles = match.map?.tiles ?? [];
  for (const tile of tiles) {
    if (tile && tile.id === tileId) {
      return tile;
    }
  }
  return null;
}

function ensureFoundTracking(character: PlayerCharacter): FoundTracking {
  const existing = Array.isArray(character.foundItems)
    ? character.foundItems
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
  character.foundItems = list;
  return { list, lookup };
}

function sampleItems(source: string[], count: number): string[] {
  if (count <= 0 || source.length === 0) {
    return [];
  }
  const pool = source.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length));
}

function computeDiscoveryCount(
  plan: PlannedActionParticipant["plan"],
  available: number
): number {
  const extra =
    typeof plan.extraEffort === "number" && isFinite(plan.extraEffort)
      ? Math.floor(Math.max(0, plan.extraEffort))
      : 0;
  const baseTarget = BASE_DISCOVERY_COUNT + extra;
  return Math.min(available, baseTarget > 0 ? baseTarget : 0);
}

export function executeSearchAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  const events: ReplayPlayerEvent[] = [];
  const itemLookup = buildItemLookup(match);
  match.playerCharacters = match.playerCharacters ?? {};

  for (const participant of participants) {
    const actionId = participant.plan.actionId as ActionId;
    if (!actionId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const position = participant.character.position;
    const tileId = position?.tileId;
    if (!tileId) {
      clearPlanByKey(participant.character, participant.planKey);
      continue;
    }
    const tile = findTileById(match, tileId);
    const tileItems = Array.isArray(tile?.itemIds) ? tile!.itemIds : [];
    const { list, lookup } = ensureFoundTracking(participant.character);
    const undiscovered = tile
      ? tileItems.filter(
          (itemId) => !Object.prototype.hasOwnProperty.call(lookup, itemId)
        )
      : [];
    const discoveryCount = tile
      ? computeDiscoveryCount(participant.plan, undiscovered.length)
      : 0;
    const discovered =
      discoveryCount > 0 ? sampleItems(undiscovered, discoveryCount) : [];

    if (discovered.length > 0) {
      for (const itemId of discovered) {
        if (Object.prototype.hasOwnProperty.call(lookup, itemId)) {
          continue;
        }
        lookup[itemId] = true;
        list.push(itemId);
      }
      participant.character.foundItems = list;
    }
    const remainingHidden = Math.max(
      0,
      undiscovered.length - discovered.length
    );
    const action: ReplayActionDone = {
      actionId,
      originLocation: position?.coord,
      targetLocation: position?.coord,
      metadata: {
        tileId,
        tileMissing: !tile,
        foundAny: discovered.length > 0,
        discoveredItemIds: discovered,
        discoveredItems: discovered.map((itemId) => ({
          id: itemId,
          itemType: itemLookup[itemId]?.item_type ?? null,
        })),
        revealedCount: discovered.length,
        remainingHidden,
        totalItems: tileItems.length,
      },
    };

    clearPlanByKey(participant.character, participant.planKey);
    match.playerCharacters[participant.playerId] = participant.character;

    events.push({
      kind: "player",
      actorId: participant.playerId,
      action,
    });
  }

  return events;
}
