import {
  ActionLibrary,
  type ActionId,
  type Axial
} from "@shared";
import type Phaser from "phaser";
import { ExtraExecutionSelector } from "../ExtraExecutionSelector";
import { GridSelect, type GridSelectItem } from "../GridSelect";
import { ItemPrioritySelector } from "../ItemPrioritySelector";
import { LocationSelector } from "../LocationSelector";
import { PlayerSelector } from "../PlayerSelector";

export type MainActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  secondTargetLocation: Axial | null;
  targetPlayerIds?: string[];
  secondTargetPlayerId?: string | null;
  targetItemIds?: string[];
  extraExecutions?: number;
};

export type SecondaryActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerIds?: string[];
  targetItemIds?: string[];
  extraExecutions?: number;
  prioritizeFoodDrink?: boolean;
  singleTarget?: boolean;
  inspectAdditionalTarget?: boolean;
  sellInstead?: boolean;
};

export interface MainActionPlanSnapshot {
  actionId: string | null;
  targetLocation: Axial | null;
  secondTargetLocation: Axial | null;
  targetPlayerId: string | null;
  secondTargetPlayerId: string | null;
  targetItemIds: string[];
  extraExecutions: number;
  supportsLocation: boolean;
  supportsSecondLocation: boolean;
  supportsPlayer: boolean;
  supportsItems: boolean;
  supportsExtra: boolean;
  secondTargetPlayerIsPistolTarget: boolean;
  secondTargetPlayerIsScareTarget: boolean;
}

export interface SecondaryActionPlanSnapshot {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerId: string | null;
  secondTargetPlayerId: string | null;
  targetItemIds: string[];
  extraExecutions: number;
  prioritizeFoodDrink: boolean;
  singleTarget: boolean;
  sellInstead: boolean;
  supportsLocation: boolean;
  supportsPlayer: boolean;
  supportsItems: boolean;
  supportsExtra: boolean;
  hasAdditionalTarget: boolean;
}

export function buildMainActionSelection(
  state: MainActionPlanSnapshot
): MainActionSelection {
  return {
    actionId: state.actionId,
    targetLocation:
      state.supportsLocation && state.targetLocation
        ? { q: state.targetLocation.q, r: state.targetLocation.r }
        : null,
    secondTargetLocation:
      state.supportsSecondLocation && state.secondTargetLocation
        ? {
            q: state.secondTargetLocation.q,
            r: state.secondTargetLocation.r
          }
        : null,
    targetPlayerIds: state.supportsPlayer
      ? [
          state.targetPlayerId,
          state.secondTargetPlayerIsScareTarget
            ? state.secondTargetPlayerId
            : null
        ].filter((id): id is string => id !== null)
      : undefined,
    secondTargetPlayerId: state.secondTargetPlayerIsPistolTarget
      ? state.secondTargetPlayerId ?? undefined
      : undefined,
    targetItemIds: state.supportsItems ? [...state.targetItemIds] : undefined,
    extraExecutions: state.supportsExtra ? state.extraExecutions : undefined
  };
}

export function buildSecondaryActionSelection(
  state: SecondaryActionPlanSnapshot,
  options: { includeSellInstead?: boolean; includeTargetItems?: boolean } = {}
): SecondaryActionSelection {
  return {
    actionId: state.actionId,
    prioritizeFoodDrink: state.actionId === "search" && state.prioritizeFoodDrink,
    ...(options.includeSellInstead !== false
      ? { sellInstead: state.actionId === "drop" && state.sellInstead }
      : {}),
    singleTarget:
      state.actionId === "use_chemical_weapon" ? state.singleTarget : undefined,
    inspectAdditionalTarget:
      state.actionId === "inspect" && state.hasAdditionalTarget,
    targetLocation:
      state.supportsLocation && state.targetLocation
        ? { q: state.targetLocation.q, r: state.targetLocation.r }
        : null,
    targetPlayerIds: state.supportsPlayer
      ? [
          state.targetPlayerId,
          state.hasAdditionalTarget ? state.secondTargetPlayerId : null
        ].filter((id): id is string => id !== null)
      : undefined,
    ...(options.includeTargetItems === false
      ? {}
      : {
          targetItemIds: state.supportsItems
            ? [...state.targetItemIds]
            : undefined
        }),
    extraExecutions: state.supportsExtra ? state.extraExecutions : undefined
  };
}

export function buildExtraSecondaryActionSelection(
  state: SecondaryActionPlanSnapshot,
  options: { includeToggles?: boolean; includeTargetLists?: boolean } = {}
): SecondaryActionSelection {
  const includeToggles = options.includeToggles !== false;
  const includeTargetLists = options.includeTargetLists !== false;
  return {
    actionId: state.actionId,
    ...(includeToggles
      ? {
          prioritizeFoodDrink:
            state.actionId === "search" && state.prioritizeFoodDrink,
          sellInstead: state.actionId === "drop" && state.sellInstead,
          singleTarget:
            state.actionId === "use_chemical_weapon"
              ? state.singleTarget
              : undefined
        }
      : {}),
    targetLocation:
      state.supportsLocation && state.targetLocation
        ? { q: state.targetLocation.q, r: state.targetLocation.r }
        : null,
    ...(includeTargetLists
      ? {
          targetPlayerIds: state.supportsPlayer
            ? state.targetPlayerId
              ? [state.targetPlayerId]
              : []
            : undefined,
          targetItemIds: state.supportsItems
            ? [...state.targetItemIds]
            : undefined
        }
      : {}),
    extraExecutions: state.supportsExtra ? state.extraExecutions : undefined
  };
}

export function actionSupportsLocation(item: GridSelectItem | null): boolean {
  return item?.tags?.includes("Ranged") ?? false;
}

