import {
  ActionLibrary,
  MANIPULATE_RECIPES,
  SEPARATE_RECIPES,
  isManipulateRecipeId
} from "@shared";
import type {
  ManipulateOperationSelection,
  ReplayPlayerEvent,
  RecipeComponent
} from "@shared";
import type { MatchRecord } from "../../models/types";
import { deductEnergyFromCharacter, getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";
import type { PlannedActionParticipant } from "./utils";
import { createFailedActionEvent } from "./utils";
import { applyInventoryTransform } from "./itemTransform";

interface ResolvedOperation {
  selection: ManipulateOperationSelection;
  inputs: readonly RecipeComponent[];
  outputs: readonly RecipeComponent[];
}

function resolveOperation(value: unknown): ResolvedOperation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const operation = value as Record<string, unknown>;
  if (
    Object.keys(operation).some(
      (key) => key !== "mode" && key !== "recipeId"
    ) ||
    (operation.mode !== "combine" && operation.mode !== "separate") ||
    !isManipulateRecipeId(operation.recipeId)
  ) {
    return null;
  }
  const recipe = MANIPULATE_RECIPES.find(
    (candidate) => candidate.id === operation.recipeId
  );
  if (!recipe) {
    return null;
  }
  const parts =
    operation.mode === "combine"
      ? recipe
      : SEPARATE_RECIPES.find((candidate) => candidate.id === recipe.id);
  if (!parts) {
    return null;
  }
  return {
    selection: {
      mode: operation.mode,
      recipeId: operation.recipeId
    },
    inputs: parts.inputs,
    outputs: parts.outputs
  };
}

export class ManipulateAction extends BaseAction {
  protected override readonly shouldShuffleParticipants = false;

  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    const definition = ActionLibrary.manipulate;
    for (const participant of roster) {
      const operations: unknown = participant.plan.manipulateOperations;
      if (
        !Array.isArray(operations) ||
        operations.length < 1 ||
        operations.length > 4
      ) {
        events.push(
          createFailedActionEvent(participant, definition.id, {
            reason: "invalid_selection"
          })
        );
        this.clearPlan(participant);
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const requestedExtraExecutions = Math.max(
        0,
        Math.floor(participant.plan.extraExecutions ?? 0)
      );
      if (operations.length !== 1 + requestedExtraExecutions) {
        events.push(
          createFailedActionEvent(participant, definition.id, {
            reason: "invalid_selection"
          })
        );
        this.clearPlan(participant);
        match.playerCharacters![participant.playerId] = participant.character;
        continue;
      }

      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        definition,
        false
      );
      const operationLimit = Math.min(operations.length, 1 + extraExecutions);
      for (let index = 0; index < operationLimit; index += 1) {
        const operation = resolveOperation(operations[index]);
        if (!operation) {
          const invalid = operations[index] as {
            mode?: unknown;
            recipeId?: unknown;
          } | null;
          events.push(
            createFailedActionEvent(participant, definition.id, {
              reason: "invalid_selection",
              operationIndex: index,
              ...(invalid?.mode === "combine" || invalid?.mode === "separate"
                ? { mode: invalid.mode }
                : {}),
              ...(typeof invalid?.recipeId === "string"
                ? { recipeId: invalid.recipeId }
                : {})
            })
          );
          break;
        }
        if (index > 0) {
          deductEnergyFromCharacter(
            participant.character,
            definition.extraExecution?.cost ?? 1
          );
        }
        const failure = applyInventoryTransform(
          participant.character,
          operation.inputs,
          operation.outputs
        );
        if (failure) {
          events.push(
            createFailedActionEvent(participant, definition.id, {
              reason:
                failure === "missing_items"
                  ? "missing_items"
                  : "inventory_capacity",
              mode: operation.selection.mode,
              recipeId: operation.selection.recipeId,
              operationIndex: index
            })
          );
          break;
        }

        const coord = participant.character.position?.coord;
        events.push({
          kind: "player",
          actorId: participant.playerId,
          action: {
            actionId: definition.id,
            ...(coord ? { originLocation: { ...coord } } : {}),
            ...(coord ? { targetLocation: { ...coord } } : {}),
            metadata: {
              mode: operation.selection.mode,
              recipeId: operation.selection.recipeId,
              outcome: "success",
              operationIndex: index,
              resultingItems: operation.outputs.map((item) => ({ ...item }))
            }
          }
        });
      }

      this.clearPlan(participant);
      match.playerCharacters![participant.playerId] = participant.character;
    }
    return events;
  }
}

const manipulateAction = new ManipulateAction();

export function executeManipulateAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return manipulateAction.execute(participants, match);
}
