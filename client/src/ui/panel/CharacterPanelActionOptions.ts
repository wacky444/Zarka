import {
  ActionCategory,
  ActionLibrary,
  type ActionDefinition,
  type ActionId,
  type MatchRecord,
  type PlayerCharacter,
  getActionEnergyDiscount
} from "@shared";
import { getMissingRequirement } from "../ActionRequirementWarnings";
import { deriveBoardIconKey, isBoardIconTexture } from "../actionIcons";
import type { GridSelectItem } from "../GridSelect";
import { t } from "../../services/i18n";

function compareActionIdsByOrder(a: ActionId, b: ActionId): number {
  const actionA = ActionLibrary[a];
  const actionB = ActionLibrary[b];
  return (
    (actionA?.actionOrder ?? Number.MAX_SAFE_INTEGER) -
      (actionB?.actionOrder ?? Number.MAX_SAFE_INTEGER) ||
    (actionA?.actionSubOrder ?? Number.MAX_SAFE_INTEGER) -
      (actionB?.actionSubOrder ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
}

function sortActionIdsByOrder(ids: Iterable<ActionId>): ActionId[] {
  return Array.from(new Set(ids)).sort(compareActionIdsByOrder);
}

export const PRIMARY_ACTION_IDS: ActionId[] = sortActionIdsByOrder(
  Object.values(ActionLibrary)
    .filter(
      (definition) =>
        definition.category === ActionCategory.Primary && !definition.hidden
    )
    .map((definition) => definition.id)
);

export const SECONDARY_ACTION_IDS: ActionId[] = sortActionIdsByOrder(
  Object.values(ActionLibrary)
    .filter(
      (definition) =>
        definition.category === ActionCategory.Secondary && !definition.hidden
    )
    .map((definition) => definition.id)
);

export interface CharacterPanelActionOptionsContext {
  character: PlayerCharacter | null;
  match: MatchRecord | null;
  currentTurn: number;
  allowedMainActionIds: ReadonlySet<ActionId> | null;
  allowedSecondaryActionIds: ReadonlySet<ActionId> | null;
}

export function collectMainActions(character: PlayerCharacter): ActionId[] {
  const ids = new Set<ActionId>();
  const plan = character.actionPlan;
  if (plan?.main?.actionId) ids.add(plan.main.actionId as ActionId);
  if (plan?.nextMain?.actionId) ids.add(plan.nextMain.actionId as ActionId);
  return Array.from(ids);
}

export function collectSecondaryActions(
  character: PlayerCharacter | null
): ActionId[] {
  if (!character) {
    return [];
  }
  const ids = new Set<ActionId>();
  const plan = character.actionPlan;
  if (plan?.secondary?.actionId) ids.add(plan.secondary.actionId as ActionId);
  if (plan?.extraSecondary?.actionId) {
    ids.add(plan.extraSecondary.actionId as ActionId);
  }
  return Array.from(ids);
}

export function buildActionCooldownMap(
  character: PlayerCharacter | null,
  currentTurn: number
): Map<string, number> {
  const cooldowns = new Map<string, number>();
  for (const entry of character?.statuses?.cooldowns ?? []) {
    if (!entry || typeof entry.actionId !== "string") {
      continue;
    }
    const availableOnTurn =
      typeof entry.availableOnTurn === "number"
        ? entry.availableOnTurn
        : currentTurn + 1 + Math.max(0, entry.remainingTurns);
    const remaining = Math.max(
      0,
      Math.ceil(availableOnTurn - (currentTurn + 1))
    );
    if (remaining > 0) {
      cooldowns.set(
        entry.actionId,
        Math.max(cooldowns.get(entry.actionId) ?? 0, remaining)
      );
    }
  }
  return cooldowns;
}

export function buildMainActionItems(
  actionIds: ActionId[],
  context: CharacterPanelActionOptionsContext
): GridSelectItem[] {
  const available = context.allowedMainActionIds;
  const baseList = PRIMARY_ACTION_IDS.filter(
    (id) => available === null || available.has(id)
  );
  const availableActions = actionIds.filter(
    (id) => available === null || available.has(id)
  );
  const sourceIds = sortActionIdsByOrder(
    availableActions.length > 0
      ? [...availableActions, ...baseList]
      : baseList
  );
  const cooldowns = buildActionCooldownMap(
    context.character,
    context.currentTurn
  );
  return sourceIds.map((id) =>
    resolveActionMetadata(id, cooldowns.get(id) ?? 0, context)
  );
}

export function buildSecondaryActionItems(
  actionIds: ActionId[],
  context: CharacterPanelActionOptionsContext,
  disabledActionId?: string | null,
  disabledReason?: string
): GridSelectItem[] {
  const available = context.allowedSecondaryActionIds;
  const baseList = SECONDARY_ACTION_IDS.filter(
    (id) => available === null || available.has(id)
  );
  const availableActions = actionIds.filter(
    (id) => available === null || available.has(id)
  );
  const sourceIds = sortActionIdsByOrder(
    availableActions.length > 0
      ? [...availableActions, ...baseList]
      : baseList
  );
  const cooldowns = buildActionCooldownMap(
    context.character,
    context.currentTurn
  );
  return sourceIds.map((id) =>
    resolveActionMetadata(
      id,
      cooldowns.get(id) ?? 0,
      context,
      Boolean(disabledActionId && id === disabledActionId),
      disabledReason
    )
  );
}

export function formatActionName(id: string): string {
  const spaced = id.replace(/[_-]+/g, " ");
  return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
}

export function describeAction(definition: ActionDefinition): string {
  const parts: string[] = [];
  if (definition.requirements?.length) {
    const descriptions = definition.requirements
      .map((requirement) => requirement.description)
      .filter((description): description is string =>
        Boolean(description && description.trim().length > 0)
      );
    if (descriptions.length > 0) {
      parts.push(descriptions.join("\n"));
    }
  }
  if (definition.effects?.length) {
    const descriptions = definition.effects
      .map((effect) => effect.description)
      .filter((description): description is string =>
        Boolean(description && description.trim().length > 0)
      );
    if (descriptions.length > 0) {
      parts.push(descriptions.join("\n"));
    }
  }
  if (parts.length > 0) {
    return parts.join("\n\n");
  }
  if (definition.notes?.length) {
    return definition.notes[0];
  }
  return "Description coming soon.";
}

export function resolveActionTexture(definition: ActionDefinition): {
  texture: string;
  frame?: string;
} {
  if (isBoardIconTexture(definition.texture) && definition.frame) {
    return { texture: deriveBoardIconKey(definition.frame) };
  }
  return { texture: definition.texture, frame: definition.frame };
}

function resolveActionMetadata(
  actionId: ActionId,
  cooldownRemaining: number,
  context: CharacterPanelActionOptionsContext,
  disabledByOtherSlot = false,
  disabledReason?: string
): GridSelectItem {
  const normalizedRemaining = Math.max(0, Math.ceil(cooldownRemaining));
  let disabled = normalizedRemaining > 0 || disabledByOtherSlot;
  const definition = ActionLibrary[actionId] ?? null;
  if (definition) {
    const visual = resolveActionTexture(definition);
    const developed = definition.developed === true;
    if (!developed) {
      disabled = true;
    }
    let description = developed
      ? describeAction(definition)
      : `${describeAction(definition)}\n\n(${t("Not available in this build.")})`;
    if (disabledByOtherSlot && disabledReason) {
      description = `${description}\n\n(${disabledReason}.)`;
    }
    const discount = context.character
      ? getActionEnergyDiscount(context.character, definition.id)
      : 0;
    return {
      id: definition.id,
      name: definition.name,
      description,
      texture: visual.texture,
      frame: visual.frame,
      tags: definition.tags,
      energyCost: Math.max(0, definition.energyCost - discount),
      cooldownRemaining: normalizedRemaining,
      missingRequirement: developed
        ? getMissingRequirement(
            definition,
            context.character,
            context.match?.map
          )
        : null,
      disabled
    };
  }
  let description = "Description coming soon.";
  if (disabledByOtherSlot && disabledReason) {
    description = `${description}\n\n(${disabledReason}.)`;
  }
  return {
    id: actionId,
    name: formatActionName(actionId),
    description,
    texture: "hex",
    frame: "grass_01.png",
    cooldownRemaining: normalizedRemaining,
    disabled
  };
}
