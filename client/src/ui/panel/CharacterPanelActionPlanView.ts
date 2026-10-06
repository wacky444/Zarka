import Phaser from "phaser";
import {
  ActionLibrary,
  MAX_PICKUP_NONE_PRIORITY_ENTRIES,
  MAX_STEAL_PRIORITY_ITEMS,
  PICKUP_NONE_PRIORITY_ID,
  type ActionId,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  type TutorialStepId,
  getActionEnergyDiscount,
  getSkillEffectTotal
} from "@shared";
import { GridSelect, type GridSelectItem } from "../GridSelect";
import { LocationSelector } from "../LocationSelector";
import { ExtraExecutionSelector } from "../ExtraExecutionSelector";
import { THEME } from "../ColorPalette";
import { PlayerSelector, type PlayerOption } from "../PlayerSelector";
import {
  ItemPrioritySelector,
  type ItemPriorityOption
} from "../ItemPrioritySelector";
import { getTutorialUiPolicy } from "../../tutorial/TutorialUiPolicy";
import { t } from "../../services/i18n";
import {
  buildMainActionItems,
  buildSecondaryActionItems,
  collectMainActions,
  collectSecondaryActions,
  type CharacterPanelActionOptionsContext
} from "./CharacterPanelActionOptions";
import { buildPlayerTargetOptionSets } from "./CharacterPanelPlayerOptions";
import {
  isSameAxial,
  isSameTargetItems,
  normalizeAxial,
  normalizePlayerId,
  shouldSyncMainActionWithServer,
  shouldSyncSecondaryActionWithServer
} from "./CharacterPanelActionSync";

export type MainActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  secondTargetLocation: Axial | null;
  targetPlayerIds?: string[];
  secondTargetPlayerId?: string | null;
  targetItemIds?: string[];
  secondTargetItemIds?: string[];
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
  secondTargetItemIds: string[];
  extraExecutions: number;
  supportsLocation: boolean;
  supportsSecondLocation: boolean;
  supportsPlayer: boolean;
  supportsItems: boolean;
  supportsSecondItems: boolean;
  supportsExtra: boolean;
  secondTargetPlayerIsPistolTarget: boolean;
  secondTargetPlayerIsScareTarget: boolean;
  secondTargetPlayerIsStealTarget: boolean;
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
    secondTargetPlayerId:
      state.secondTargetPlayerIsPistolTarget ||
      state.secondTargetPlayerIsStealTarget
        ? state.secondTargetPlayerId ?? undefined
        : undefined,
    targetItemIds: state.supportsItems ? [...state.targetItemIds] : undefined,
    secondTargetItemIds: state.supportsSecondItems
      ? [...state.secondTargetItemIds]
      : undefined,
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

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  mouseWheelScrollerEnable?: boolean;
  setScrollerEnable?: (enabled: boolean) => void;
  scrollerEnable?: boolean;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
  setVisible?: (visible: boolean) => Phaser.GameObjects.GameObject;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
};

export interface CharacterPanelActionPlanViewConfig {
  margin: number;
  scrollTop: number;
  width: number;
  height: number;
  worldTransform: { tx: number; ty: number };
}

export interface ActionPlanUpdateContext {
  character: PlayerCharacter | null;
  match: MatchRecord | null;
  currentTurn: number;
  currentUserId: string | null;
  playerOptions: PlayerOption[];
  itemOptions: ItemPriorityOption[];
  stealItemOptions: ItemPriorityOption[];
  inventoryItemOptions: ItemPriorityOption[];
  tutorialStepId: TutorialStepId | null;
  tutorialActive: boolean;
  tutorialAllowedMainActionIds: ReadonlySet<ActionId> | null;
  tutorialAllowedSecondaryActionIds: ReadonlySet<ActionId> | null;
  tutorialActionEditingEnabled: boolean;
}

const BOX_HEIGHT = 180;

export class CharacterPanelActionPlanView extends Phaser.Events.EventEmitter {
  private readonly scene: Phaser.Scene;
  private readonly parent: Phaser.GameObjects.Container;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private readonly scrollMaskShape: Phaser.GameObjects.Rectangle;
  private readonly scrollMask: Phaser.Display.Masks.GeometryMask;

  private scrollContentWidth = 0;
  private scrollTop = 0;
  private margin = 16;

  private readonly mainActionBox: Phaser.GameObjects.Rectangle;
  private readonly mainActionLabel: Phaser.GameObjects.Text;
  private readonly mainActionDropdown: GridSelect;
  private mainActionDropdownWidth: number;
  private readonly extraExecutionSelector: ExtraExecutionSelector;
  private readonly locationSelector: LocationSelector;
  private readonly secondLocationSelector: LocationSelector;
  private readonly playerSelector: PlayerSelector;
  private readonly scareSecondPlayerSelector: PlayerSelector;
  private readonly itemSelector: ItemPrioritySelector;
  private readonly secondStealItemSelector: ItemPrioritySelector;

  private readonly secondaryActionBox: Phaser.GameObjects.Rectangle;
  private readonly secondaryActionLabel: Phaser.GameObjects.Text;
  private readonly secondaryActionDropdown: GridSelect;
  private secondaryActionDropdownWidth: number;
  private readonly secondaryExtraExecutionSelector: ExtraExecutionSelector;
  private readonly secondaryLocationSelector: LocationSelector;
  private readonly secondaryPlayerSelector: PlayerSelector;
  private readonly secondaryInspectAdditionalTargetToggle: Phaser.GameObjects.Text;
  private readonly secondaryInspectSecondPlayerSelector: PlayerSelector;
  private readonly secondaryItemSelector: ItemPrioritySelector;
  private readonly secondarySearchPriorityToggle: Phaser.GameObjects.Text;
  private readonly secondaryDropSellToggle: Phaser.GameObjects.Text;
  private readonly secondaryChemicalTargetToggle: Phaser.GameObjects.Text;

  private readonly extraSecondaryActionBox: Phaser.GameObjects.Rectangle;
  private readonly extraSecondaryActionLabel: Phaser.GameObjects.Text;
  private readonly extraSecondaryActionDropdown: GridSelect;
  private extraSecondaryActionDropdownWidth: number;
  private readonly extraSecondaryExtraExecutionSelector: ExtraExecutionSelector;
  private readonly extraSecondaryLocationSelector: LocationSelector;
  private readonly extraSecondaryPlayerSelector: PlayerSelector;
  private readonly extraSecondaryItemSelector: ItemPrioritySelector;
  private readonly extraSecondarySearchPriorityToggle: Phaser.GameObjects.Text;
  private readonly extraSecondaryDropSellToggle: Phaser.GameObjects.Text;
  private readonly extraSecondaryChemicalTargetToggle: Phaser.GameObjects.Text;

  private mainActionSelection: string | null = null;
  private secondaryActionSelection: string | null = null;
  private extraSecondaryActionSelection: string | null = null;
  private mainExtraExecutions = 0;
  private secondaryExtraExecutions = 0;
  private extraSecondaryExtraExecutions = 0;
  private mainActionTarget: Axial | null = null;
  private mainActionSecondTarget: Axial | null = null;
  private secondaryActionTarget: Axial | null = null;
  private extraSecondaryActionTarget: Axial | null = null;
  private mainActionTargetPlayerId: string | null = null;
  private scareSecondTargetPlayerId: string | null = null;
  private secondaryActionTargetPlayerId: string | null = null;
  private secondaryInspectAdditionalTarget = false;
  private secondaryInspectSecondTargetPlayerId: string | null = null;
  private extraSecondaryActionTargetPlayerId: string | null = null;
  private mainActionPriorityItems: string[] = [];
  private secondStealPriorityItems: string[] = [];
  private secondaryActionPriorityItems: string[] = [];
  private secondaryPrioritizeFoodDrink = false;
  private secondaryChemicalSingleTarget = false;
  private secondarySellInstead = false;
  private extraSecondaryActionPriorityItems: string[] = [];
  private extraSecondaryPrioritizeFoodDrink = false;
  private extraSecondaryChemicalSingleTarget = false;
  private extraSecondarySellInstead = false;
  private lastMainActionItem: GridSelectItem | null = null;
  private lastSecondaryActionItem: GridSelectItem | null = null;
  private lastExtraSecondaryActionItem: GridSelectItem | null = null;

