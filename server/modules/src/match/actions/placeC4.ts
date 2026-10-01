/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, ItemLibrary } from "@shared";
import type {
  ActionId,
  C4Record,
  HexTileSnapshot,
  ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { getRequestedExtraExecutions, getUsableExtraExecutions } from "../../utils/energy";
import {
  consumeCarriedItem,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

function findTileAtCoord(
  match: MatchRecord,
  coord: { q: number; r: number },
): HexTileSnapshot | undefined {
  return match.map?.tiles.find(
    (tile) => tile.coord.q === coord.q && tile.coord.r === coord.r,
  );
}

function countCarriedC4(character: PlannedActionParticipant["character"]): number {
  return (character.inventory?.carriedItems ?? [])
    .filter((item) => item.itemId === "c4")
    .reduce(
      (total, item) =>
        total +
        (typeof item.quantity === "number"
          ? Math.max(0, Math.floor(item.quantity))
          : 0),
      0,
    );
}

function createC4Id(match: MatchRecord, ownerId: string, turn: number): string {
  const existing = new Set((match.c4s ?? []).map((charge) => charge.id));
  let index = (match.c4s ?? []).length;
  let id = `c4_${turn}_${ownerId}_${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `c4_${turn}_${ownerId}_${index}`;
  }
  return id;
}

function addDetonator(character: PlannedActionParticipant["character"]): void {
  character.inventory ??= { carriedItems: [] };
  character.inventory.carriedItems ??= [];
  const weight = ItemLibrary.detonator.weight;
  const stack = character.inventory.carriedItems.find(
    (item) => item.itemId === "detonator",
  );
  if (stack) {
    stack.quantity += 1;
    stack.weight += weight;
  } else {
    character.inventory.carriedItems.push({
      itemId: "detonator",
      quantity: 1,
      weight,
    });
  }
  if (character.stats?.load) {
    character.stats.load.current += weight;
  }
}

export class PlaceC4Action extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
    logger?: nkruntime.Logger,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const coord = participant.character.position?.coord;
      const tile = coord ? findTileAtCoord(match, coord) : undefined;
      if (
        !coord ||
        !tile ||
        tile.walkable === false ||
        tile.meta?.destroyed === true
      ) {
        logger?.debug(
          "place_c4 rejected match=%s player=%s reason=%s",
          match.match_id,
          participant.playerId,
          !coord ? "missing_origin" : !tile ? "missing_origin_tile" : "origin_unavailable",
        );
        this.clearPlan(participant);
        continue;
      }

      const c4Count = countCarriedC4(participant.character);
      const requestedExtraExecutions = getRequestedExtraExecutions(
        participant.plan,
      );
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        {
          ...participant.plan,
          extraExecutions: Math.min(
            requestedExtraExecutions,
            Math.max(0, c4Count - 1),
          ),
        },
        ActionLibrary.place_c4,
      );
      const placements = 1 + extraExecutions;
      for (let index = 0; index < placements; index += 1) {
        if (!consumeCarriedItem(participant.character, "c4")) {
          break;
        }
        const charge: C4Record = {
          id: createC4Id(
            match,
            participant.playerId,
            (match.current_turn ?? 0) + 1,
          ),
          ownerId: participant.playerId,
          tileId: tile.id,
          coord: { ...coord },
          placedTurn: (match.current_turn ?? 0) + 1,
        };
        match.c4s = [...(match.c4s ?? []), charge];
        addDetonator(participant.character);
        events.push({
          kind: "player",
          actorId: participant.playerId,
          action: {
            actionId: ActionLibrary.place_c4.id as ActionId,
            originLocation: { ...coord },
            targetLocation: { ...coord },
            metadata: {
              c4Id: charge.id,
              detonatorAdded: true,
            },
          },
        });
      }

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }
    return events;
  }
}

const placeC4Action = new PlaceC4Action();

export function executePlaceC4Action(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
  logger?: nkruntime.Logger,
): ReplayPlayerEvent[] {
  return placeC4Action.execute(participants, match, logger);
}
