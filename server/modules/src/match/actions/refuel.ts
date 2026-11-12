/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { ActionLibrary, addCarriedItem, ItemLibrary } from "@shared";
import type { ActionId, ReplayPlayerEvent } from "@shared";
import type { MatchRecord } from "../../models/types";
import type { PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";

const FUEL_AMOUNT = 3;

function addFuel(participant: PlannedActionParticipant): void {
  addCarriedItem(participant.character, "fuel", FUEL_AMOUNT);
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
        importance: 1,
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
