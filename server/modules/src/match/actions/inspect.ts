import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayPlayerEvent,
} from "@shared";
import { ActionLibrary } from "@shared";
import type { MatchRecord } from "../../models/types";
import { getUsableExtraExecutions } from "../../utils/energy";
import { collectTargets } from "./targeting";
import { type PlannedActionParticipant } from "./utils";
import { BaseAction } from "./classes/BaseAction";

const ITEMS_PER_INSPECTION = 3;

type RevealedItems = {
  newlyRevealed: string[];
  known: string[];
};

function shuffle<T>(values: T[]): T[] {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }
  return result;
}

function getCarriedItemTypes(character: PlayerCharacter): string[] {
  const types: string[] = [];
  const carriedItems = Array.isArray(character.inventory?.carriedItems)
    ? character.inventory.carriedItems
    : [];
  for (const item of carriedItems) {
    if (
      !item ||
      typeof item.itemId !== "string" ||
      item.itemId.length === 0 ||
      typeof item.quantity !== "number" ||
      item.quantity <= 0 ||
      types.indexOf(item.itemId) !== -1
    ) {
      continue;
    }
    types.push(item.itemId);
  }
  return types;
}

function revealItems(
  inspector: PlayerCharacter,
  targetId: string,
  target: PlayerCharacter,
  limit: number,
): RevealedItems {
  if (!inspector.revealedItemTypesByPlayerId) {
    inspector.revealedItemTypesByPlayerId = {};
  }
  const existing = inspector.revealedItemTypesByPlayerId[targetId] ?? [];
  const knownLookup: Record<string, true> = {};
  for (const itemType of existing) {
    if (typeof itemType === "string" && itemType.length > 0) {
      knownLookup[itemType] = true;
    }
  }

  const carriedTypes = getCarriedItemTypes(target);
  const unknownTypes = shuffle(
    carriedTypes.filter(
      (itemType) => !Object.prototype.hasOwnProperty.call(knownLookup, itemType),
    ),
  );
  const newlyRevealed = unknownTypes.slice(0, Math.max(0, limit));
  const updated = existing.slice();
  for (const itemType of newlyRevealed) {
    if (updated.indexOf(itemType) === -1) {
      updated.push(itemType);
    }
  }
  inspector.revealedItemTypesByPlayerId[targetId] = updated;
  return { newlyRevealed, known: carriedTypes };
}

export class InspectAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord,
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      const definition = ActionLibrary[actionId];
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        definition,
      );
      const itemLimit = ITEMS_PER_INSPECTION * (1 + extraExecutions);
      const targets = collectTargets(actionId, participant, match, {
        allowMultiple: false,
        includeSelf: true,
      });
      const target = targets[0];
      let newlyRevealed: string[] = [];
      let targetItemTypes: string[] = [];
      if (target) {
        const revealed = revealItems(
          participant.character,
          target.id,
          target.character,
          itemLimit,
        );
        newlyRevealed = revealed.newlyRevealed;
        targetItemTypes = revealed.known;
      }

      this.clearPlan(participant);
      if (match.playerCharacters) {
        match.playerCharacters[participant.playerId] = participant.character;
      }

      const metadata: Record<string, unknown> = {
        extraExecutions,
        revealedItemTypes: newlyRevealed,
        revealedCount: newlyRevealed.length,
      };
      if (target) {
        metadata.targetPlayerId = target.id;
        metadata.carriedItemTypes = targetItemTypes;
      }
      const action: ReplayActionDone = {
        actionId,
        originLocation: participant.character.position?.coord,
        targetLocation: target?.coord,
        metadata,
      };
      const event: ReplayPlayerEvent = {
        kind: "player",
        actorId: participant.playerId,
        action,
      };
      if (target) {
        event.targets = [
          {
            targetId: target.id,
            metadata: {
              revealedItemTypes: newlyRevealed,
              revealedCount: newlyRevealed.length,
            },
          },
        ];
      }
      events.push(event);
    }
    return events;
  }
}

const inspectAction = new InspectAction();

export function executeInspectAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord,
): ReplayPlayerEvent[] {
  return inspectAction.execute(participants, match);
}