export function actionSupportsSingleTarget(
  item: GridSelectItem | null
): boolean {
  return item?.tags?.includes("SingleTarget") ?? false;
}

export function actionSupportsTargetItems(
  item: GridSelectItem | null,
  actionId: string | null,
  canSteal: boolean
): boolean {
  return actionId === "steal"
    ? canSteal
    : (item?.tags?.includes("TargetItems") ?? false);
}

export function actionSupportsExtraExecution(actionId: string | null): boolean {
  if (!actionId) {
    return false;
  }
  return Boolean(ActionLibrary[actionId as ActionId]?.extraExecution);
}

export interface ActionPlanBlockLayout {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  dropdown: GridSelect;
  extraExecutionSelector: ExtraExecutionSelector | null;
  locationSelector: LocationSelector;
  secondLocationSelector: LocationSelector | null;
  playerSelector: PlayerSelector;
  itemSelector: ItemPrioritySelector;
  searchPriorityToggle: Phaser.GameObjects.Text | null;
  chemicalTargetToggle?: Phaser.GameObjects.Text | null;
  dropSellToggle?: Phaser.GameObjects.Text | null;
  additionalPlayerSelector?: PlayerSelector | null;
  additionalTargetToggle?: Phaser.GameObjects.Text | null;
}

export function layoutActionPlan(options: {
  width: number;
  scrollContent: Phaser.GameObjects.Container;
  scrollPanel: { layout?: () => void } | null;
  main: ActionPlanBlockLayout;
  secondary: ActionPlanBlockLayout;
  extraSecondary: ActionPlanBlockLayout;
  hasExtraSecondary: boolean;
}): void {
  if (!options.scrollPanel || options.width <= 0) {
    return;
  }
  const padding = 12;
  let cursorY = 0;
  const layoutBlock = (block: ActionPlanBlockLayout): void => {
    const {
      box,
      label,
      dropdown,
      extraExecutionSelector,
      locationSelector,
      secondLocationSelector,
      playerSelector,
      itemSelector,
      searchPriorityToggle,
      chemicalTargetToggle,
      dropSellToggle,
      additionalPlayerSelector,
      additionalTargetToggle
    } = block;
    box.setPosition(0, cursorY);
    box.setSize(options.width, 180);
    box.setDisplaySize(options.width, 180);
    label.setPosition(padding, cursorY + 12);
    dropdown.setPosition(padding, cursorY + 48);
    dropdown.setDisplayWidth(options.width - padding * 2);
    let innerCursor = cursorY + 48 + dropdown.height + 12;
    if (extraExecutionSelector) {
      extraExecutionSelector.setSelectorWidth(options.width - padding * 2);
      extraExecutionSelector.setPosition(padding, innerCursor);
      if (extraExecutionSelector.visible) {
        innerCursor += extraExecutionSelector.height + 8;
      }
    }
    locationSelector.setSelectorWidth(options.width - padding * 2);
    locationSelector.setPosition(padding, innerCursor);
    if (locationSelector.visible) {
      innerCursor += locationSelector.height + 8;
    }
    if (secondLocationSelector) {
      secondLocationSelector.setSelectorWidth(options.width - padding * 2);
      secondLocationSelector.setPosition(padding, innerCursor);
      if (secondLocationSelector.visible) {
        innerCursor += secondLocationSelector.height + 8;
      }
    }
    if (chemicalTargetToggle) {
      chemicalTargetToggle.setPosition(padding, innerCursor);
      if (chemicalTargetToggle.visible) {
        innerCursor += chemicalTargetToggle.height + 8;
      }
    }
    playerSelector.setSelectorWidth(options.width - padding * 2);
    playerSelector.setPosition(padding, innerCursor);
    if (playerSelector.visible) {
      innerCursor += playerSelector.height + 8;
    }
    if (additionalTargetToggle) {
      additionalTargetToggle.setPosition(padding, innerCursor);
      if (additionalTargetToggle.visible) {
        innerCursor += additionalTargetToggle.height + 8;
      }
    }
    if (additionalPlayerSelector) {
      additionalPlayerSelector.setSelectorWidth(options.width - padding * 2);
      additionalPlayerSelector.setPosition(padding, innerCursor);
      if (additionalPlayerSelector.visible) {
        innerCursor += additionalPlayerSelector.height + 8;
      }
    }
    itemSelector.setSelectorWidth(options.width - padding * 2);
    itemSelector.setPosition(padding, innerCursor);
    if (itemSelector.visible) {
      innerCursor += itemSelector.height + 8;
    }
    if (searchPriorityToggle) {
      searchPriorityToggle.setPosition(padding, innerCursor);
      if (searchPriorityToggle.visible) {
        innerCursor += searchPriorityToggle.height + 8;
      }
    }
    if (dropSellToggle) {
      dropSellToggle.setPosition(padding, innerCursor);
      if (dropSellToggle.visible) {
        innerCursor += dropSellToggle.height + 8;
      }
    }
    const blockHeight = Math.max(180, innerCursor - cursorY + 16);
    box.setSize(options.width, blockHeight);
    box.setDisplaySize(options.width, blockHeight);
    cursorY += blockHeight;
  };

  layoutBlock(options.main);
  cursorY += 16;
  layoutBlock(options.secondary);
  cursorY += 16;
  if (options.hasExtraSecondary) {
    options.extraSecondary.box.setVisible(true);
    options.extraSecondary.label.setVisible(true);
    layoutBlock(options.extraSecondary);
    cursorY += 16;
  } else {
    options.extraSecondary.box.setVisible(false);
    options.extraSecondary.label.setVisible(false);
    options.extraSecondary.dropdown.setVisible(false);
  }
  options.scrollContent.setPosition(0, 0);
  options.scrollContent.setSize(options.width, cursorY);
  options.scrollPanel.layout?.();
}
