/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, ItemLibrary } from "@shared";
import type { ActionId, ReplayPlayerEvent } from "@shared";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";

const FUEL_AMOUNT = 3;

function addFuel(participant: PlannedActionParticipant): void {
  const character = participant.character;
  character.inventory ??= { carriedItems: [] };
  if (!Array.isArray(character.inventory.carriedItems)) {
    character.inventory.carriedItems = [];
  }

  const fuelWeight = ItemLibrary.fuel.weight * FUEL_AMOUNT;
  const stack = character.inventory.carriedItems.find(
    (item) => item.itemId === "fuel",
  );
  if (stack) {
    const quantity =
      typeof stack.quantity === "number" && Number.isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity))
        : 0;
    const weight =
      typeof stack.weight === "number" && Number.isFinite(stack.weight)
        ? Math.max(0, stack.weight)
        : 0;
    stack.quantity = quantity + FUEL_AMOUNT;
    stack.weight = weight + fuelWeight;
  } else {
    character.inventory.carriedItems.push({
      itemId: "fuel",
      quantity: FUEL_AMOUNT,
      weight: fuelWeight,
    });
  }

  if (character.stats?.load) {
    const current =
      typeof character.stats.load.current === "number" &&
      Number.isFinite(character.stats.load.current)
        ? character.stats.load.current
        : 0;
    character.stats.load.current = current + fuelWeight;
  }
}

export class RefuelAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      addFuel(participant);
      const coord = participant.character.position?.coord;
      const fuelItems = Array.from({ length: FUEL_AMOUNT }, () => ({
        id: null,
        itemType: "fuel",
      }));
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action: {
          actionId: ActionLibrary.refuel.id as ActionId,
          ...(coord ? { originLocation: { ...coord } } : {}),
          ...(coord ? { targetLocation: { ...coord } } : {}),
          metadata: {
            fuelAdded: FUEL_AMOUNT,
            pickedItems: fuelItems,
          },
        },
      });
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }
    return events;
  }
}

const refuelAction = new RefuelAction();

export function executeRefuelAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return refuelAction.execute(participants, match);
}
