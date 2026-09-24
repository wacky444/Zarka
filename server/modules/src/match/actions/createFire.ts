import {
  ActionLibrary,
  axialDistance,
  type ActionId,
  type Axial,
  type HexTileSnapshot,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { collectFireObserverIds } from "../../utils/fireVisibility";
import {
  consumeCarriedItem,
  createFailedActionEvent,
  type PlannedActionParticipant,
} from "./utils";
import { BaseAction } from "./classes/BaseAction";

const FIRE_DURATION_TURNS = 3;
const LOCAL_FUEL_COST = 2;
const ADJACENT_FUEL_COST = 5;

function findTileAtCoord(
  match: MatchRecord,
  coord: Axial
): HexTileSnapshot | undefined {
  const tiles = match.map?.tiles ?? [];
  for (const tile of tiles) {
    if (tile.coord.q === coord.q && tile.coord.r === coord.r) {
      return tile;
    }
  }
  return undefined;
}

function countFuel(character: PlannedActionParticipant["character"]): number {
  return (character.inventory?.carriedItems ?? []).reduce(
    (total, stack) =>
      stack?.itemId === "fuel" &&
      typeof stack.quantity === "number" &&
      isFinite(stack.quantity)
        ? total + Math.max(0, Math.floor(stack.quantity))
        : total,
    0
  );
}

function consumeFuel(
  character: PlannedActionParticipant["character"],
  amount: number
): boolean {
  if (countFuel(character) < amount) {
    return false;
  }

  let remaining = amount;
  while (remaining > 0) {
    const stacks = character.inventory?.carriedItems ?? [];
    let stack: (typeof stacks)[number] | undefined;
    for (const candidate of stacks) {
      if (
        candidate?.itemId === "fuel" &&
        typeof candidate.quantity === "number" &&
        candidate.quantity > 0
      ) {
        stack = candidate;
        break;
      }
    }
    if (!stack || typeof stack.quantity !== "number") {
      return false;
    }
    const quantity = Math.max(0, Math.floor(stack.quantity));
    const consumed = Math.min(quantity, remaining);
    if (consumed <= 0 || !consumeCarriedItem(character, "fuel", consumed)) {
      return false;
    }
    remaining -= consumed;
  }
  return true;
}

export class CreateFireAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
    logger?: nkruntime.Logger
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const origin = participant.character.position?.coord;
      const target = participant.plan.targetLocationId ?? origin;
      const originTile = origin ? findTileAtCoord(match, origin) : undefined;
      const targetTile = target ? findTileAtCoord(match, target) : undefined;
      const distance = origin && target ? axialDistance(origin, target) : -1;
      const invalidTarget =
        !origin ||
        !originTile ||
        !target ||
        !targetTile ||
        targetTile.meta?.destroyed === true ||
        (distance !== 0 && distance !== 1);

      if (invalidTarget) {
        logger?.debug(
          "create_fire rejected match=%s player=%s origin=%s target=%s",
          match.match_id,
          participant.playerId,
          JSON.stringify(origin ?? null),
          JSON.stringify(target ?? null)
        );
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, ActionLibrary.create_fire.id, {
            reason: "invalid_target",
          })
        );
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }

      const fuelCost = distance === 0 ? LOCAL_FUEL_COST : ADJACENT_FUEL_COST;
      if (!consumeFuel(participant.character, fuelCost)) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, ActionLibrary.create_fire.id, {
            reason: "missing_item",
            missingItemId: "fuel",
          })
        );
        if (match.playerCharacters) {
          match.playerCharacters[participant.playerId] = participant.character;
        }
        continue;
      }

      const newFireStartTurn =
        Math.max(0, Math.floor(match.current_turn ?? 0)) + 2;
      const existingFireStartTurn = targetTile.meta?.fireStartTurn;
      const existingFireEndTurn = targetTile.meta?.fireEndTurn;
      const extendsExistingFire =
        typeof existingFireEndTurn === "number" &&
        existingFireEndTurn >= newFireStartTurn;
      const fireStartTurn =
        extendsExistingFire && typeof existingFireStartTurn === "number"
          ? Math.min(existingFireStartTurn, newFireStartTurn)
          : newFireStartTurn;
      const fireEndTurn = Math.max(
        extendsExistingFire && typeof existingFireEndTurn === "number"
          ? existingFireEndTurn
          : 0,
        newFireStartTurn + FIRE_DURATION_TURNS - 1
      );
      targetTile.meta = {
        ...(targetTile.meta ?? {}),
        fireStartTurn,
        fireEndTurn,
      };

      const event: ReplayPlayerEvent = {
        kind: "player",
        actorId: participant.playerId,
        action: {
          actionId: ActionLibrary.create_fire.id as ActionId,
          originLocation: { ...origin },
          targetLocation: { ...target },
          metadata: {
            fuelConsumed: fuelCost,
            fireStartTurn,
            fireEndTurn,
          },
        },
        visibility: {
          scope: "limited",
          playerIds: collectFireObserverIds(
            match.playerCharacters,
            participant.playerId,
            target
          ),
        },
      };
      events.push(event);
      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }
    }
    return events;
  }
}

const createFireAction = new CreateFireAction();

export function executeCreateFireAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return createFireAction.execute(participants, match);
}
