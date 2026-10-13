import {
  ActionLibrary,
  ItemLibrary,
  MANIPULATE_RECIPES,
  type ItemId
} from "@shared";
import { t } from "../services/i18n";

function resolveItemName(value: unknown): string | null {
  if (typeof value !== "string" || !ItemLibrary[value as ItemId]) {
    return null;
  }
  return t(ItemLibrary[value as ItemId].name);
}

function formatResultingItems(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): string[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const item = entry as { itemId?: unknown; quantity?: unknown };
    const name = resolveItemName(item.itemId);
    if (
      !name ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return [];
    }
    return [`${name} ×${item.quantity}`];
  });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function formatCraftingReplayLine(
  actor: string,
  metadata: unknown
): string | null {
  const craftedItemId =
    metadata && typeof metadata === "object"
      ? (metadata as { craftedItemId?: unknown }).craftedItemId
      : undefined;
  const itemName = resolveItemName(craftedItemId);
  return itemName ? `${actor} ${t("crafted")} ${itemName}` : null;
}

export function formatCraftingFailureLine(
  actor: string,
  metadata: unknown
): string | null {
  const record = readRecord(metadata);
  if (
    record?.attemptedActionId !== "fabricate" ||
    typeof record.reason !== "string"
  ) {
    return null;
  }
  const itemName = resolveItemName(record.craftedItemId) ?? t("selected item");
  const reason =
    record.reason === "location_skill_requirement"
      ? t("requires Workshop or Dexterity 4")
      : record.reason === "inventory_capacity"
        ? t("inventory is full")
        : t("invalid product selection");
  return `${actor} ${t("failed to use")} ${t(ActionLibrary.fabricate.name)} (${reason}: ${itemName})`;
}

export function formatManipulateReplayLine(
  actor: string,
  metadata: unknown
): string | null {
  const container = readRecord(metadata) ?? {};
  const mode = container.mode;
  const recipeId = container.recipeId;
  if (
    (mode !== "combine" && mode !== "separate") ||
    typeof recipeId !== "string"
  ) {
    return null;
  }
  const recipe = MANIPULATE_RECIPES.find((entry) => entry.id === recipeId);
  if (!recipe) {
    return null;
  }
  const itemName = resolveItemName(recipe.outputs[0].itemId);
  if (!itemName) {
    return null;
  }
  const results = formatResultingItems(container.resultingItems);
  return mode === "combine"
    ? `${actor} ${t("combined")} ${results.join(", ") || itemName}`
    : `${actor} ${t("separated")} ${itemName}${
        results.length > 0 ? `; ${t("returned")}: ${results.join(", ")}` : ""
      }`;
}

export function formatManipulateFailureLine(
  actor: string,
  metadata: unknown
): string | null {
  const record = readRecord(metadata);
  if (
    record?.attemptedActionId !== "manipulate" ||
    (record.mode !== "combine" && record.mode !== "separate") ||
    typeof record.recipeId !== "string"
  ) {
    return null;
  }
  const recipe = MANIPULATE_RECIPES.find(
    (entry) => entry.id === record.recipeId
  );
  if (!recipe) {
    return null;
  }
  const itemName = resolveItemName(recipe.outputs[0].itemId);
  if (!itemName) {
    return null;
  }
  const reason =
    record.reason === "missing_items"
      ? t("missing required items")
      : record.reason === "inventory_capacity"
        ? t("inventory is full")
        : t("invalid recipe selection");
  const modeName = t(record.mode === "combine" ? "Combine" : "Separate");
  return `${actor} ${t("failed to use")} ${modeName} ${itemName} (${reason})`;
}
