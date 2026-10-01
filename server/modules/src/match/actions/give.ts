import {
  ActionLibrary,
  ItemLibrary,
  syncBandolierLoadCapacity,
  type ActionId,
  type ItemId,
  type PlayerCharacter,
  type ReplayPlayerEvent,
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { getUsableExtraExecutions } from "../../utils/energy";
import { isCharacterDead } from "../../utils/playerCharacter";
import { BaseAction } from "./classes/BaseAction";
import {
  createFailedActionEvent,
  type PlannedActionParticipant,
} from "./utils";

function resolveItemWeight(itemType: ItemId): number {
  const weight = ItemLibrary[itemType]?.weight;
  return typeof weight === "number" && Number.isFinite(weight)
    ? Math.max(0, weight)
    : 0;
}

function adjustLoad(character: PlayerCharacter, delta: number): void {
  const load = character.stats?.load;
  if (!load || delta === 0) {
    return;
  }
  const current =
    typeof load.current === "number" && Number.isFinite(load.current)
      ? load.current
      : 0;
  load.current = Math.max(0, current + delta);
}

function removeItem(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): boolean {
  const carriedItems = character.inventory?.carriedItems;
  if (!Array.isArray(carriedItems)) {
    return false;
  }
  const index = carriedItems.findIndex((item) => item.itemId === itemType);
  if (index < 0) {
    return false;
  }
  const stack = carriedItems[index];
  const quantity =
    typeof stack.quantity === "number" && Number.isFinite(stack.quantity)
      ? Math.max(0, Math.floor(stack.quantity))
      : 0;
  if (quantity <= 1) {
    carriedItems.splice(index, 1);
  } else {
    stack.quantity = quantity - 1;
    const stackWeight =
      typeof stack.weight === "number" && Number.isFinite(stack.weight)
        ? Math.max(0, stack.weight)
        : weight * quantity;
    stack.weight = Math.max(0, stackWeight - weight);
  }
  adjustLoad(character, -weight);
  return true;
}

function addItem(
  character: PlayerCharacter,
  itemType: ItemId,
  weight: number
): void {
  character.inventory ??= { carriedItems: [] };
  if (!Array.isArray(character.inventory.carriedItems)) {
    character.inventory.carriedItems = [];
  }
  const stack = character.inventory.carriedItems.find(
    (item) => item.itemId === itemType
  );
  if (stack) {
    stack.quantity =
      typeof stack.quantity === "number" && Number.isFinite(stack.quantity)
        ? Math.max(0, Math.floor(stack.quantity)) + 1
        : 1;
    stack.weight =
      typeof stack.weight === "number" && Number.isFinite(stack.weight)
        ? Math.max(0, stack.weight) + weight
        : weight;
  } else {
    character.inventory.carriedItems.push({
      itemId: itemType,
      quantity: 1,
      weight,
    });
  }
  adjustLoad(character, weight);
}

function findRecipient(
  participant: PlannedActionParticipant,
  match: MatchRecord
): PlayerCharacter | undefined {
  const coord = participant.character.position?.coord;
  if (!coord) {
    return undefined;
  }
  const candidates = Object.values(match.playerCharacters ?? {}).filter(
    (character) =>
      character.id !== participant.playerId &&
      !isCharacterDead(character) &&
      character.position?.coord?.q === coord.q &&
      character.position?.coord?.r === coord.r
  );
  if (candidates.length === 0) {
    return undefined;
  }
  const requestedIds = participant.plan.targetPlayerIds ?? [];
  const requestedRecipient = candidates.find((character) =>
    requestedIds.includes(character.id)
  );
  if (requestedRecipient) {
    return requestedRecipient;
  }
  const randomIndex = Math.min(
    candidates.length - 1,
    Math.floor(Math.random() * candidates.length)
  );
  return candidates[randomIndex];
}

function selectItemsToGive(
  character: PlayerCharacter,
  priorities: string[],
  limit: number
): ItemId[] {
  const carriedItems = character.inventory?.carriedItems;
  if (!Array.isArray(carriedItems)) {
    return [];
  }
  const counts: Record<string, number> = {};
  for (const stack of carriedItems) {
    if (
      !stack ||
      typeof stack.itemId !== "string" ||
      !ItemLibrary[stack.itemId as ItemId] ||
      typeof stack.quantity !== "number" ||
      !Number.isFinite(stack.quantity)
    ) {
      continue;
    }
    counts[stack.itemId] =
      (counts[stack.itemId] ?? 0) + Math.max(0, Math.floor(stack.quantity));
  }

  const selected: ItemId[] = [];
  for (const itemId of priorities) {
    while (selected.length < limit && (counts[itemId] ?? 0) > 0) {
      selected.push(itemId as ItemId);
      counts[itemId] -= 1;
    }
    if (selected.length >= limit) {
      return selected;
    }
  }
  for (const stack of carriedItems) {
    const itemId = stack?.itemId;
    if (typeof itemId !== "string") {
      continue;
    }
    while (selected.length < limit && (counts[itemId] ?? 0) > 0) {
      selected.push(itemId as ItemId);
      counts[itemId] -= 1;
    }
    if (selected.length >= limit) {
      break;
    }
  }
  return selected;
}

export class GiveAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      const recipient = findRecipient(participant, match);
      if (!recipient) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, actionId, {
            reason: "invalid_target",
          })
        );
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const itemPriorities = participant.plan.targetItemIds ?? [];
      if (
        selectItemsToGive(participant.character, itemPriorities, 1).length === 0
      ) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, actionId, {
            reason: "missing_item",
          })
        );
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const definition = ActionLibrary[actionId];
      const affordableExtra = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        definition,
        false
      );
      const selectedItems = selectItemsToGive(
        participant.character,
        itemPriorities,
        1 + affordableExtra
      );
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        {
          ...participant.plan,
          extraExecutions: Math.min(
            affordableExtra,
            selectedItems.length - 1
          ),
        },
        definition
      );
      const itemsToGive = selectedItems.slice(0, 1 + extraExecutions);
      if (itemsToGive.length === 0) {
        this.clearPlan(participant);
        events.push(
          createFailedActionEvent(participant, actionId, {
            reason: "missing_item",
          })
        );
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const givenItems: Array<{ itemType: ItemId }> = [];
      for (const itemType of itemsToGive) {
        const weight = resolveItemWeight(itemType);
        if (!removeItem(participant.character, itemType, weight)) {
          continue;
        }
        addItem(recipient, itemType, weight);
        givenItems.push({ itemType });
      }

      syncBandolierLoadCapacity(participant.character);
      syncBandolierLoadCapacity(recipient);
      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
      match.playerCharacters![recipient.id] = recipient;

      const coord = participant.character.position?.coord;
      events.push({
        kind: "player",
        actorId: participant.playerId,
        action: {
          actionId,
          ...(coord ? { originLocation: { ...coord } } : {}),
          ...(recipient.position?.coord
            ? { targetLocation: { ...recipient.position.coord } }
            : {}),
          metadata: {
            targetPlayerId: recipient.id,
            givenItems,
            extraExecutions,
          },
        },
        targets: [
          {
            targetId: recipient.id,
            metadata: { givenItems },
          },
        ],
      });
    }
    return events;
  }
}

const giveAction = new GiveAction();

export function executeGiveAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return giveAction.execute(participants, match);
}