  private currentMatch: MatchRecord | null = null;
  private currentUserId: string | null = null;
  private currentCharacter: PlayerCharacter | null = null;
  private currentTurn = 0;
  private playerOptions: PlayerOption[] = [];
  private mainPlayerOptions: PlayerOption[] = [];
  private secondaryPlayerOptions: PlayerOption[] = [];
  private extraSecondaryPlayerOptions: PlayerOption[] = [];
  private itemOptions: ItemPriorityOption[] = [];
  private stealItemOptions: ItemPriorityOption[] = [];
  private inventoryItemOptions: ItemPriorityOption[] = [];
  private tutorialAllowedMainActionIds: ReadonlySet<ActionId> | null = null;
  private tutorialAllowedSecondaryActionIds: ReadonlySet<ActionId> | null = null;
  private tutorialActionEditingEnabled = true;
  private tutorialActive = false;
  private tutorialStepId: TutorialStepId | null = null;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    config: CharacterPanelActionPlanViewConfig
  ) {
    super();
    this.scene = scene;
    this.parent = parent;
    this.margin = config.margin;
    this.scrollTop = config.scrollTop;
    this.scrollContentWidth = config.width;

    this.scrollContent = scene.add.container(0, 0);

    const worldX = config.worldTransform.tx + config.margin;
    const worldY = config.worldTransform.ty + config.scrollTop;

    this.scrollMaskShape = scene.add
      .rectangle(worldX, worldY, config.width + 100, config.height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.scrollMask = this.scrollMaskShape.createGeometryMask();

    const rexUi = (scene as unknown as { rexUI: { add: { scrollablePanel: (opts: unknown) => ScrollablePanelInstance } } }).rexUI;
    this.scrollPanel = rexUi.add.scrollablePanel({
      x: config.margin,
      y: config.scrollTop,
      width: config.width,
      height: config.height,
      scrollMode: 0,
      panel: {
        child: this.scrollContent,
        mask: false
      },
      slider: false,
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: {
        focus: 2,
        speed: 0.35
      },
      space: { left: 0, right: 0, top: 0, bottom: 0 }
    });
    this.scrollPanel?.setOrigin?.(0, 0);
    this.scrollPanel?.setScrollFactor?.(0);

    const rawScrollPanel = this.scrollPanel as unknown as {
      childrenMap?: {
        scrollableBlock?: { setScrollFactor?: (x: number, y?: number) => void; scrollFactorX?: number; scrollFactorY?: number };
        child?: { setScrollFactor?: (x: number, y?: number) => void; scrollFactorX?: number; scrollFactorY?: number };
      };
    };
    if (rawScrollPanel?.childrenMap?.scrollableBlock) {
      rawScrollPanel.childrenMap.scrollableBlock.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorX = 0;
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorY = 0;
    }
    if (rawScrollPanel?.childrenMap?.child) {
      rawScrollPanel.childrenMap.child.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.child.scrollFactorX = 0;
      rawScrollPanel.childrenMap.child.scrollFactorY = 0;
    }
    this.scrollContent.setScrollFactor(0);
    if (this.scrollMask) {
      this.scrollPanel.setMask?.(this.scrollMask);
    }
    parent.add(this.scrollPanel);

    const boxWidth = config.width;
    this.mainActionBox = scene.add
      .rectangle(0, 0, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.scrollContent.add(this.mainActionBox);
    this.mainActionLabel = scene.add
      .text(0, 0, "Main Action", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    this.scrollContent.add(this.mainActionLabel);
    this.mainActionDropdownWidth = boxWidth - 24;
    this.mainActionDropdown = new GridSelect(scene, 0, 0, {
      width: this.mainActionDropdownWidth,
      title: "Select Main Action",
      placeholder: "Choose action",
      emptyLabel: "Unknown",
      columns: 3,
      cellHeight: 260,
      mobileCellIcons: true
    });
    this.scrollContent.add(this.mainActionDropdown);
    this.mainActionDropdown.on("change", this.handleMainActionSelection);
    this.mainActionDropdown.on("modal-open", this.handleModalOpen);
    this.mainActionDropdown.on("modal-close", this.handleModalClose);

    this.extraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.extraExecutionSelector.setEnabled(false);
    this.extraExecutionSelector.setVisible(false);
    this.extraExecutionSelector.setActive(false);
    this.extraExecutionSelector.on("change", this.handleMainExtraExecutionChange);
    this.scrollContent.add(this.extraExecutionSelector);

    this.locationSelector = new LocationSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.locationSelector.setEnabled(false);
    this.locationSelector.setVisible(false);
    this.locationSelector.setActive(false);
    this.locationSelector.on("pick-request", () => this.emit("main-action-location-request"));
    this.locationSelector.on("clear-request", () => this.setMainActionTarget(null, true));
    this.scrollContent.add(this.locationSelector);

    this.secondLocationSelector = new LocationSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.secondLocationSelector.setLabel(t("Second Shot Destination"));
    this.secondLocationSelector.setEnabled(false);
    this.secondLocationSelector.setVisible(false);
    this.secondLocationSelector.setActive(false);
    this.secondLocationSelector.on("pick-request", () => this.emit("main-action-second-location-request"));
    this.secondLocationSelector.on("clear-request", () => this.setMainActionSecondTarget(null, true));
    this.scrollContent.add(this.secondLocationSelector);

    this.playerSelector = new PlayerSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.playerSelector.setEnabled(false);
    this.playerSelector.setVisible(false);
    this.playerSelector.setActive(false);
    this.playerSelector.on("change", (playerId: string | null) => this.setMainActionTargetPlayer(playerId ?? null, true));
    this.playerSelector.on("modal-open", this.handleModalOpen);
    this.playerSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.playerSelector);

    this.scareSecondPlayerSelector = new PlayerSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.scareSecondPlayerSelector.setLabel(t("Second Target Player"));
    this.scareSecondPlayerSelector.setEnabled(false);
    this.scareSecondPlayerSelector.setVisible(false);
    this.scareSecondPlayerSelector.setActive(false);
    this.scareSecondPlayerSelector.on("change", (playerId: string | null) => this.setScareSecondTargetPlayer(playerId ?? null, true));
    this.scareSecondPlayerSelector.on("modal-open", this.handleModalOpen);
    this.scareSecondPlayerSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.scareSecondPlayerSelector);

    this.itemSelector = new ItemPrioritySelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.itemSelector.setEnabled(false);
    this.itemSelector.setVisible(false);
    this.itemSelector.setActive(false);
    this.itemSelector.on("change", (itemIds: string[]) => this.setMainActionPriorityItems(itemIds ?? [], true));
    this.itemSelector.on("modal-open", this.handleModalOpen);
    this.itemSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.itemSelector);

    this.secondStealItemSelector = new ItemPrioritySelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.secondStealItemSelector.setLabel("Second Steal Item Priorities");
    this.secondStealItemSelector.setMaxEntries(MAX_STEAL_PRIORITY_ITEMS);
    this.secondStealItemSelector.setEnabled(false);
    this.secondStealItemSelector.setVisible(false);
    this.secondStealItemSelector.setActive(false);
    this.secondStealItemSelector.on("change", (itemIds: string[]) =>
      this.setSecondStealPriorityItems(itemIds ?? [], true)
    );
    this.secondStealItemSelector.on("modal-open", this.handleModalOpen);
    this.secondStealItemSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.secondStealItemSelector);

    this.secondaryActionBox = scene.add
      .rectangle(0, 0, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.scrollContent.add(this.secondaryActionBox);
    this.secondaryActionLabel = scene.add
      .text(0, 0, "Secondary Action", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    this.scrollContent.add(this.secondaryActionLabel);
    this.secondaryActionDropdownWidth = boxWidth - 24;
    this.secondaryActionDropdown = new GridSelect(scene, 0, 0, {
      width: this.secondaryActionDropdownWidth,
      title: "Select Secondary Action",
      placeholder: "Choose action",
      emptyLabel: "Unknown",
      columns: 3,
      cellHeight: 260,
      includeEmptyOption: true,
      emptyOptionLabel: "No secondary action",
      emptyOptionDescription: "Removes the planned secondary action.",
      mobileCellIcons: true
    });
    this.scrollContent.add(this.secondaryActionDropdown);
    this.secondaryActionDropdown.on("change", this.handleSecondaryActionSelection);
    this.secondaryActionDropdown.on("modal-open", this.handleModalOpen);
    this.secondaryActionDropdown.on("modal-close", this.handleModalClose);

    this.secondaryExtraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryExtraExecutionSelector.setEnabled(false);
    this.secondaryExtraExecutionSelector.setVisible(false);
    this.secondaryExtraExecutionSelector.setActive(false);
    this.secondaryExtraExecutionSelector.on("change", this.handleSecondaryExtraExecutionChange);
    this.scrollContent.add(this.secondaryExtraExecutionSelector);

    this.secondaryLocationSelector = new LocationSelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryLocationSelector.setEnabled(false);
    this.secondaryLocationSelector.setVisible(false);
    this.secondaryLocationSelector.setActive(false);
    this.secondaryLocationSelector.on("pick-request", () => this.emit("secondary-action-location-request"));
    this.secondaryLocationSelector.on("clear-request", () => this.setSecondaryActionTarget(null, true));
    this.scrollContent.add(this.secondaryLocationSelector);

    this.secondaryPlayerSelector = new PlayerSelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryPlayerSelector.setEnabled(false);
    this.secondaryPlayerSelector.setVisible(false);
    this.secondaryPlayerSelector.setActive(false);
    this.secondaryPlayerSelector.on("change", (playerId: string | null) => this.setSecondaryActionTargetPlayer(playerId ?? null, true));
    this.secondaryPlayerSelector.on("modal-open", this.handleModalOpen);
    this.secondaryPlayerSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.secondaryPlayerSelector);

    this.secondaryInspectAdditionalTargetToggle = scene.add
      .text(0, 0, "[ ] Inspect another player", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondaryInspectAdditionalTargetToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryInspectAdditionalTargetToggle
    );
    this.scrollContent.add(this.secondaryInspectAdditionalTargetToggle);

    this.secondaryInspectSecondPlayerSelector = new PlayerSelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryInspectSecondPlayerSelector.setLabel("Additional inspected player");
    this.secondaryInspectSecondPlayerSelector.setEnabled(false);
    this.secondaryInspectSecondPlayerSelector.setVisible(false);
    this.secondaryInspectSecondPlayerSelector.setActive(false);
    this.secondaryInspectSecondPlayerSelector.on("change", (playerId: string | null) => this.setSecondaryInspectSecondTargetPlayer(playerId ?? null, true));
    this.secondaryInspectSecondPlayerSelector.on("modal-open", this.handleModalOpen);
    this.secondaryInspectSecondPlayerSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.secondaryInspectSecondPlayerSelector);

    this.secondaryItemSelector = new ItemPrioritySelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryItemSelector.setEnabled(false);
    this.secondaryItemSelector.setVisible(false);
    this.secondaryItemSelector.setActive(false);
    this.secondaryItemSelector.on("change", (itemIds: string[]) => this.setSecondaryActionPriorityItems(itemIds ?? [], true));
    this.secondaryItemSelector.on("modal-open", this.handleModalOpen);
    this.secondaryItemSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.secondaryItemSelector);

    this.secondarySearchPriorityToggle = scene.add
      .text(0, 0, "[ ] Prioritize food/drink", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondarySearchPriorityToggle.on(Phaser.Input.Events.POINTER_UP, this.handleSecondarySearchPriorityToggle);
    this.scrollContent.add(this.secondarySearchPriorityToggle);

    this.secondaryDropSellToggle = scene.add
      .text(0, 0, "[ ] Sell instead", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondaryDropSellToggle.on(Phaser.Input.Events.POINTER_UP, this.handleSecondaryDropSellToggle);
    this.scrollContent.add(this.secondaryDropSellToggle);

    this.secondaryChemicalTargetToggle = scene.add
      .text(0, 0, "[ ] Single target (Area)", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondaryChemicalTargetToggle.on(Phaser.Input.Events.POINTER_UP, this.handleSecondaryChemicalTargetToggle);
    this.scrollContent.add(this.secondaryChemicalTargetToggle);

    this.extraSecondaryActionBox = scene.add
      .rectangle(0, 0, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.scrollContent.add(this.extraSecondaryActionBox);
    this.extraSecondaryActionLabel = scene.add
      .text(0, 0, "Extra Secondary Action", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    this.scrollContent.add(this.extraSecondaryActionLabel);
    this.extraSecondaryActionDropdownWidth = boxWidth - 24;
    this.extraSecondaryActionDropdown = new GridSelect(scene, 0, 0, {
      width: this.extraSecondaryActionDropdownWidth,
      title: "Select Extra Secondary Action",
      placeholder: "Choose action",
      emptyLabel: "Unknown",
      columns: 3,
      cellHeight: 260,
      includeEmptyOption: true,
      emptyOptionLabel: "No extra secondary action",
      emptyOptionDescription: "Removes the extra secondary action.",
      mobileCellIcons: true
    });
    this.extraSecondaryActionDropdown.setVisible(false);
    this.scrollContent.add(this.extraSecondaryActionDropdown);
    this.extraSecondaryActionDropdown.on("change", this.handleExtraSecondaryActionSelection);
    this.extraSecondaryActionDropdown.on("modal-open", this.handleModalOpen);
    this.extraSecondaryActionDropdown.on("modal-close", this.handleModalClose);

    this.extraSecondaryExtraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.extraSecondaryActionDropdownWidth
    );
    this.extraSecondaryExtraExecutionSelector.setEnabled(false);
    this.extraSecondaryExtraExecutionSelector.setVisible(false);
    this.extraSecondaryExtraExecutionSelector.setActive(false);
    this.extraSecondaryExtraExecutionSelector.on("change", this.handleExtraSecondaryExtraExecutionChange);
    this.scrollContent.add(this.extraSecondaryExtraExecutionSelector);

    this.extraSecondaryLocationSelector = new LocationSelector(
      scene,
      0,
      0,
      this.extraSecondaryActionDropdownWidth
    );
    this.extraSecondaryLocationSelector.setEnabled(false);
    this.extraSecondaryLocationSelector.setVisible(false);
    this.extraSecondaryLocationSelector.setActive(false);
    this.extraSecondaryLocationSelector.on("pick-request", () => this.emit("extra-secondary-action-location-request"));
    this.extraSecondaryLocationSelector.on("clear-request", () => this.setExtraSecondaryActionTarget(null, true));
    this.scrollContent.add(this.extraSecondaryLocationSelector);

    this.extraSecondaryPlayerSelector = new PlayerSelector(
      scene,
      0,
      0,
      this.extraSecondaryActionDropdownWidth
    );
    this.extraSecondaryPlayerSelector.setEnabled(false);
    this.extraSecondaryPlayerSelector.setVisible(false);
    this.extraSecondaryPlayerSelector.setActive(false);
    this.extraSecondaryPlayerSelector.on("change", (playerId: string | null) => this.setExtraSecondaryActionTargetPlayer(playerId ?? null, true));
    this.extraSecondaryPlayerSelector.on("modal-open", this.handleModalOpen);
    this.extraSecondaryPlayerSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.extraSecondaryPlayerSelector);

    this.extraSecondaryItemSelector = new ItemPrioritySelector(
      scene,
      0,
      0,
      this.extraSecondaryActionDropdownWidth
    );
    this.extraSecondaryItemSelector.setEnabled(false);
    this.extraSecondaryItemSelector.setVisible(false);
    this.extraSecondaryItemSelector.setActive(false);
    this.extraSecondaryItemSelector.on("change", (itemIds: string[]) => this.setExtraSecondaryActionPriorityItems(itemIds ?? [], true));
    this.extraSecondaryItemSelector.on("modal-open", this.handleModalOpen);
    this.extraSecondaryItemSelector.on("modal-close", this.handleModalClose);
    this.scrollContent.add(this.extraSecondaryItemSelector);

    this.extraSecondarySearchPriorityToggle = scene.add
      .text(0, 0, "[ ] Prioritize food/drink", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondarySearchPriorityToggle.on(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondarySearchPriorityToggle);
    this.scrollContent.add(this.extraSecondarySearchPriorityToggle);

    this.extraSecondaryDropSellToggle = scene.add
      .text(0, 0, "[ ] Sell instead", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondaryDropSellToggle.on(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondaryDropSellToggle);
    this.scrollContent.add(this.extraSecondaryDropSellToggle);

    this.extraSecondaryChemicalTargetToggle = scene.add
      .text(0, 0, "[ ] Single target (Area)", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondaryChemicalTargetToggle.on(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondaryChemicalTargetToggle);
    this.scrollContent.add(this.extraSecondaryChemicalTargetToggle);

    this.updateScrollLayout();
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.scrollPanel ? [this.scrollPanel] : [];
  }

  bringElementsToTop(): void {
    this.parent.bringToTop(this.mainActionDropdown);
    this.parent.bringToTop(this.locationSelector);
    this.parent.bringToTop(this.secondLocationSelector);
    this.parent.bringToTop(this.playerSelector);
    this.parent.bringToTop(this.scareSecondPlayerSelector);
    this.parent.bringToTop(this.itemSelector);
    this.parent.bringToTop(this.secondStealItemSelector);
    this.parent.bringToTop(this.secondaryActionDropdown);
    this.parent.bringToTop(this.secondaryLocationSelector);
    this.parent.bringToTop(this.secondaryPlayerSelector);
    this.parent.bringToTop(this.secondaryInspectAdditionalTargetToggle);
    this.parent.bringToTop(this.secondaryInspectSecondPlayerSelector);
    this.parent.bringToTop(this.extraSecondaryActionDropdown);
    this.parent.bringToTop(this.extraSecondaryLocationSelector);
    this.parent.bringToTop(this.extraSecondaryPlayerSelector);
  }

  updateScrollMaskPosition(worldTransform: { tx: number; ty: number }): void {
    if (!this.scrollMaskShape) {
      return;
    }
    this.scrollMaskShape.setPosition(
      worldTransform.tx + this.margin,
      worldTransform.ty + this.scrollTop
    );
  }

  layout(options: {
    margin: number;
    scrollTop: number;
    scrollWidth: number;
    scrollHeight: number;
    worldTransform: { tx: number; ty: number };
  }): void {
    this.margin = options.margin;
    this.scrollTop = options.scrollTop;
    this.scrollContentWidth = options.scrollWidth;

    this.mainActionDropdownWidth = Math.max(0, options.scrollWidth - 24);
    this.secondaryActionDropdownWidth = Math.max(0, options.scrollWidth - 24);
    this.extraSecondaryActionDropdownWidth = Math.max(0, options.scrollWidth - 24);

    if (this.scrollMaskShape) {
      this.scrollMaskShape.setPosition(
        options.worldTransform.tx + options.margin,
        options.worldTransform.ty + options.scrollTop
      );
      this.scrollMaskShape.setSize(options.scrollWidth + 100, options.scrollHeight);
    }
    if (this.scrollPanel) {
      this.scrollPanel.setPosition?.(options.margin, options.scrollTop);
      this.scrollPanel.setSize?.(options.scrollWidth, options.scrollHeight);
      this.scrollPanel.setMinSize?.(options.scrollWidth, options.scrollHeight);
    }
    this.updateScrollLayout();
  }

  setVisible(visible: boolean): void {
    this.scrollPanel?.setVisible?.(visible);
    if (!visible) {
      this.locationSelector.setPending(false);
      this.secondLocationSelector.setPending(false);
      this.secondaryLocationSelector.setPending(false);
      this.extraSecondaryLocationSelector.setPending(false);
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
      this.scareSecondPlayerSelector.setPending(false);
      this.scareSecondPlayerSelector.hideDropdown();
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
      this.secondaryInspectSecondPlayerSelector.setPending(false);
      this.secondaryInspectSecondPlayerSelector.hideDropdown();
      this.extraSecondaryPlayerSelector.setPending(false);
      this.extraSecondaryPlayerSelector.hideDropdown();
      this.itemSelector.hideDropdown();
      this.secondStealItemSelector.hideDropdown();
      this.secondaryItemSelector.hideDropdown();
      this.extraSecondaryItemSelector.hideDropdown();
      this.scrollPanel?.setMouseWheelScrollerEnable?.(false);
      this.scrollPanel?.setScrollerEnable?.(false);
    } else {
      this.scrollPanel?.setMouseWheelScrollerEnable?.(true);
      this.scrollPanel?.setScrollerEnable?.(true);
    }
  }

  setActive(active: boolean): void {
    this.scrollPanel?.setActive?.(active);
  }

  setScrollerEnable(enable: boolean): void {
    this.scrollPanel?.setScrollerEnable?.(enable);
    this.scrollPanel?.setMouseWheelScrollerEnable?.(enable);
  }

  updatePlayerOptions(playerOptions: PlayerOption[]): void {
    this.playerOptions = playerOptions;
    this.refreshPlayerOptionsForSelectors();
    this.refreshPlayerSelectorState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryPlayerSelectorState();
  }

  updateItemOptions(
    itemOptions: ItemPriorityOption[],
    stealItemOptions: ItemPriorityOption[],
    inventoryItemOptions: ItemPriorityOption[]
  ): void {
    this.itemOptions = itemOptions;
    this.stealItemOptions = stealItemOptions;
    this.inventoryItemOptions = inventoryItemOptions;
    this.refreshItemSelectorState();
    this.refreshSecondStealItemSelectorState();
    this.refreshSecondaryItemSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
  }

  update(context: ActionPlanUpdateContext): void {
    this.currentMatch = context.match;
    this.currentUserId = context.currentUserId;
    this.currentCharacter = context.character;
    this.currentTurn = context.currentTurn;
    this.playerOptions = context.playerOptions;
    this.itemOptions = context.itemOptions;
    this.stealItemOptions = context.stealItemOptions;
    this.inventoryItemOptions = context.inventoryItemOptions;
    this.tutorialAllowedMainActionIds = context.tutorialAllowedMainActionIds;
    this.tutorialAllowedSecondaryActionIds = context.tutorialAllowedSecondaryActionIds;
    this.tutorialActionEditingEnabled = context.tutorialActionEditingEnabled;
    this.tutorialActive = context.tutorialActive;
    this.tutorialStepId = context.tutorialStepId;

    if (!context.character) {
      this.applyMainActions([], null, null);
      this.applySecondaryActions([], null, null);
      this.applyExtraSecondaryActions([], null, null);
      this.updateScrollLayout();
      return;
    }

    const character = context.character;
    const actions = collectMainActions(character);
    const mainActionId = character.actionPlan?.main?.actionId ?? null;
    const mainExtraExecutions = character.actionPlan?.main?.extraExecutions ?? 0;
    this.applyMainActions(actions, mainActionId, character, mainExtraExecutions);

    const targetLocation = character.actionPlan?.main?.targetLocationId ?? null;
    const normalizedTargetLocation = normalizeAxial(targetLocation);
    this.setMainActionTarget(normalizedTargetLocation, false);
    const normalizedSecondTargetLocation = normalizeAxial(
      character.actionPlan?.main?.secondTargetLocationId ?? null
    );
    this.setMainActionSecondTarget(normalizedSecondTargetLocation, false);

    const targetPlayers = character.actionPlan?.main?.targetPlayerIds ?? null;
    const serverTargetPlayerId = normalizePlayerId(
      Array.isArray(targetPlayers) && targetPlayers.length > 0
        ? targetPlayers[0]
        : null
    );
    this.setMainActionTargetPlayer(serverTargetPlayerId, false);

    const serverSecondTargetPlayerId = normalizePlayerId(
      mainActionId === "shoot_pistol" || mainActionId === "steal"
        ? character.actionPlan?.main?.secondTargetPlayerId
        : Array.isArray(targetPlayers) && targetPlayers.length > 1
          ? targetPlayers[1]
          : null
    );
    this.setScareSecondTargetPlayer(serverSecondTargetPlayerId, false);

    const targetItems = Array.isArray(character.actionPlan?.main?.targetItemIds)
      ? (character.actionPlan?.main?.targetItemIds as string[])
      : [];
    this.setMainActionPriorityItems(targetItems, false);
    const secondTargetItems = Array.isArray(
      character.actionPlan?.main?.secondTargetItemIds
    )
      ? character.actionPlan.main.secondTargetItemIds
      : [];
    this.setSecondStealPriorityItems(secondTargetItems, false);
    this.setMainActionLocationSelectionPending(false);
    this.playerSelector.setPending(false);

    const secondaryActions = collectSecondaryActions(character);
    const hasExtraSecondary = this.hasExtraSecondaryAction();
    const secondaryId = character.actionPlan?.secondary?.actionId ?? null;
    let extraSecondaryId = character.actionPlan?.extraSecondary?.actionId ?? null;
    if (hasExtraSecondary && secondaryId && extraSecondaryId === secondaryId) {
      extraSecondaryId = null;
    }
    this.secondaryPrioritizeFoodDrink =
      character.actionPlan?.secondary?.prioritizeFoodDrink === true;
    this.secondarySellInstead =
      secondaryId === "drop" &&
      character.actionPlan?.secondary?.sellInstead === true;
    this.updateDropSellToggleText(
      this.secondaryDropSellToggle,
      this.secondarySellInstead
    );

    const secondaryTargetPlayers = character.actionPlan?.secondary?.targetPlayerIds ?? null;
    this.secondaryChemicalSingleTarget =
      secondaryId === "use_chemical_weapon" &&
      (character.actionPlan?.secondary?.singleTarget === true ||
        (Array.isArray(secondaryTargetPlayers) && secondaryTargetPlayers.length > 0));
    this.updateChemicalTargetToggleText(
      this.secondaryChemicalTargetToggle,
      this.secondaryChemicalSingleTarget
    );

    const secondaryExtraExecutions = character.actionPlan?.secondary?.extraExecutions ?? 0;
    this.applySecondaryActions(
      secondaryActions,
      secondaryId,
      character,
      secondaryExtraExecutions,
      hasExtraSecondary ? extraSecondaryId : null
    );

    const secondaryTargetLocation = character.actionPlan?.secondary?.targetLocationId ?? null;
    const normalizedSecondaryTargetLocation = normalizeAxial(secondaryTargetLocation);
    this.setSecondaryActionTarget(normalizedSecondaryTargetLocation, false);

    const secondaryServerTargetPlayerId = normalizePlayerId(
      Array.isArray(secondaryTargetPlayers) && secondaryTargetPlayers.length > 0
        ? secondaryTargetPlayers[0]
        : null
    );
    this.setSecondaryActionTargetPlayer(secondaryServerTargetPlayerId, false);

    this.secondaryInspectAdditionalTarget =
      (secondaryId === "inspect" &&
        character.actionPlan?.secondary?.inspectAdditionalTarget === true) ||
      (secondaryId === "place_tracker" &&
        secondaryExtraExecutions > 0 &&
        Array.isArray(secondaryTargetPlayers) &&
        secondaryTargetPlayers.length > 1);

    const secondarySecondTargetPlayerId = normalizePlayerId(
      Array.isArray(secondaryTargetPlayers) && secondaryTargetPlayers.length > 1
        ? secondaryTargetPlayers[1]
        : null
    );
    this.setSecondaryInspectSecondTargetPlayer(secondarySecondTargetPlayerId, false);

    const secondaryTargetItems = Array.isArray(character.actionPlan?.secondary?.targetItemIds)
      ? (character.actionPlan?.secondary?.targetItemIds as string[])
      : [];
    this.setSecondaryActionPriorityItems(secondaryTargetItems, false);
    this.setSecondaryLocationSelectionPending(false);
    this.secondaryPlayerSelector.setPending(false);
    this.refreshSecondaryInspectAdditionalTargetState();

    const extraSecondaryActions = character.actionPlan?.extraSecondary?.actionId
      ? [character.actionPlan.extraSecondary.actionId as ActionId]
      : [];
    this.extraSecondaryPrioritizeFoodDrink =
      character.actionPlan?.extraSecondary?.prioritizeFoodDrink === true;
    this.extraSecondarySellInstead =
      extraSecondaryId === "drop" &&
      character.actionPlan?.extraSecondary?.sellInstead === true;
    this.updateDropSellToggleText(
      this.extraSecondaryDropSellToggle,
      this.extraSecondarySellInstead
    );

    const extraSecondaryTargetPlayers = character.actionPlan?.extraSecondary?.targetPlayerIds ?? null;
    this.extraSecondaryChemicalSingleTarget =
      extraSecondaryId === "use_chemical_weapon" &&
      (character.actionPlan?.extraSecondary?.singleTarget === true ||
        (Array.isArray(extraSecondaryTargetPlayers) && extraSecondaryTargetPlayers.length > 0));
    this.updateChemicalTargetToggleText(
      this.extraSecondaryChemicalTargetToggle,
      this.extraSecondaryChemicalSingleTarget
    );

    const extraSecondaryExtraExecutions = character.actionPlan?.extraSecondary?.extraExecutions ?? 0;
    this.applyExtraSecondaryActions(
      extraSecondaryActions,
      extraSecondaryId,
      character,
      extraSecondaryExtraExecutions,
      secondaryId
    );

    const extraSecondaryTargetLocation = character.actionPlan?.extraSecondary?.targetLocationId ?? null;
    const normalizedExtraSecondaryTargetLocation = normalizeAxial(extraSecondaryTargetLocation);
    this.setExtraSecondaryActionTarget(normalizedExtraSecondaryTargetLocation, false);

    const extraSecondaryServerTargetPlayerId = normalizePlayerId(
      Array.isArray(extraSecondaryTargetPlayers) && extraSecondaryTargetPlayers.length > 0
        ? extraSecondaryTargetPlayers[0]
        : null
    );
    this.setExtraSecondaryActionTargetPlayer(extraSecondaryServerTargetPlayerId, false);

    const extraSecondaryTargetItems = Array.isArray(character.actionPlan?.extraSecondary?.targetItemIds)
      ? (character.actionPlan?.extraSecondary?.targetItemIds as string[])
      : [];
    this.setExtraSecondaryActionPriorityItems(extraSecondaryTargetItems, false);

    this.syncMainActionWithServer(
      mainActionId,
      normalizedTargetLocation,
      normalizedSecondTargetLocation,
      serverTargetPlayerId,
      serverSecondTargetPlayerId,
      targetItems,
      secondTargetItems
    );
    this.syncSecondaryActionWithServer(
      secondaryId,
      normalizedSecondaryTargetLocation,
      secondaryServerTargetPlayerId,
      secondaryTargetItems,
      character.actionPlan?.secondary?.prioritizeFoodDrink === true,
      character.actionPlan?.secondary?.sellInstead === true
    );
    this.syncExtraSecondaryActionWithServer(
      extraSecondaryId,
      normalizedExtraSecondaryTargetLocation,
      extraSecondaryServerTargetPlayerId,
      extraSecondaryTargetItems,
      character.actionPlan?.extraSecondary?.prioritizeFoodDrink === true,
      character.actionPlan?.extraSecondary?.sellInstead === true
    );

    this.updateScrollLayout();
  }

  setTutorialHighlight(stepId: TutorialStepId | null, active: boolean): void {
    if (!stepId || !active) {
      this.mainActionDropdown.setTutorialHighlight(false);
      this.secondaryActionDropdown.setTutorialHighlight(false);
      this.extraExecutionSelector.setTutorialHighlight(false);
      this.playerSelector.setTutorialHighlight(false);
      this.locationSelector.setTutorialHighlight(false);
      return;
    }
    const policy = getTutorialUiPolicy(stepId);
    const isHighlighted = (control: string) => policy.highlightedControls.includes(control as Parameters<typeof policy.highlightedControls.includes>[0]);
    this.mainActionDropdown.setTutorialHighlight(isHighlighted("main_action"));
    this.secondaryActionDropdown.setTutorialHighlight(isHighlighted("secondary_action"));
    this.extraExecutionSelector.setTutorialHighlight(isHighlighted("extra_execution"));
    this.playerSelector.setTutorialHighlight(isHighlighted("player_target"));
    this.locationSelector.setTutorialHighlight(isHighlighted("location_target"));
  }

  syncTutorialActionSelection(
    policy: ReturnType<typeof getTutorialUiPolicy>,
    currentUserId: string | null,
    match: MatchRecord | null
  ): void {
    if (policy.primaryActionIds.length === 1 && currentUserId) {
      const actionId = policy.primaryActionIds[0] ?? null;
      const serverActionId =
        match?.playerCharacters?.[currentUserId]?.actionPlan?.main?.actionId ?? null;
      if (serverActionId !== actionId) {
        this.mainActionDropdown.setValue(actionId, true);
      }
    }
    if (policy.secondaryActionIds.length === 1 && currentUserId) {
      const actionId = policy.secondaryActionIds[0] ?? null;
      const serverActionId =
        match?.playerCharacters?.[currentUserId]?.actionPlan?.secondary?.actionId ?? null;
      if (serverActionId !== actionId) {
        this.secondaryActionDropdown.setValue(actionId, true);
      }
    }
  }

  applyTutorialActionEditingState(): void {
    if (!this.tutorialActive || this.tutorialActionEditingEnabled) {
      return;
    }
    this.closeCurrentGridSelect();
    this.mainActionDropdown.setEnabled(false);
    this.secondaryActionDropdown.setEnabled(false);
    this.extraSecondaryActionDropdown.setEnabled(false);
    this.extraExecutionSelector.setEnabled(false);
    this.secondaryExtraExecutionSelector.setEnabled(false);
    this.extraSecondaryExtraExecutionSelector.setEnabled(false);
    this.locationSelector.setEnabled(false);
    this.secondLocationSelector.setEnabled(false);
    this.playerSelector.setEnabled(false);
    this.scareSecondPlayerSelector.setEnabled(false);
    this.itemSelector.setEnabled(false);
    this.secondStealItemSelector.setEnabled(false);
    this.secondaryLocationSelector.setEnabled(false);
    this.secondaryPlayerSelector.setEnabled(false);
    this.secondaryInspectSecondPlayerSelector.setEnabled(false);
    this.secondaryItemSelector.setEnabled(false);
    this.extraSecondaryLocationSelector.setEnabled(false);
    this.extraSecondaryPlayerSelector.setEnabled(false);
    this.extraSecondaryItemSelector.setEnabled(false);
  }

  closeCurrentGridSelect(): void {
    this.mainActionDropdown.hideModal();
    this.playerSelector.hideDropdown();
    this.scareSecondPlayerSelector.hideDropdown();
    this.itemSelector.hideDropdown();
    this.secondStealItemSelector.hideDropdown();
    this.secondaryActionDropdown.hideModal();
    this.secondaryPlayerSelector.hideDropdown();
    this.secondaryInspectSecondPlayerSelector.hideDropdown();
    this.secondaryItemSelector.hideDropdown();
    this.extraSecondaryActionDropdown.hideModal();
    this.extraSecondaryPlayerSelector.hideDropdown();
    this.extraSecondaryItemSelector.hideDropdown();
  }

  getMainActionSelectionId(): string | null {
    return this.mainActionSelection;
  }

  getSecondaryActionSelectionId(): string | null {
    return this.secondaryActionSelection;
  }

  getExtraSecondaryActionSelectionId(): string | null {
    return this.extraSecondaryActionSelection;
  }

  getMainActionTarget(): Axial | null {
    return this.mainActionTarget;
  }

  getMainExtraExecutions(): number {
    return this.mainExtraExecutions;
  }

  getMainActionSelection(): MainActionSelection {
    return buildMainActionSelection({
      actionId: this.mainActionSelection,
      targetLocation: this.mainActionTarget,
      secondTargetLocation: this.mainActionSecondTarget,
      targetPlayerId: this.mainActionTargetPlayerId,
      secondTargetPlayerId: this.scareSecondTargetPlayerId,
      targetItemIds: this.mainActionPriorityItems,
      secondTargetItemIds: this.secondStealPriorityItems,
      extraExecutions: this.mainExtraExecutions,
      supportsLocation: this.selectedMainActionSupportsLocation(),
      supportsSecondLocation: this.selectedMainActionSupportsSecondLocation(),
      supportsPlayer: this.selectedActionSupportsSingleTarget(),
      supportsItems: this.selectedActionSupportsItemPriority(),
      supportsSecondItems:
        this.mainActionSelection === "steal" &&
        this.hasDexterity2() &&
        this.mainExtraExecutions > 0,
      supportsExtra: this.selectedActionSupportsExtraExecution(),
      secondTargetPlayerIsPistolTarget:
        this.mainActionSelection === "shoot_pistol" && this.mainExtraExecutions > 0,
      secondTargetPlayerIsScareTarget:
        this.mainActionSelection === "scare" && this.mainExtraExecutions > 0,
      secondTargetPlayerIsStealTarget:
        this.mainActionSelection === "steal" && this.mainExtraExecutions > 0
    });
  }

  getSecondaryActionSelection(): SecondaryActionSelection {
    return buildSecondaryActionSelection(
      {
        actionId: this.secondaryActionSelection,
        targetLocation: this.secondaryActionTarget,
        targetPlayerId: this.secondaryActionTargetPlayerId,
        secondTargetPlayerId: this.secondaryInspectSecondTargetPlayerId,
        targetItemIds: this.secondaryActionPriorityItems,
        extraExecutions: this.secondaryExtraExecutions,
        prioritizeFoodDrink: this.secondaryPrioritizeFoodDrink,
        singleTarget: this.secondaryChemicalSingleTarget,
        sellInstead: this.secondarySellInstead,
        supportsLocation: this.selectedSecondaryActionSupportsLocation(),
        supportsPlayer: this.selectedSecondaryActionSupportsSingleTarget(),
        supportsItems: this.selectedSecondaryActionSupportsItemPriority(),
        supportsExtra: this.selectedSecondaryActionSupportsExtraExecution(),
        hasAdditionalTarget: this.secondaryInspectAdditionalTarget
      },
      { includeSellInstead: false }
    );
  }

  getExtraSecondaryActionSelection(): SecondaryActionSelection {
    return buildExtraSecondaryActionSelection(
      {
        actionId: this.extraSecondaryActionSelection,
        targetLocation: this.extraSecondaryActionTarget,
        targetPlayerId: this.extraSecondaryActionTargetPlayerId,
        secondTargetPlayerId: null,
        targetItemIds: this.extraSecondaryActionPriorityItems,
        extraExecutions: this.extraSecondaryExtraExecutions,
        prioritizeFoodDrink: this.extraSecondaryPrioritizeFoodDrink,
        singleTarget: this.extraSecondaryChemicalSingleTarget,
        sellInstead: this.extraSecondarySellInstead,
        supportsLocation: this.selectedExtraSecondaryActionSupportsLocation(),
        supportsPlayer: this.selectedExtraSecondaryActionSupportsSingleTarget(),
        supportsItems: this.selectedExtraSecondaryActionSupportsItemPriority(),
        supportsExtra: this.selectedExtraSecondaryActionSupportsExtraExecution(),
        hasAdditionalTarget: false
      },
      { includeToggles: false, includeTargetLists: false }
    );
  }

  setMainActionTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedMainActionSupportsLocation();
    if (!supports) {
      const changed = this.mainActionTarget !== null;
      if (changed) {
        this.mainActionTarget = null;
        this.emit("ready-refresh-request");
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setPending(false);
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    const normalized = normalizeAxial(target);
    if (isSameAxial(normalized, this.mainActionTarget)) {
      return false;
    }
    this.mainActionTarget = normalized;
    if (
      normalized &&
      this.mainActionSelection === "scare" &&
      this.mainExtraExecutions > 0 &&
      this.scareSecondTargetPlayerId !== null
    ) {
      this.setScareSecondTargetPlayer(null, false);
    }
    this.locationSelector.setValue(
      normalized ? { q: normalized.q, r: normalized.r } : null
    );
    if (!normalized) {
      this.locationSelector.setPending(false);
    }
    this.emit("ready-refresh-request");
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  setMainActionSecondTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedMainActionSupportsSecondLocation();
    if (!supports) {
      const changed = this.mainActionSecondTarget !== null;
      this.mainActionSecondTarget = null;
      this.secondLocationSelector.setValue(null);
      this.secondLocationSelector.setPending(false);
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    const normalized = normalizeAxial(target);
    if (isSameAxial(normalized, this.mainActionSecondTarget)) {
      return false;
    }
    this.mainActionSecondTarget = normalized;
    this.secondLocationSelector.setValue(
      normalized ? { q: normalized.q, r: normalized.r } : null
    );
    if (!normalized) {
      this.secondLocationSelector.setPending(false);
    }
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  setSecondaryActionTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedSecondaryActionSupportsLocation();
    if (!supports) {
      const changed = this.secondaryActionTarget !== null;
      if (changed) {
        this.secondaryActionTarget = null;
      }
      this.secondaryLocationSelector.setValue(null);
      this.secondaryLocationSelector.setPending(false);
      if (emit && changed) {
        this.emitSecondaryActionChange();
      }
      return changed;
    }
    const normalized = normalizeAxial(target);
    if (isSameAxial(normalized, this.secondaryActionTarget)) {
      return false;
    }
    this.secondaryActionTarget = normalized;
    this.secondaryLocationSelector.setValue(
      normalized ? { q: normalized.q, r: normalized.r } : null
    );
    if (!normalized) {
      this.secondaryLocationSelector.setPending(false);
    }
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
  }

  setExtraSecondaryActionTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsLocation();
    if (!supports) {
      const changed = this.extraSecondaryActionTarget !== null;
      if (changed) {
        this.extraSecondaryActionTarget = null;
      }
      this.extraSecondaryLocationSelector.setValue(null);
      this.extraSecondaryLocationSelector.setPending(false);
      if (emit && changed) {
        this.emitExtraSecondaryActionChange();
      }
      return changed;
    }
    const normalized = normalizeAxial(target);
    if (isSameAxial(normalized, this.extraSecondaryActionTarget)) {
      return false;
    }
    this.extraSecondaryActionTarget = normalized;
    this.extraSecondaryLocationSelector.setValue(
      normalized ? { q: normalized.q, r: normalized.r } : null
    );
    if (emit) {
      this.emitExtraSecondaryActionChange();
    }
    return true;
  }

  setMainActionLocationSelectionPending(active: boolean): void {
    if (!this.selectedMainActionSupportsLocation()) {
      this.locationSelector.setPending(false);
      return;
    }
    this.locationSelector.setPending(active);
  }

  setSecondLocationSelectionPending(active: boolean): void {
    if (!this.selectedMainActionSupportsSecondLocation()) {
      this.secondLocationSelector.setPending(false);
      return;
    }
    this.secondLocationSelector.setPending(active);
  }

  setSecondaryLocationSelectionPending(active: boolean): void {
    if (!this.selectedSecondaryActionSupportsLocation()) {
      this.secondaryLocationSelector.setPending(false);
      return;
    }
    this.secondaryLocationSelector.setPending(active);
  }

  setExtraSecondaryLocationSelectionPending(active: boolean): void {
    if (!this.selectedExtraSecondaryActionSupportsLocation()) {
      this.extraSecondaryLocationSelector.setPending(false);
      return;
    }
    this.extraSecondaryLocationSelector.setPending(active);
  }

  destroy(): void {
    this.mainActionDropdown.off("change", this.handleMainActionSelection);
    this.mainActionDropdown.off("modal-open", this.handleModalOpen);
    this.mainActionDropdown.off("modal-close", this.handleModalClose);
    this.secondaryActionDropdown.off("change", this.handleSecondaryActionSelection);
    this.secondaryActionDropdown.off("modal-open", this.handleModalOpen);
    this.secondaryActionDropdown.off("modal-close", this.handleModalClose);
    this.extraSecondaryActionDropdown.off("change", this.handleExtraSecondaryActionSelection);
    this.extraSecondaryActionDropdown.off("modal-open", this.handleModalOpen);
    this.extraSecondaryActionDropdown.off("modal-close", this.handleModalClose);
    this.playerSelector.off("modal-open", this.handleModalOpen);
    this.playerSelector.off("modal-close", this.handleModalClose);
    this.scareSecondPlayerSelector.off("modal-open", this.handleModalOpen);
    this.scareSecondPlayerSelector.off("modal-close", this.handleModalClose);
    this.secondaryPlayerSelector.off("modal-open", this.handleModalOpen);
    this.secondaryPlayerSelector.off("modal-close", this.handleModalClose);
    this.secondaryInspectSecondPlayerSelector.off("modal-open", this.handleModalOpen);
    this.secondaryInspectSecondPlayerSelector.off("modal-close", this.handleModalClose);
    this.extraSecondaryPlayerSelector.off("modal-open", this.handleModalOpen);
    this.extraSecondaryPlayerSelector.off("modal-close", this.handleModalClose);
    this.itemSelector.off("modal-open", this.handleModalOpen);
    this.itemSelector.off("modal-close", this.handleModalClose);
    this.secondStealItemSelector.off("modal-open", this.handleModalOpen);
    this.secondStealItemSelector.off("modal-close", this.handleModalClose);
    this.secondaryItemSelector.off("modal-open", this.handleModalOpen);
    this.secondaryItemSelector.off("modal-close", this.handleModalClose);
    this.extraSecondaryItemSelector.off("modal-open", this.handleModalOpen);
    this.extraSecondaryItemSelector.off("modal-close", this.handleModalClose);
    this.secondaryInspectAdditionalTargetToggle.off(Phaser.Input.Events.POINTER_UP, this.handleSecondaryInspectAdditionalTargetToggle);
    this.secondarySearchPriorityToggle.off(Phaser.Input.Events.POINTER_UP, this.handleSecondarySearchPriorityToggle);
    this.secondaryDropSellToggle.off(Phaser.Input.Events.POINTER_UP, this.handleSecondaryDropSellToggle);
    this.secondaryChemicalTargetToggle.off(Phaser.Input.Events.POINTER_UP, this.handleSecondaryChemicalTargetToggle);
    this.extraSecondarySearchPriorityToggle.off(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondarySearchPriorityToggle);
    this.extraSecondaryDropSellToggle.off(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondaryDropSellToggle);
    this.extraSecondaryChemicalTargetToggle.off(Phaser.Input.Events.POINTER_UP, this.handleExtraSecondaryChemicalTargetToggle);
    this.scrollMask?.destroy();
    this.scrollMaskShape?.destroy();
    this.scrollPanel?.destroy();
    this.removeAllListeners();
  }

  private handleModalOpen = () => {
    this.emit("modal-open");
  };

  private handleModalClose = () => {
    this.emit("modal-close");
  };

  private readonly handleMainExtraExecutionChange = (reps: number) => {
    this.mainExtraExecutions = reps;
    this.refreshPlayerOptionsForSelectors();
    this.refreshLocationSelectorState();
    this.refreshScareSecondPlayerSelectorState();
    this.refreshSecondStealItemSelectorState();
    this.emit("ready-refresh-request");
    this.emitMainActionChange();
  };

  private readonly handleSecondaryExtraExecutionChange = (reps: number) => {
    this.secondaryExtraExecutions = reps;
    this.refreshSecondaryInspectAdditionalTargetState();
    this.emitSecondaryActionChange();
  };

  private readonly handleExtraSecondaryExtraExecutionChange = (reps: number) => {
    this.extraSecondaryExtraExecutions = reps;
    this.emitExtraSecondaryActionChange();
  };

  private readonly handleMainActionSelection = (actionId: string | null) => {
    this.mainActionSelection = actionId ?? null;
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    if (!this.mainActionSelection) {
      this.setMainActionTarget(null, false);
      this.setMainActionSecondTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
      this.setScareSecondTargetPlayer(null, false);
      this.setMainActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshExtraExecutionSelectorState();
    this.refreshLocationSelectorState();
    this.refreshPlayerSelectorState();
    this.refreshScareSecondPlayerSelectorState();
    this.refreshItemSelectorState();
    this.refreshSecondStealItemSelectorState();
    this.emit("ready-refresh-request");
    this.emitMainActionChange();
  };

  private readonly handleSecondaryActionSelection = (actionId: string | null) => {
    this.secondaryActionSelection = actionId ?? null;
    this.lastSecondaryActionItem = this.secondaryActionDropdown.getSelectedItem() ?? null;
    this.secondaryPrioritizeFoodDrink = false;
    this.secondaryChemicalSingleTarget = false;
    this.secondarySellInstead = false;
    this.updateSearchPriorityToggleText(this.secondarySearchPriorityToggle, false);
    this.updateDropSellToggleText(this.secondaryDropSellToggle, false);
    this.updateChemicalTargetToggleText(this.secondaryChemicalTargetToggle, false);
    if (!this.secondaryActionSelection) {
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
      this.setSecondaryInspectSecondTargetPlayer(null, false);
      this.setSecondaryActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshSecondaryExtraExecutionSelectorState();
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshSecondaryInspectAdditionalTargetState();
    this.refreshSecondaryItemSelectorState();
    this.refreshSecondarySearchPriorityState();
    this.refreshSecondaryDropSellState();
    this.refreshSecondaryChemicalTargetState();
    this.refreshSecondaryDropdownItems();
    this.emitSecondaryActionChange();
  };

  private readonly handleExtraSecondaryActionSelection = (actionId: string | null) => {
    this.extraSecondaryActionSelection = actionId ?? null;
    this.lastExtraSecondaryActionItem = this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
    this.extraSecondaryPrioritizeFoodDrink = false;
    this.extraSecondaryChemicalSingleTarget = false;
    this.extraSecondarySellInstead = false;
    this.updateSearchPriorityToggleText(this.extraSecondarySearchPriorityToggle, false);
    this.updateDropSellToggleText(this.extraSecondaryDropSellToggle, false);
    this.updateChemicalTargetToggleText(this.extraSecondaryChemicalTargetToggle, false);
    if (!this.extraSecondaryActionSelection) {
      this.setExtraSecondaryActionTarget(null, false);
      this.setExtraSecondaryActionTargetPlayer(null, false);
      this.setExtraSecondaryActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshExtraSecondaryExecutionSelectorState();
    this.refreshExtraSecondaryLocationSelectorState();
    this.refreshExtraSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
    this.refreshExtraSecondarySearchPriorityState();
    this.refreshExtraSecondaryDropSellState();
    this.refreshExtraSecondaryChemicalTargetState();
    this.refreshSecondaryDropdownItems();
    this.emitExtraSecondaryActionChange();
  };

  private readonly handleSecondaryInspectAdditionalTargetToggle = () => {
    if (!this.supportsSecondaryAdditionalTargetSelection()) {
      return;
    }
    this.secondaryInspectAdditionalTarget = !this.secondaryInspectAdditionalTarget;
    this.updateInspectAdditionalTargetToggleText();
    this.refreshSecondaryInspectSecondPlayerSelectorState();
    this.emitSecondaryActionChange();
  };

  private readonly handleSecondarySearchPriorityToggle = () => {
    if (!this.secondarySearchPriorityToggle.visible) {
      return;
    }
    this.secondaryPrioritizeFoodDrink = !this.secondaryPrioritizeFoodDrink;
    this.updateSearchPriorityToggleText(
      this.secondarySearchPriorityToggle,
      this.secondaryPrioritizeFoodDrink
    );
    this.emitSecondaryActionChange();
  };

  private readonly handleSecondaryDropSellToggle = () => {
    if (!this.secondaryDropSellToggle.visible) {
      return;
    }
    this.secondarySellInstead = !this.secondarySellInstead;
    this.updateDropSellToggleText(
      this.secondaryDropSellToggle,
      this.secondarySellInstead
    );
    this.emitSecondaryActionChange();
  };

  private readonly handleSecondaryChemicalTargetToggle = () => {
    if (!this.secondaryChemicalTargetToggle.visible) {
      return;
    }
    this.secondaryChemicalSingleTarget = !this.secondaryChemicalSingleTarget;
    this.updateChemicalTargetToggleText(
      this.secondaryChemicalTargetToggle,
      this.secondaryChemicalSingleTarget
    );
    this.emitSecondaryActionChange();
  };

  private readonly handleExtraSecondarySearchPriorityToggle = () => {
    if (!this.extraSecondarySearchPriorityToggle.visible) {
      return;
    }
    this.extraSecondaryPrioritizeFoodDrink = !this.extraSecondaryPrioritizeFoodDrink;
    this.updateSearchPriorityToggleText(
      this.extraSecondarySearchPriorityToggle,
      this.extraSecondaryPrioritizeFoodDrink
    );
    this.emitExtraSecondaryActionChange();
  };

  private readonly handleExtraSecondaryDropSellToggle = () => {
    if (!this.extraSecondaryDropSellToggle.visible) {
      return;
    }
    this.extraSecondarySellInstead = !this.extraSecondarySellInstead;
    this.updateDropSellToggleText(
      this.extraSecondaryDropSellToggle,
      this.extraSecondarySellInstead
    );
    this.emitExtraSecondaryActionChange();
  };

  private readonly handleExtraSecondaryChemicalTargetToggle = () => {
    if (!this.extraSecondaryChemicalTargetToggle.visible) {
      return;
    }
    this.extraSecondaryChemicalSingleTarget = !this.extraSecondaryChemicalSingleTarget;
    this.updateChemicalTargetToggleText(
      this.extraSecondaryChemicalTargetToggle,
      this.extraSecondaryChemicalSingleTarget
    );
    this.emitExtraSecondaryActionChange();
  };

  private getActionOptionsContext(
    character: PlayerCharacter | null = this.currentCharacter
  ): CharacterPanelActionOptionsContext {
    return {
      character,
      match: this.currentMatch,
      currentTurn: this.currentTurn,
      allowedMainActionIds: this.tutorialAllowedMainActionIds,
      allowedSecondaryActionIds: this.tutorialAllowedSecondaryActionIds
    };
  }

  private applyMainActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null,
    storedExtraExecutions = 0
  ): void {
    const items = buildMainActionItems(
      actions,
      this.getActionOptionsContext(character)
    );
    this.mainActionDropdown.setItems(items);
    this.mainActionDropdown.setEnabled(
      !this.tutorialActive ||
        (this.tutorialActionEditingEnabled &&
          (this.tutorialAllowedMainActionIds?.size ?? 0) > 0)
    );
    if (preferredId) {
      this.mainActionDropdown.setValue(preferredId, false);
      if (!this.mainActionDropdown.getValue() && items[0]) {
        this.mainActionDropdown.setValue(items[0].id, false);
      }
    } else if (!this.mainActionDropdown.getValue() && items[0]) {
      this.mainActionDropdown.setValue(items[0].id, false);
    }
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    this.mainActionSelection = this.mainActionDropdown.getValue();
    if (!this.mainActionSelection) {
      this.setMainActionTarget(null, false);
      this.setMainActionSecondTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
      this.setScareSecondTargetPlayer(null, false);
    }
    this.refreshExtraExecutionSelectorState(storedExtraExecutions);
    this.refreshPlayerOptionsForSelectors();
    this.refreshLocationSelectorState();
    this.refreshSecondLocationSelectorState();
    this.refreshPlayerSelectorState();
    this.refreshScareSecondPlayerSelectorState();
    this.refreshItemSelectorState();
    this.refreshSecondStealItemSelectorState();
  }

  private applySecondaryActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null,
    storedExtraExecutions = 0,
    excludedActionId: string | null = null
  ): void {
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      excludedActionId
    );
    this.secondaryActionDropdown.setItems(items);
    this.secondaryActionDropdown.setEnabled(
      !this.tutorialActive ||
        (this.tutorialActionEditingEnabled &&
          (this.tutorialAllowedSecondaryActionIds?.size ?? 0) > 0)
    );
    if (preferredId) {
      this.secondaryActionDropdown.setValue(preferredId, false);
    } else {
      this.secondaryActionDropdown.setValue(null, false);
    }
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
    this.secondaryActionSelection = this.secondaryActionDropdown.getValue();
    if (!this.secondaryActionSelection) {
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
      this.setSecondaryInspectSecondTargetPlayer(null, false);
      this.setSecondaryActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshSecondaryExtraExecutionSelectorState(storedExtraExecutions);
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshSecondaryInspectAdditionalTargetState();
    this.refreshSecondaryItemSelectorState();
    this.refreshSecondarySearchPriorityState();
    this.refreshSecondaryDropSellState();
    this.refreshSecondaryChemicalTargetState();
    this.updateScrollLayout();
  }

  private applyExtraSecondaryActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null = this.currentCharacter,
    storedExtraExecutions = 0,
    excludedActionId: string | null = null
  ): void {
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      excludedActionId
    );
    this.extraSecondaryActionDropdown.setItems(items);
    this.extraSecondaryActionDropdown.setEnabled(
      !this.tutorialActive ||
        (this.tutorialActionEditingEnabled &&
          (this.tutorialAllowedSecondaryActionIds?.size ?? 0) > 0)
    );
    if (preferredId) {
      this.extraSecondaryActionDropdown.setValue(preferredId, false);
    } else {
      this.extraSecondaryActionDropdown.setValue(null, false);
    }
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
    this.extraSecondaryActionSelection =
      this.extraSecondaryActionDropdown.getValue();
    if (!this.extraSecondaryActionSelection) {
      this.setExtraSecondaryActionTarget(null, false);
      this.setExtraSecondaryActionTargetPlayer(null, false);
      this.setExtraSecondaryActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshExtraSecondaryExecutionSelectorState(storedExtraExecutions);
    this.refreshExtraSecondaryLocationSelectorState();
    this.refreshExtraSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
    this.refreshExtraSecondarySearchPriorityState();
    this.refreshExtraSecondaryDropSellState();
    this.refreshExtraSecondaryChemicalTargetState();
    this.updateScrollLayout();
  }

  private refreshSecondaryDropdownItems(): void {
    const character = this.currentCharacter;
    if (!character) {
      return;
    }
    const secondaryActions = collectSecondaryActions(character);
    const excludedForSecondary = this.hasExtraSecondaryAction()
      ? this.extraSecondaryActionSelection
      : null;
    this.secondaryActionDropdown.setItems(
      buildSecondaryActionItems(
        secondaryActions,
        this.getActionOptionsContext(character),
        excludedForSecondary
      )
    );
    if (this.hasExtraSecondaryAction()) {
      this.refreshExtraSecondaryDropdownItems();
    }
  }

  private refreshExtraSecondaryDropdownItems(): void {
    const character = this.currentCharacter;
    if (!character) {
      return;
    }
    const secondaryActions = collectSecondaryActions(character);
    this.extraSecondaryActionDropdown.setItems(
      buildSecondaryActionItems(
        secondaryActions,
        this.getActionOptionsContext(character),
        this.secondaryActionSelection
      )
    );
  }

  private getCurrentEnergy(): number {
    return this.currentCharacter?.stats?.energy?.current ?? 0;
  }

  private refreshExtraExecutionSelectorState(initialReps = 0): void {
    const actionId = this.mainActionSelection;
    const definition = actionId
      ? (ActionLibrary[actionId as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const character = this.currentCharacter;
    const supports = Boolean(extraExecution && character);
    this.extraExecutionSelector.setVisible(supports);
    this.extraExecutionSelector.setActive(supports);
    if (!supports || !extraExecution || !character) {
      this.mainExtraExecutions = 0;
      this.extraExecutionSelector.setValue(0);
      this.extraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const discount = getActionEnergyDiscount(character, actionId as ActionId);
    this.extraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy: this.getCurrentEnergy(),
      discount,
      accentColor:
        actionId === "focus"
          ? THEME.colors.healthDamageAccent
          : THEME.colors.energyAccent
    });
    if (initialReps > 0) {
      this.mainExtraExecutions = initialReps;
      this.extraExecutionSelector.setValue(initialReps);
    }
    this.extraExecutionSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshSecondaryExtraExecutionSelectorState(initialReps = 0): void {
    const actionId = this.secondaryActionSelection;
    const definition = actionId
      ? (ActionLibrary[actionId as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const character = this.currentCharacter;
    const supports = Boolean(extraExecution && character);
    this.secondaryExtraExecutionSelector.setVisible(supports);
    this.secondaryExtraExecutionSelector.setActive(supports);
    if (!supports || !extraExecution || !character) {
      this.secondaryExtraExecutions = 0;
      this.secondaryExtraExecutionSelector.setValue(0);
      this.secondaryExtraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const discount = getActionEnergyDiscount(character, actionId as ActionId);
    this.secondaryExtraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy: this.getCurrentEnergy(),
      discount,
      accentColor:
        actionId === "focus"
          ? THEME.colors.healthDamageAccent
          : THEME.colors.energyAccent
    });
    if (initialReps > 0) {
      this.secondaryExtraExecutions = initialReps;
      this.secondaryExtraExecutionSelector.setValue(initialReps);
    }
    this.secondaryExtraExecutionSelector.setEnabled(
      this.secondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryExecutionSelectorState(initialReps = 0): void {
    const actionId = this.extraSecondaryActionSelection;
    const definition = actionId
      ? (ActionLibrary[actionId as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const character = this.currentCharacter;
    const supports = Boolean(
      extraExecution && character && this.hasExtraSecondaryAction()
    );
    this.extraSecondaryExtraExecutionSelector.setVisible(supports);
    this.extraSecondaryExtraExecutionSelector.setActive(supports);
    if (!supports || !extraExecution || !character) {
      this.extraSecondaryExtraExecutions = 0;
      this.extraSecondaryExtraExecutionSelector.setValue(0);
      this.extraSecondaryExtraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const discount = getActionEnergyDiscount(character, actionId as ActionId);
    this.extraSecondaryExtraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy: this.getCurrentEnergy(),
      discount,
      accentColor:
        actionId === "focus"
          ? THEME.colors.healthDamageAccent
          : THEME.colors.energyAccent
    });
    if (initialReps > 0) {
      this.extraSecondaryExtraExecutions = initialReps;
      this.extraSecondaryExtraExecutionSelector.setValue(initialReps);
    }
    this.extraSecondaryExtraExecutionSelector.setEnabled(
      this.extraSecondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryLocationSelectorState(): void {
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedExtraSecondaryActionSupportsLocation();
    this.extraSecondaryLocationSelector.setVisible(supports);
    this.extraSecondaryLocationSelector.setActive(supports);
    if (!supports) {
      this.extraSecondaryActionTarget = null;
      this.extraSecondaryLocationSelector.setValue(null);
      this.extraSecondaryLocationSelector.setEnabled(false);
      this.extraSecondaryLocationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    this.extraSecondaryLocationSelector.setEnabled(
      this.extraSecondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryPlayerSelectorState(): void {
    const supports = this.selectedExtraSecondaryActionSupportsSingleTarget();
    const shouldShow = supports && this.extraSecondaryPlayerOptions.length > 0;
    this.extraSecondaryPlayerSelector.setVisible(shouldShow);
    this.extraSecondaryPlayerSelector.setActive(shouldShow);
    if (!shouldShow) {
      this.extraSecondaryActionTargetPlayerId = null;
      this.extraSecondaryPlayerSelector.setValue(null);
      this.extraSecondaryPlayerSelector.setEnabled(false);
      this.extraSecondaryPlayerSelector.setPending(false);
      this.extraSecondaryPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.extraSecondaryPlayerSelector.setEnabled(
      this.extraSecondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryItemSelectorState(): void {
    const isInventorySale =
      this.extraSecondaryActionSelection === "drop" ||
      this.extraSecondaryActionSelection === "black_market_trade";
    const availableOptions = isInventorySale
      ? this.inventoryItemOptions
      : this.itemOptions;
    const supports = this.selectedExtraSecondaryActionSupportsItemPriority();
    const shouldShow = supports && availableOptions.length > 0;
    if (!shouldShow) {
      this.extraSecondaryItemSelector.setVisible(false);
      this.extraSecondaryItemSelector.setActive(false);
      this.extraSecondaryActionPriorityItems = [];
      this.extraSecondaryItemSelector.setValue([], false);
      this.extraSecondaryItemSelector.setEnabled(false);
      this.extraSecondaryItemSelector.setPending(false);
      this.extraSecondaryItemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.extraSecondaryItemSelector.setOptions(availableOptions);
    this.extraSecondaryItemSelector.setVisible(true);
    this.extraSecondaryItemSelector.setActive(true);
    const filtered = this.filterPriorityIds(
      this.extraSecondaryActionPriorityItems,
      availableOptions
    );
    this.extraSecondaryActionPriorityItems = filtered;
    this.extraSecondaryItemSelector.setValue(filtered, false);
    this.extraSecondaryItemSelector.setEnabled(
      this.extraSecondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private hasSearchPrioritySkill(): boolean {
    return (
      getSkillEffectTotal(
        this.currentCharacter,
        "search_food_drink_priority"
      ) > 0
    );
  }

  private updateSearchPriorityToggleText(
    toggle: Phaser.GameObjects.Text,
    enabled: boolean
  ): void {
    toggle.setText(
      enabled ? "[x] Prioritize food/drink" : "[ ] Prioritize food/drink"
    );
  }

  private refreshSecondarySearchPriorityState(): void {
    const visible =
      this.hasSearchPrioritySkill() && this.secondaryActionSelection === "search";
    this.secondarySearchPriorityToggle.setVisible(visible);
    this.secondarySearchPriorityToggle.setActive(visible);
    if (!visible) {
      this.secondaryPrioritizeFoodDrink = false;
      this.updateSearchPriorityToggleText(
        this.secondarySearchPriorityToggle,
        false
      );
    }
    this.updateScrollLayout();
  }

  private refreshExtraSecondarySearchPriorityState(): void {
    const visible =
      this.hasSearchPrioritySkill() &&
      this.extraSecondaryActionSelection === "search";
    this.extraSecondarySearchPriorityToggle.setVisible(visible);
    this.extraSecondarySearchPriorityToggle.setActive(visible);
    if (!visible) {
      this.extraSecondaryPrioritizeFoodDrink = false;
      this.updateSearchPriorityToggleText(
        this.extraSecondarySearchPriorityToggle,
        false
      );
    }
    this.updateScrollLayout();
  }

  private updateChemicalTargetToggleText(
    toggle: Phaser.GameObjects.Text,
    enabled: boolean
  ): void {
    toggle.setText(
      enabled ? "[x] Single target (Area)" : "[ ] Single target (Area)"
    );
  }

  private refreshSecondaryChemicalTargetState(): void {
    const visible = this.secondaryActionSelection === "use_chemical_weapon";
    this.secondaryChemicalTargetToggle.setVisible(visible);
    this.secondaryChemicalTargetToggle.setActive(visible);
    if (!visible) {
      this.secondaryChemicalSingleTarget = false;
      this.updateChemicalTargetToggleText(
        this.secondaryChemicalTargetToggle,
        false
      );
    }
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryChemicalTargetState(): void {
    const visible = this.extraSecondaryActionSelection === "use_chemical_weapon";
    this.extraSecondaryChemicalTargetToggle.setVisible(visible);
    this.extraSecondaryChemicalTargetToggle.setActive(visible);
    if (!visible) {
      this.extraSecondaryChemicalSingleTarget = false;
      this.updateChemicalTargetToggleText(
        this.extraSecondaryChemicalTargetToggle,
        false
      );
    }
    this.updateScrollLayout();
  }

  private updateDropSellToggleText(
    toggle: Phaser.GameObjects.Text,
    enabled: boolean
  ): void {
    toggle.setText(enabled ? "[x] Sell instead" : "[ ] Sell instead");
  }

  private refreshSecondaryDropSellState(): void {
    const visible = this.secondaryActionSelection === "drop";
    this.secondaryDropSellToggle.setVisible(visible);
    this.secondaryDropSellToggle.setActive(visible);
    if (!visible) {
      this.secondarySellInstead = false;
      this.updateDropSellToggleText(this.secondaryDropSellToggle, false);
    }
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryDropSellState(): void {
    const visible = this.extraSecondaryActionSelection === "drop";
    this.extraSecondaryDropSellToggle.setVisible(visible);
    this.extraSecondaryDropSellToggle.setActive(visible);
    if (!visible) {
      this.extraSecondarySellInstead = false;
      this.updateDropSellToggleText(this.extraSecondaryDropSellToggle, false);
    }
    this.updateScrollLayout();
  }

  private refreshLocationSelectorState(): void {
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedMainActionSupportsLocation();
    this.locationSelector.setVisible(supports);
    this.locationSelector.setActive(supports);
    if (!supports) {
      this.mainActionTarget = null;
      this.locationSelector.setValue(null);
      this.locationSelector.setEnabled(false);
      this.locationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    this.locationSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshSecondLocationSelectorState(): void {
    const supports = this.selectedMainActionSupportsSecondLocation();
    this.secondLocationSelector.setVisible(supports);
    this.secondLocationSelector.setActive(supports);
    if (!supports) {
      this.mainActionSecondTarget = null;
      this.secondLocationSelector.setValue(null);
      this.secondLocationSelector.setEnabled(false);
      this.secondLocationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    this.secondLocationSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshPlayerSelectorState(): void {
    const supports = this.selectedActionSupportsSingleTarget();
    const shouldShow = supports && this.mainPlayerOptions.length > 0;
    this.playerSelector.setVisible(shouldShow);
    this.playerSelector.setActive(shouldShow);
    if (!shouldShow) {
      this.mainActionTargetPlayerId = null;
      this.playerSelector.setValue(null);
      this.playerSelector.setEnabled(false);
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.playerSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshScareSecondPlayerSelectorState(): void {
    const supports =
      this.mainExtraExecutions > 0 &&
      ((this.mainActionSelection === "steal" &&
        this.mainPlayerOptions.length > 0) ||
        ((this.mainActionSelection === "scare" ||
          this.mainActionSelection === "shoot_pistol") &&
          this.mainPlayerOptions.length > 1));
    this.scareSecondPlayerSelector.setVisible(supports);
    this.scareSecondPlayerSelector.setActive(supports);
    if (!supports) {
      this.scareSecondTargetPlayerId = null;
      this.scareSecondPlayerSelector.setValue(null, false);
      this.scareSecondPlayerSelector.setEnabled(false);
      this.scareSecondPlayerSelector.setPending(false);
      this.scareSecondPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.scareSecondPlayerSelector.setLabel(
      this.mainActionSelection === "shoot_pistol"
        ? t("Second Shot Target Player")
        : this.mainActionSelection === "steal"
          ? "Second Steal Target Player"
          : t("Second Target Player")
    );
    this.scareSecondPlayerSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshItemSelectorState(): void {
    this.itemSelector.setMaxEntries(this.getStealPriorityLimit());
    const supports = this.selectedActionSupportsItemPriority();
    const availableOptions = this.getMainActionItemOptions();
    const shouldShow = supports && availableOptions.length > 0;
    if (!shouldShow) {
      this.itemSelector.setVisible(false);
      this.itemSelector.setActive(false);
      this.mainActionPriorityItems = [];
      this.itemSelector.setValue([], false);
      this.itemSelector.setEnabled(false);
      this.itemSelector.setPending(false);
      this.itemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.itemSelector.setOptions(availableOptions);
    this.itemSelector.setVisible(true);
    this.itemSelector.setActive(true);
    const filtered = this.filterPriorityIds(
      this.mainActionPriorityItems,
      availableOptions,
      this.getStealPriorityLimit()
    );
    this.mainActionPriorityItems = filtered;
    this.itemSelector.setValue(filtered, false);
    this.itemSelector.setEnabled(this.mainActionSelection !== null);
    this.updateScrollLayout();
  }

  private refreshSecondStealItemSelectorState(): void {
    const supports =
      this.mainActionSelection === "steal" &&
      this.hasDexterity2() &&
      this.mainExtraExecutions > 0;
    const availableOptions = this.stealItemOptions;
    const shouldShow = supports && availableOptions.length > 0;
    if (!shouldShow) {
      this.secondStealItemSelector.setVisible(false);
      this.secondStealItemSelector.setActive(false);
      this.secondStealPriorityItems = [];
      this.secondStealItemSelector.setValue([], false);
      this.secondStealItemSelector.setEnabled(false);
      this.secondStealItemSelector.setPending(false);
      this.secondStealItemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.secondStealItemSelector.setOptions(availableOptions);
    this.secondStealItemSelector.setVisible(true);
    this.secondStealItemSelector.setActive(true);
    const filtered = this.filterPriorityIds(
      this.secondStealPriorityItems,
      availableOptions,
      MAX_STEAL_PRIORITY_ITEMS
    );
    this.secondStealPriorityItems = filtered;
    this.secondStealItemSelector.setValue(filtered, false);
    this.secondStealItemSelector.setEnabled(true);
    this.updateScrollLayout();
  }

  private refreshSecondaryLocationSelectorState(): void {
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedSecondaryActionSupportsLocation();
    this.secondaryLocationSelector.setVisible(supports);
    this.secondaryLocationSelector.setActive(supports);
    if (!supports) {
      this.secondaryActionTarget = null;
      this.secondaryLocationSelector.setValue(null);
      this.secondaryLocationSelector.setEnabled(false);
      this.secondaryLocationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    this.secondaryLocationSelector.setEnabled(
      this.secondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshSecondaryPlayerSelectorState(): void {
    const supports = this.selectedSecondaryActionSupportsSingleTarget();
    const shouldShow = supports && this.secondaryPlayerOptions.length > 0;
    this.secondaryPlayerSelector.setVisible(shouldShow);
    this.secondaryPlayerSelector.setActive(shouldShow);
    if (!shouldShow) {
      this.secondaryActionTargetPlayerId = null;
      this.secondaryPlayerSelector.setValue(null);
      this.secondaryPlayerSelector.setEnabled(false);
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.secondaryPlayerSelector.setEnabled(
      this.secondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private supportsSecondaryAdditionalTargetSelection(): boolean {
    return (
      (this.secondaryActionSelection === "inspect" &&
        this.secondaryPlayerOptions.length > 1) ||
      (this.secondaryActionSelection === "place_tracker" &&
        this.secondaryExtraExecutions > 0 &&
        this.secondaryPlayerOptions.length > 1)
    );
  }

  private updateInspectAdditionalTargetToggleText(): void {
    this.secondaryInspectAdditionalTargetToggle.setText(
      this.secondaryActionSelection === "place_tracker"
        ? this.secondaryInspectAdditionalTarget
          ? "[x] Additional tracker player"
          : "[ ] Additional tracker player"
        : this.secondaryInspectAdditionalTarget
          ? "[x] Inspect another player"
          : "[ ] Inspect another player"
    );
  }

  private refreshSecondaryInspectAdditionalTargetState(): void {
    const supports = this.supportsSecondaryAdditionalTargetSelection();
    this.secondaryInspectAdditionalTargetToggle.setVisible(supports);
    this.secondaryInspectAdditionalTargetToggle.setActive(supports);
    if (!supports) {
      this.secondaryInspectAdditionalTarget = false;
      this.updateInspectAdditionalTargetToggleText();
      this.refreshSecondaryInspectSecondPlayerSelectorState();
      return;
    }
    this.updateInspectAdditionalTargetToggleText();
    this.refreshSecondaryInspectSecondPlayerSelectorState();
  }

  private refreshSecondaryInspectSecondPlayerSelectorState(): void {
    const supports =
      this.supportsSecondaryAdditionalTargetSelection() &&
      this.secondaryInspectAdditionalTarget;
    this.secondaryInspectSecondPlayerSelector.setLabel(
      this.secondaryActionSelection === "place_tracker"
        ? "Additional tracked player"
        : "Additional inspected player"
    );
    this.secondaryInspectSecondPlayerSelector.setVisible(supports);
    this.secondaryInspectSecondPlayerSelector.setActive(supports);
    if (!supports) {
      this.secondaryInspectSecondTargetPlayerId = null;
      this.secondaryInspectSecondPlayerSelector.setValue(null, false);
      this.secondaryInspectSecondPlayerSelector.setEnabled(false);
      this.secondaryInspectSecondPlayerSelector.setPending(false);
      this.secondaryInspectSecondPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.secondaryInspectSecondPlayerSelector.setEnabled(
      this.secondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshSecondaryItemSelectorState(): void {
    const isInventorySale =
      this.secondaryActionSelection === "drop" ||
      this.secondaryActionSelection === "black_market_trade";
    const availableOptions = isInventorySale
      ? this.inventoryItemOptions
      : this.itemOptions;
    const supports = this.selectedSecondaryActionSupportsItemPriority();
    const shouldShow = supports && availableOptions.length > 0;
    if (!shouldShow) {
      this.secondaryItemSelector.setVisible(false);
      this.secondaryItemSelector.setActive(false);
      this.secondaryActionPriorityItems = [];
      this.secondaryItemSelector.setValue([], false);
      this.secondaryItemSelector.setEnabled(false);
      this.secondaryItemSelector.setPending(false);
      this.secondaryItemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.secondaryItemSelector.setOptions(availableOptions);
    this.secondaryItemSelector.setVisible(true);
    this.secondaryItemSelector.setActive(true);
    const filtered = this.filterPriorityIds(
      this.secondaryActionPriorityItems,
      availableOptions
    );
    this.secondaryActionPriorityItems = filtered;
    this.secondaryItemSelector.setValue(filtered, false);
    this.secondaryItemSelector.setEnabled(
      this.secondaryActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private updateScrollLayout(): void {
    const boxWidth = this.scrollContentWidth;
    layoutActionPlan({
      width: boxWidth,
      scrollContent: this.scrollContent,
      scrollPanel: this.scrollPanel,
      main: {
        box: this.mainActionBox,
        label: this.mainActionLabel,
        dropdown: this.mainActionDropdown,
        extraExecutionSelector: this.extraExecutionSelector,
        locationSelector: this.locationSelector,
        secondLocationSelector: this.secondLocationSelector,
        playerSelector: this.playerSelector,
        itemSelector: this.itemSelector,
        secondItemSelector: this.secondStealItemSelector,
        searchPriorityToggle: null,
        additionalPlayerSelector: this.scareSecondPlayerSelector
      },
      secondary: {
        box: this.secondaryActionBox,
        label: this.secondaryActionLabel,
        dropdown: this.secondaryActionDropdown,
        extraExecutionSelector: this.secondaryExtraExecutionSelector,
        locationSelector: this.secondaryLocationSelector,
        secondLocationSelector: null,
        playerSelector: this.secondaryPlayerSelector,
        itemSelector: this.secondaryItemSelector,
        searchPriorityToggle: this.secondarySearchPriorityToggle,
        chemicalTargetToggle: this.secondaryChemicalTargetToggle,
        dropSellToggle: this.secondaryDropSellToggle,
        additionalPlayerSelector: this.secondaryInspectSecondPlayerSelector,
        additionalTargetToggle: this.secondaryInspectAdditionalTargetToggle
      },
      extraSecondary: {
        box: this.extraSecondaryActionBox,
        label: this.extraSecondaryActionLabel,
        dropdown: this.extraSecondaryActionDropdown,
        extraExecutionSelector: this.extraSecondaryExtraExecutionSelector,
        locationSelector: this.extraSecondaryLocationSelector,
        secondLocationSelector: null,
        playerSelector: this.extraSecondaryPlayerSelector,
        itemSelector: this.extraSecondaryItemSelector,
        searchPriorityToggle: this.extraSecondarySearchPriorityToggle,
        chemicalTargetToggle: this.extraSecondaryChemicalTargetToggle,
        dropSellToggle: this.extraSecondaryDropSellToggle
      },
      hasExtraSecondary: this.hasExtraSecondaryAction()
    });
  }

  private setMainActionTargetPlayer(playerId: string | null, emit = false): boolean {
    const supports = this.selectedActionSupportsSingleTarget();
    if (!supports) {
      const hadValue = this.mainActionTargetPlayerId !== null;
      if (hadValue) {
        this.mainActionTargetPlayerId = null;
      }
      this.playerSelector.setValue(null);
      this.playerSelector.setPending(false);
      this.refreshScareSecondPlayerSelectorState();
      if (emit && hadValue) {
        this.emitMainActionChange();
      }
      return hadValue;
    }
    const normalized = playerId ? playerId.trim() : null;
    if (normalized === this.mainActionTargetPlayerId) {
      this.playerSelector.setPending(false);
      return false;
    }
    this.mainActionTargetPlayerId = normalized;
    this.playerSelector.setValue(normalized);
    this.playerSelector.setPending(false);
    if (
      this.scareSecondTargetPlayerId === normalized &&
      this.mainActionSelection !== "steal"
    ) {
      this.setScareSecondTargetPlayer(null, false);
    }
    this.refreshScareSecondPlayerSelectorState();
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setScareSecondTargetPlayer(playerId: string | null, emit = false): boolean {
    const supports =
      this.mainExtraExecutions > 0 &&
      ((this.mainActionSelection === "steal" &&
        this.mainPlayerOptions.length > 0) ||
        ((this.mainActionSelection === "scare" ||
          this.mainActionSelection === "shoot_pistol") &&
          this.mainPlayerOptions.length > 1));
    if (!supports) {
      const hadValue = this.scareSecondTargetPlayerId !== null;
      if (hadValue) {
        this.scareSecondTargetPlayerId = null;
      }
      this.scareSecondPlayerSelector.setValue(null, false);
      this.scareSecondPlayerSelector.setPending(false);
      if (emit && hadValue) {
        this.emitMainActionChange();
      }
      return hadValue;
    }
    const normalized = playerId ? playerId.trim() : null;
    if (normalized === this.scareSecondTargetPlayerId) {
      this.scareSecondPlayerSelector.setPending(false);
      return false;
    }
    this.scareSecondTargetPlayerId = normalized;
    this.scareSecondPlayerSelector.setValue(normalized, false);
    this.scareSecondPlayerSelector.setPending(false);
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setSecondaryActionTargetPlayer(playerId: string | null, emit = false): boolean {
    const supports = this.selectedSecondaryActionSupportsSingleTarget();
    if (!supports) {
      const hadValue = this.secondaryActionTargetPlayerId !== null;
      if (hadValue) {
        this.secondaryActionTargetPlayerId = null;
      }
      this.secondaryPlayerSelector.setValue(null);
      this.secondaryPlayerSelector.setPending(false);
      if (emit && hadValue) {
        this.emitSecondaryActionChange();
      }
      return hadValue;
    }
    const normalized = playerId ? playerId.trim() : null;
    if (normalized === this.secondaryActionTargetPlayerId) {
      this.secondaryPlayerSelector.setPending(false);
      return false;
    }
    this.secondaryActionTargetPlayerId = normalized;
    this.secondaryPlayerSelector.setValue(normalized);
    this.secondaryPlayerSelector.setPending(false);
    if (this.secondaryInspectSecondTargetPlayerId === normalized) {
      this.setSecondaryInspectSecondTargetPlayer(null, false);
    }
    this.refreshSecondaryInspectSecondPlayerSelectorState();
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
  }

  private setSecondaryInspectSecondTargetPlayer(playerId: string | null, emit = false): boolean {
    const supports =
      this.supportsSecondaryAdditionalTargetSelection() &&
      this.secondaryInspectAdditionalTarget;
    if (!supports) {
      const hadValue = this.secondaryInspectSecondTargetPlayerId !== null;
      if (hadValue) {
        this.secondaryInspectSecondTargetPlayerId = null;
      }
      this.secondaryInspectSecondPlayerSelector.setValue(null, false);
      this.secondaryInspectSecondPlayerSelector.setPending(false);
      if (emit && hadValue) {
        this.emitSecondaryActionChange();
      }
      return hadValue;
    }
    const normalized = playerId ? playerId.trim() : null;
    if (normalized === this.secondaryInspectSecondTargetPlayerId) {
      this.secondaryInspectSecondPlayerSelector.setPending(false);
      return false;
    }
    this.secondaryInspectSecondTargetPlayerId = normalized;
    this.secondaryInspectSecondPlayerSelector.setValue(normalized, false);
    this.secondaryInspectSecondPlayerSelector.setPending(false);
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
  }

  private setExtraSecondaryActionTargetPlayer(playerId: string | null, emit = false): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsSingleTarget();
    if (!supports) {
      const hadValue = this.extraSecondaryActionTargetPlayerId !== null;
      if (hadValue) {
        this.extraSecondaryActionTargetPlayerId = null;
      }
      this.extraSecondaryPlayerSelector.setValue(null);
      this.extraSecondaryPlayerSelector.setPending(false);
      if (emit && hadValue) {
        this.emitExtraSecondaryActionChange();
      }
      return hadValue;
    }
    const normalized = playerId ? playerId.trim() : null;
    if (normalized === this.extraSecondaryActionTargetPlayerId) {
      this.extraSecondaryPlayerSelector.setPending(false);
      return false;
    }
    this.extraSecondaryActionTargetPlayerId = normalized;
    this.extraSecondaryPlayerSelector.setValue(normalized);
    this.extraSecondaryPlayerSelector.setPending(false);
    if (emit) {
      this.emitExtraSecondaryActionChange();
    }
    return true;
  }

  private refreshPlayerOptionsForSelectors(): void {
    const { main: mainOptions, secondary: secondaryOptions, extraSecondary: extraSecondaryOptions } =
      buildPlayerTargetOptionSets({
        match: this.currentMatch,
        playerOptions: this.playerOptions,
        currentUserId: this.currentUserId,
        mainActionId: this.mainActionSelection,
        secondaryActionId: this.secondaryActionSelection,
        extraSecondaryActionId: this.extraSecondaryActionSelection,
        mainAllowsSelf: this.selectedActionCanTargetSelf(),
        secondaryAllowsSelf: this.selectedSecondaryActionCanTargetSelf(),
        extraSecondaryAllowsSelf: this.selectedExtraSecondaryActionCanTargetSelf()
      });

    this.mainPlayerOptions = mainOptions;
    this.secondaryPlayerOptions = secondaryOptions;
    this.extraSecondaryPlayerOptions = extraSecondaryOptions;

    if (
      this.mainActionTargetPlayerId &&
      !mainOptions.some((option) => option.id === this.mainActionTargetPlayerId)
    ) {
      this.mainActionTargetPlayerId = null;
    }
    if (
      !this.mainActionTargetPlayerId &&
      mainOptions.length === 1 &&
      this.selectedActionSupportsSingleTarget()
    ) {
      this.mainActionTargetPlayerId = mainOptions[0].id;
    }
    const secondTargetOptions =
      (this.mainActionSelection === "shoot_pistol" ||
        this.mainActionSelection === "steal") &&
      this.mainExtraExecutions > 0
        ? mainOptions
        : mainOptions.filter(
            (option) => option.id !== this.mainActionTargetPlayerId
          );
    if (
      this.scareSecondTargetPlayerId &&
      !secondTargetOptions.some(
        (option) => option.id === this.scareSecondTargetPlayerId
      )
    ) {
      this.scareSecondTargetPlayerId = null;
    }
    if (
      this.secondaryActionTargetPlayerId &&
      !secondaryOptions.some(
        (option) => option.id === this.secondaryActionTargetPlayerId
      )
    ) {
      this.secondaryActionTargetPlayerId = null;
    }
    if (
      this.extraSecondaryActionTargetPlayerId &&
      !extraSecondaryOptions.some(
        (option) => option.id === this.extraSecondaryActionTargetPlayerId
      )
    ) {
      this.extraSecondaryActionTargetPlayerId = null;
    }

    this.playerSelector.setOptions(mainOptions);
    this.scareSecondPlayerSelector.setOptions(secondTargetOptions);
    this.secondaryPlayerSelector.setOptions(secondaryOptions);
    this.secondaryInspectSecondPlayerSelector.setOptions(
      secondaryOptions.filter(
        (option) => option.id !== this.secondaryActionTargetPlayerId
      )
    );
    this.extraSecondaryPlayerSelector.setOptions(extraSecondaryOptions);

    this.playerSelector.setValue(this.mainActionTargetPlayerId ?? null);
    this.scareSecondPlayerSelector.setValue(
      this.scareSecondTargetPlayerId,
      false
    );
    this.secondaryPlayerSelector.setValue(
      this.secondaryActionTargetPlayerId ?? null
    );
    this.secondaryInspectSecondPlayerSelector.setValue(
      this.secondaryInspectSecondTargetPlayerId ?? null
    );
    this.extraSecondaryPlayerSelector.setValue(
      this.extraSecondaryActionTargetPlayerId ?? null
    );
  }

  private selectedActionCanTargetSelf(): boolean {
    if (!this.mainActionSelection) {
      return false;
    }
    const definition = ActionLibrary[this.mainActionSelection as ActionId];
    return definition?.tags?.includes("CanTargetSelf") === true;
  }

  private selectedSecondaryActionCanTargetSelf(): boolean {
    if (!this.secondaryActionSelection) {
      return false;
    }
    const definition = ActionLibrary[this.secondaryActionSelection as ActionId];
    return definition?.tags?.includes("CanTargetSelf") === true;
  }

  private selectedExtraSecondaryActionCanTargetSelf(): boolean {
    if (!this.extraSecondaryActionSelection) {
      return false;
    }
    const definition = ActionLibrary[this.extraSecondaryActionSelection as ActionId];
    return definition?.tags?.includes("CanTargetSelf") === true;
  }

  private filterPriorityIds(
    ids: string[],
    optionsList: ItemPriorityOption[] = this.itemOptions,
    maxEntries?: number
  ): string[] {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const filtered: string[] = [];
    let noneCount = 0;
    let itemCount = 0;
    for (const value of ids) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === PICKUP_NONE_PRIORITY_ID) {
        if (noneCount >= MAX_PICKUP_NONE_PRIORITY_ENTRIES) {
          continue;
        }
        noneCount += 1;
      } else {
        if (seen.has(trimmed)) {
          continue;
        }
        if (maxEntries !== undefined && itemCount >= maxEntries) {
          continue;
        }
      }
      const option = optionsList.find((entry) => entry.id === trimmed);
      if (!option || option.disabled) {
        if (trimmed === PICKUP_NONE_PRIORITY_ID) {
          noneCount -= 1;
        }
        continue;
      }
      if (trimmed !== PICKUP_NONE_PRIORITY_ID) {
        itemCount += 1;
      }
      seen.add(trimmed);
      filtered.push(trimmed);
    }
    return filtered;
  }

  private setMainActionPriorityItems(ids: string[], emit = false): boolean {
    const supports = this.selectedActionSupportsItemPriority();
    if (!supports) {
      const hadValues = this.mainActionPriorityItems.length > 0;
      if (hadValues) {
        this.mainActionPriorityItems = [];
      }
      this.itemSelector.setValue([], false);
      if (emit && hadValues) {
        this.emitMainActionChange();
      }
      return hadValues;
    }
    const filtered = this.filterPriorityIds(
      ids,
      this.getMainActionItemOptions(),
      this.getStealPriorityLimit()
    );
    if (isSameTargetItems(this.mainActionPriorityItems, filtered)) {
      this.itemSelector.setValue(filtered, false);
      return false;
    }
    this.mainActionPriorityItems = filtered;
    this.itemSelector.setValue(filtered, false);
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setSecondStealPriorityItems(
    ids: string[],
    emit = false
  ): boolean {
    const supports =
      this.mainActionSelection === "steal" &&
      this.hasDexterity2() &&
      this.mainExtraExecutions > 0;
    if (!supports) {
      const hadValues = this.secondStealPriorityItems.length > 0;
      if (hadValues) {
        this.secondStealPriorityItems = [];
      }
      this.secondStealItemSelector.setValue([], false);
      if (emit && hadValues) {
        this.emitMainActionChange();
      }
      return hadValues;
    }
    const filtered = this.filterPriorityIds(
      ids,
      this.stealItemOptions,
      MAX_STEAL_PRIORITY_ITEMS
    );
    if (isSameTargetItems(this.secondStealPriorityItems, filtered)) {
      this.secondStealItemSelector.setValue(filtered, false);
      return false;
    }
    this.secondStealPriorityItems = filtered;
    this.secondStealItemSelector.setValue(filtered, false);
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setSecondaryActionPriorityItems(ids: string[], emit = false): boolean {
    const supports = this.selectedSecondaryActionSupportsItemPriority();
    if (!supports) {
      const hadValues = this.secondaryActionPriorityItems.length > 0;
      if (hadValues) {
        this.secondaryActionPriorityItems = [];
      }
      this.secondaryItemSelector.setValue([], false);
      if (emit && hadValues) {
        this.emitSecondaryActionChange();
      }
      return hadValues;
    }
    const optionsList =
      this.secondaryActionSelection === "drop" ||
      this.secondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : this.itemOptions;
    const filtered = this.filterPriorityIds(ids, optionsList);
    if (isSameTargetItems(this.secondaryActionPriorityItems, filtered)) {
      this.secondaryItemSelector.setValue(filtered, false);
      return false;
    }
    this.secondaryActionPriorityItems = filtered;
    this.secondaryItemSelector.setValue(filtered, false);
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
  }

  private setExtraSecondaryActionPriorityItems(ids: string[], emit = false): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsItemPriority();
    if (!supports) {
      const hadValues = this.extraSecondaryActionPriorityItems.length > 0;
      if (hadValues) {
        this.extraSecondaryActionPriorityItems = [];
      }
      this.extraSecondaryItemSelector.setValue([], false);
      if (emit && hadValues) {
        this.emitExtraSecondaryActionChange();
      }
      return hadValues;
    }
    const optionsList =
      this.extraSecondaryActionSelection === "drop" ||
      this.extraSecondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : this.itemOptions;
    const filtered = this.filterPriorityIds(ids, optionsList);
    if (isSameTargetItems(this.extraSecondaryActionPriorityItems, filtered)) {
      this.extraSecondaryItemSelector.setValue(filtered, false);
      return false;
    }
    this.extraSecondaryActionPriorityItems = filtered;
    this.extraSecondaryItemSelector.setValue(filtered, false);
    if (emit) {
      this.emitExtraSecondaryActionChange();
    }
    return true;
  }

  private selectedMainActionSupportsLocation(): boolean {
    return (
      actionSupportsLocation(this.lastMainActionItem) ||
      this.mainActionSelection === "shoot_pistol"
    );
  }

  private selectedMainActionSupportsSecondLocation(): boolean {
    return (
      this.mainActionSelection === "shoot_pistol" &&
      this.mainExtraExecutions > 0
    );
  }

  private selectedActionSupportsSingleTarget(): boolean {
    return actionSupportsSingleTarget(this.lastMainActionItem);
  }

  private selectedActionSupportsItemPriority(): boolean {
    return actionSupportsTargetItems(
      this.lastMainActionItem,
      this.mainActionSelection,
      this.hasDexterity2()
    );
  }

  private hasDexterity2(): boolean {
    return this.currentCharacter?.abilities?.includes("dexterity2") === true;
  }

  private getStealPriorityLimit(): number | undefined {
    return this.mainActionSelection === "steal" && this.hasDexterity2()
      ? MAX_STEAL_PRIORITY_ITEMS
      : undefined;
  }

  private getMainActionItemOptions(): ItemPriorityOption[] {
    if (this.mainActionSelection === "steal") {
      return this.stealItemOptions;
    }
    if (this.mainActionSelection !== "pick_up") {
      return this.itemOptions;
    }
    return [
      ...this.itemOptions,
      {
        id: PICKUP_NONE_PRIORITY_ID,
        label: t("None"),
        description: t(
          "Stops after earlier picks; if first, picks one random item."
        ),
        texture: ""
      }
    ];
  }

  private selectedSecondaryActionSupportsLocation(): boolean {
    return actionSupportsLocation(this.lastSecondaryActionItem);
  }

  private selectedSecondaryActionSupportsSingleTarget(): boolean {
    return actionSupportsSingleTarget(this.lastSecondaryActionItem);
  }

  private selectedSecondaryActionSupportsItemPriority(): boolean {
    return actionSupportsTargetItems(
      this.lastSecondaryActionItem,
      this.secondaryActionSelection,
      this.hasDexterity2()
    );
  }

  private hasExtraSecondaryAction(): boolean {
    const character = this.currentCharacter;
    if (!character) {
      return false;
    }
    return getSkillEffectTotal(character, "extra_secondary_action") > 0;
  }

  private selectedExtraSecondaryActionSupportsLocation(): boolean {
    return actionSupportsLocation(this.lastExtraSecondaryActionItem);
  }

  private selectedExtraSecondaryActionSupportsSingleTarget(): boolean {
    return actionSupportsSingleTarget(this.lastExtraSecondaryActionItem);
  }

  private selectedExtraSecondaryActionSupportsItemPriority(): boolean {
    return actionSupportsTargetItems(
      this.lastExtraSecondaryActionItem,
      this.extraSecondaryActionSelection,
      this.hasDexterity2()
    );
  }

  private selectedExtraSecondaryActionSupportsExtraExecution(): boolean {
    return actionSupportsExtraExecution(this.extraSecondaryActionSelection);
  }

  private selectedActionSupportsExtraExecution(): boolean {
    return actionSupportsExtraExecution(this.mainActionSelection);
  }

  private selectedSecondaryActionSupportsExtraExecution(): boolean {
    return actionSupportsExtraExecution(this.secondaryActionSelection);
  }

  private emitMainActionChange(): void {
    const payload = this.getMainActionSelection();
    this.emit("main-action-change", payload);
  }

  private emitSecondaryActionChange(): void {
    const payload = this.getSecondaryActionSelection();
    this.emit("secondary-action-change", payload);
  }

  private emitExtraSecondaryActionChange(): void {
    const payload = this.getExtraSecondaryActionSelection();
    this.emit("extra-secondary-action-change", payload);
  }

  private syncMainActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverSecondTargetLocation: Axial | null,
    serverTargetPlayerId: string | null,
    serverSecondTargetPlayerId: string | null,
    serverTargetItems: string[] | null,
    serverSecondTargetItems: string[] | null
  ): void {
    if (
      shouldSyncMainActionWithServer(
        {
          actionId: this.mainActionSelection,
          targetLocation: this.mainActionTarget,
          secondTargetLocation: this.mainActionSecondTarget,
          targetPlayerId: this.mainActionTargetPlayerId,
          secondTargetPlayerId: this.scareSecondTargetPlayerId,
          priorityItems: this.mainActionPriorityItems,
          secondPriorityItems: this.secondStealPriorityItems
        },
        {
          actionId: serverActionId,
          targetLocation: serverTargetLocation,
          secondTargetLocation: serverSecondTargetLocation,
          targetPlayerId: serverTargetPlayerId,
          secondTargetPlayerId: serverSecondTargetPlayerId,
          targetItems: serverTargetItems,
          secondTargetItems: serverSecondTargetItems
        }
      )
    ) {
      this.emitMainActionChange();
    }
  }

  private syncSecondaryActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverTargetPlayerId: string | null,
    serverTargetItems: string[] | null,
    serverPrioritizeFoodDrink: boolean,
    serverSellInstead = false
  ): void {
    if (
      shouldSyncSecondaryActionWithServer(
        {
          actionId: this.secondaryActionSelection,
          targetLocation: this.secondaryActionTarget,
          targetPlayerId: this.secondaryActionTargetPlayerId,
          priorityItems: this.secondaryActionPriorityItems,
          prioritizeFoodDrink: this.secondaryPrioritizeFoodDrink,
          sellInstead: this.secondarySellInstead
        },
        {
          actionId: serverActionId,
          targetLocation: serverTargetLocation,
          targetPlayerId: serverTargetPlayerId,
          targetItems: serverTargetItems,
          prioritizeFoodDrink: serverPrioritizeFoodDrink,
          sellInstead: serverSellInstead
        }
      )
    ) {
      this.emitSecondaryActionChange();
    }
  }

  private syncExtraSecondaryActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverTargetPlayerId: string | null,
    serverTargetItems: string[] | null,
    serverPrioritizeFoodDrink: boolean,
    serverSellInstead = false
  ): void {
    if (
      shouldSyncSecondaryActionWithServer(
        {
          actionId: this.extraSecondaryActionSelection,
          targetLocation: this.extraSecondaryActionTarget,
          targetPlayerId: this.extraSecondaryActionTargetPlayerId,
          priorityItems: this.extraSecondaryActionPriorityItems,
          prioritizeFoodDrink: this.extraSecondaryPrioritizeFoodDrink,
          sellInstead: this.extraSecondarySellInstead
        },
        {
          actionId: serverActionId,
          targetLocation: serverTargetLocation,
          targetPlayerId: serverTargetPlayerId,
          targetItems: serverTargetItems,
          prioritizeFoodDrink: serverPrioritizeFoodDrink,
          sellInstead: serverSellInstead
        }
      )
    ) {
      this.emitExtraSecondaryActionChange();
    }
  }
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
  secondItemSelector?: ItemPrioritySelector | null;
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
      secondItemSelector,
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
    if (secondItemSelector) {
      secondItemSelector.setSelectorWidth(options.width - padding * 2);
      secondItemSelector.setPosition(padding, innerCursor);
      if (secondItemSelector.visible) {
        innerCursor += secondItemSelector.height + 8;
      }
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
    options.extraSecondary.dropdown.setVisible(true);
    options.extraSecondary.dropdown.setActive(true);
    layoutBlock(options.extraSecondary);
    cursorY += 16;
  } else {
    options.extraSecondary.box.setVisible(false);
    options.extraSecondary.label.setVisible(false);
    options.extraSecondary.dropdown.setVisible(false);
    options.extraSecondary.dropdown.setActive(false);
  }
  options.scrollContent.setPosition(0, 0);
  options.scrollContent.setSize(options.width, cursorY);
  options.scrollPanel?.layout?.();
}
