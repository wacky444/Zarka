import Phaser from "phaser";
import {
  ActionLibrary,
  type ActionId,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  type ReplayEvent,
  DEFAULT_SKIN,
  type Skin,
  getActionEnergyDiscount,
  getSkillEffectTotal,
  type ShopId,
  type TutorialStepId,
  type UserAccount
} from "@shared";
import { GridSelect, type GridSelectItem } from "../GridSelect";
import { LocationSelector } from "../LocationSelector";
import { ExtraExecutionSelector } from "../ExtraExecutionSelector";
import { PlayerSelector, type PlayerOption } from "../PlayerSelector";
import {
  ItemPrioritySelector,
  type ItemPriorityOption
} from "../ItemPrioritySelector";
import {
  CharacterPanelTabs,
  type CharacterPanelTabEntry,
  type TabKey
} from "../CharacterPanelTabs";
import { CharacterPanelLogView } from "../CharacterPanelLogView";
import { THEME } from "../ColorPalette";
import {
  CharacterPanelChatView,
  type ChatConnectionState,
  type ChatMessageViewModel
} from "../CharacterPanelChatView";
import { CharacterPanelPlayerListView } from "../CharacterPanelPlayerListView";
import { Subtabs } from "../Subtabs";
import { CharacterPanelSkillsView } from "../CharacterPanelSkillsView";
import { CharacterPanelShopView } from "../CharacterPanelShopView";
import type { ZarkanDonationSelection } from "../ZarkanDonationModal";
import {
  getTutorialUiPolicy,
  isTutorialReadyActionAllowed,
  type TutorialControlHighlight
} from "../../tutorial/TutorialUiPolicy";
import { t } from "../../services/i18n";
import {
  buildMainActionItems,
  buildSecondaryActionItems,
  collectMainActions,
  collectSecondaryActions,
  formatActionName as formatActionLabel,
  type CharacterPanelActionOptionsContext
} from "./CharacterPanelActionOptions";
import {
  actionSupportsExtraExecution,
  actionSupportsLocation,
  actionSupportsSingleTarget,
  actionSupportsTargetItems,
  buildExtraSecondaryActionSelection,
  buildMainActionSelection,
  layoutActionPlan,
  buildSecondaryActionSelection,
  type MainActionSelection,
  type SecondaryActionSelection
} from "./CharacterPanelActionPlanView";
import { buildCharacterPanelItemOptions } from "./CharacterPanelItemOptions";
import {
  buildPlayerOptions,
  buildPlayerTargetOptionSets
} from "./CharacterPanelPlayerOptions";
import { PlayerOptionSkinCache } from "./PlayerOptionSkinCache";
import { CharacterPanelInventoryView } from "./CharacterPanelInventoryView";
import { CharacterPanelStatusView } from "./CharacterPanelStatusView";
import { CharacterPanelTabLayout } from "./CharacterPanelTabLayout";

export type { MainActionSelection, SecondaryActionSelection };

export type CharacterSubTabKey = "status" | "skills";

export type {
  ChatMessageViewModel,
  ChatConnectionState
} from "../CharacterPanelChatView";

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
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
};

const DEFAULT_WIDTH = 420;
const TAB_HEIGHT = 40;
const TAB_ARROW_WIDTH = 36;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 180;
type LogEliminationPayload = {
  playerId: string;
  playerName: string;
  turn: number;
};

type PlayerEliminatedPayload = {
  playerId: string;
  playerName: string;
  texture: string;
  frame: string;
  turn: number;
};

export class CharacterPanel extends Phaser.GameObjects.Container {
  private readonly tabConfigs: Array<{ key: TabKey; label: string }> = [
    { key: "character", label: "Character" },
    { key: "items", label: "Items" },
    { key: "shop", label: "Shop" },
    { key: "players", label: "Players" },
    { key: "chat", label: "Chat" },
    { key: "log", label: "Log" }
  ];
  private background: Phaser.GameObjects.Rectangle;
  private tabs: CharacterPanelTabEntry[] = [];
  private tabPreviousButton!: Phaser.GameObjects.Rectangle;
  private tabPreviousText!: Phaser.GameObjects.Text;
  private tabNextButton!: Phaser.GameObjects.Rectangle;
  private tabNextText!: Phaser.GameObjects.Text;
  private tabLayout!: CharacterPanelTabLayout;
  private characterElements: Phaser.GameObjects.GameObject[] = [];
  private characterSubtabs!: Subtabs<CharacterSubTabKey>;
  private skillsView!: CharacterPanelSkillsView;
  private shopView!: CharacterPanelShopView;
  private statusElements: Phaser.GameObjects.GameObject[] = [];
  private itemsElements: Phaser.GameObjects.GameObject[] = [];
  private shopElements: Phaser.GameObjects.GameObject[] = [];
  private playersElements: Phaser.GameObjects.GameObject[] = [];
  private chatElements: Phaser.GameObjects.GameObject[] = [];
  private tabsController!: CharacterPanelTabs;
  private tutorialStepId: TutorialStepId | null = null;
  private tutorialActive = false;
  private tutorialAllowedMainActionIds: ReadonlySet<ActionId> | null = null;
  private tutorialAllowedSecondaryActionIds: ReadonlySet<ActionId> | null = null;
  private tutorialActionEditingEnabled = true;
  private tutorialReadyEnabled = true;
  private logView!: CharacterPanelLogView;
  private chatView!: CharacterPanelChatView;
  private statusView!: CharacterPanelStatusView;
  private inventoryView!: CharacterPanelInventoryView;
  private playerOptionSkinCache!: PlayerOptionSkinCache;
  private readyToggle!: Phaser.GameObjects.Text;
  private unspentSkillsWarning!: Phaser.GameObjects.Text;
  private mainActionBox: Phaser.GameObjects.Rectangle;
  private secondaryActionBox: Phaser.GameObjects.Rectangle;
  private extraSecondaryActionBox: Phaser.GameObjects.Rectangle;
  private mainActionLabel: Phaser.GameObjects.Text;
  private secondaryActionLabel: Phaser.GameObjects.Text;
  private extraSecondaryActionLabel: Phaser.GameObjects.Text;
  private mainActionDropdown: GridSelect;
  private mainActionDropdownWidth: number;
  private secondaryActionDropdown: GridSelect;
  private secondaryActionDropdownWidth: number;
  private extraSecondaryActionDropdown: GridSelect;
  private extraSecondaryActionDropdownWidth: number;
  private extraExecutionSelector: ExtraExecutionSelector;
  private mainExtraExecutions = 0;
  private secondaryExtraExecutionSelector: ExtraExecutionSelector;
  private secondaryExtraExecutions = 0;
  private extraSecondaryExtraExecutionSelector: ExtraExecutionSelector;
  private extraSecondaryExtraExecutions = 0;
  private locationSelector: LocationSelector;
  private secondLocationSelector: LocationSelector;
  private playerSelector: PlayerSelector;
  private scareSecondPlayerSelector: PlayerSelector;
  private itemSelector: ItemPrioritySelector;
  private secondaryLocationSelector: LocationSelector;
  private secondaryPlayerSelector: PlayerSelector;
  private secondaryInspectAdditionalTargetToggle: Phaser.GameObjects.Text;
  private secondaryInspectSecondPlayerSelector: PlayerSelector;
  private secondaryItemSelector: ItemPrioritySelector;
  private secondarySearchPriorityToggle: Phaser.GameObjects.Text;
  private secondaryDropSellToggle: Phaser.GameObjects.Text;
  private secondaryChemicalTargetToggle: Phaser.GameObjects.Text;
  private extraSecondaryLocationSelector: LocationSelector;
  private extraSecondarySearchPriorityToggle: Phaser.GameObjects.Text;
  private extraSecondaryDropSellToggle: Phaser.GameObjects.Text;
  private extraSecondaryChemicalTargetToggle: Phaser.GameObjects.Text;
  private extraSecondaryPlayerSelector: PlayerSelector;
  private extraSecondaryItemSelector: ItemPrioritySelector;
  private scrollPanel: ScrollablePanelInstance | null = null;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private scrollContent: Phaser.GameObjects.Container;
  private scrollContentWidth = 0;
  private scrollTop = 0;
  private gridModalOpenCount = 0;
  private panelWidth: number;
  private panelHeight: number;
  private mainActionSelection: string | null = null;
  private secondaryActionSelection: string | null = null;
  private extraSecondaryActionSelection: string | null = null;
  private currentTurn = 0;
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
  private readyState = false;
  private readyEnabled = false;
  private playerOptions: PlayerOption[] = [];
  private playersTabView!: CharacterPanelPlayerListView;
  private mainPlayerOptions: PlayerOption[] = [];
  private secondaryPlayerOptions: PlayerOption[] = [];
  private extraSecondaryPlayerOptions: PlayerOption[] = [];
  private itemOptions: ItemPriorityOption[] = [];
  private stealItemOptions: ItemPriorityOption[] = [];
  private inventoryItemOptions: ItemPriorityOption[] = [];
  private currentMatch: MatchRecord | null = null;
  private currentUserId: string | null = null;
  private currentCharacter: PlayerCharacter | null = null;
  private currentPlayerSkin: Skin | null = null;
  private playerAccounts = new Map<string, UserAccount>();
  private lastUserMap: Record<string, string> = {};
  private readonly handleMainExtraExecutionChange = (reps: number) => {
    this.mainExtraExecutions = reps;
    this.refreshLocationSelectorState();
    this.refreshScareSecondPlayerSelectorState();
    this.setReadyEnabled(this.readyEnabled);
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
    this.setReadyEnabled(this.readyEnabled);
    this.emitMainActionChange();
  };
  private readonly handleLocationPickRequest = () => {
    if (
      !this.mainActionSelection ||
      !this.selectedMainActionSupportsLocation()
    ) {
      return;
    }
    this.emit("main-action-location-request");
  };
  private readonly handleLocationClear = () => {
    this.setMainActionTarget(null, true);
  };
  private readonly handleSecondLocationPickRequest = () => {
    if (
      !this.mainActionSelection ||
      !this.selectedMainActionSupportsSecondLocation()
    ) {
      return;
    }
    this.emit("main-action-second-location-request");
  };
  private readonly handleSecondLocationClear = () => {
    this.setMainActionSecondTarget(null, true);
  };
  private readonly handlePlayerSelection = (playerId: string | null) => {
    this.setMainActionTargetPlayer(playerId ?? null, true);
  };
  private readonly handleScareSecondPlayerSelection = (
    playerId: string | null
  ) => {
    this.setScareSecondTargetPlayer(playerId ?? null, true);
  };
  private readonly handleItemPriorityChange = (itemIds: string[]) => {
    this.setMainActionPriorityItems(itemIds ?? [], true);
  };
  private readonly handleReadyToggle = () => {
    if (
      !this.readyEnabled ||
      !this.isTutorialReadyAllowed() ||
      this.getUnspentSkillPoints() > 0
    ) {
      return;
    }
    this.setReadyState(!this.readyState, true);
  };
  private readonly handleTestamentChange = (recipientId: string | null) => {
    this.emit("testament-change", recipientId);
  };
  private readonly handleShopPurchase = (payload: {
    shopId: ShopId;
    targetPlayerId?: string;
    targetLocation?: Axial;
  }) => {
    this.emit("shop-purchase", payload);
  };
  private readonly handleZarkansDonation = (
    selection: ZarkanDonationSelection
  ) => {
    this.emit("donate-zarkans", selection);
  };
  private readyPointerIsDown = false;
  private readonly handleReadyPointerDown = (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (
      !this.readyEnabled ||
      !this.isTutorialReadyAllowed() ||
      this.getUnspentSkillPoints() > 0
    ) {
      return;
    }
    this.readyPointerIsDown = true;
    event.stopPropagation();
  };
  private readonly handleReadyPointerOut = () => {
    this.readyPointerIsDown = false;
  };
  private readonly handleReadyPointerUp = (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (this.readyPointerIsDown) {
      this.readyPointerIsDown = false;
      this.handleReadyToggle();
    }
    event.stopPropagation();
  };
  private readonly handleSecondaryActionSelection = (
    actionId: string | null
  ) => {
    this.secondaryActionSelection = actionId ?? null;
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
    if (!this.secondaryActionSelection) {
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
      this.setSecondaryInspectSecondTargetPlayer(null, false);
      this.setSecondaryActionPriorityItems([], false);
    } else if (
      this.secondaryActionSelection === "feed" &&
      this.currentUserId &&
      !this.secondaryActionTargetPlayerId
    ) {
      this.setSecondaryActionTargetPlayer(this.currentUserId, false);
    }
    if (
      this.hasExtraSecondaryAction() &&
      this.secondaryActionSelection &&
      this.secondaryActionSelection === this.extraSecondaryActionSelection
    ) {
      this.extraSecondaryActionDropdown.setValue(null, false);
      this.handleExtraSecondaryActionSelection(null);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshSecondaryExtraExecutionSelectorState();
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryChemicalTargetState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshSecondaryInspectAdditionalTargetState();
    this.refreshSecondaryItemSelectorState();
    this.refreshSecondarySearchPriorityState();
    this.refreshSecondaryDropSellState();
    this.refreshExtraSecondaryDropdownItems();
    this.emitSecondaryActionChange();
  };
  private readonly handleSecondaryLocationPickRequest = () => {
    if (
      !this.secondaryActionSelection ||
      !this.selectedSecondaryActionSupportsLocation()
    ) {
      return;
    }
    this.emit("secondary-action-location-request");
  };
  private readonly handleExtraSecondaryActionSelection = (
    actionId: string | null
  ) => {
    this.extraSecondaryActionSelection = actionId ?? null;
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
    if (!this.extraSecondaryActionSelection) {
      this.setExtraSecondaryActionTarget(null, false);
      this.setExtraSecondaryActionTargetPlayer(null, false);
      this.setExtraSecondaryActionPriorityItems([], false);
    }
    if (
      this.hasExtraSecondaryAction() &&
      this.extraSecondaryActionSelection &&
      this.extraSecondaryActionSelection === this.secondaryActionSelection
    ) {
      this.secondaryActionDropdown.setValue(null, false);
      this.handleSecondaryActionSelection(null);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshExtraSecondaryExecutionSelectorState();
    this.refreshExtraSecondaryLocationSelectorState();
    this.refreshExtraSecondaryChemicalTargetState();
    this.refreshExtraSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
    this.refreshExtraSecondarySearchPriorityState();
    this.refreshExtraSecondaryDropSellState();
    this.refreshSecondaryDropdownItems();
    this.emitExtraSecondaryActionChange();
  };
  private readonly handleExtraSecondaryLocationPickRequest = () => {
    if (
      !this.extraSecondaryActionSelection ||
      !this.selectedExtraSecondaryActionSupportsLocation()
    ) {
      return;
    }
    this.emit("extra-secondary-action-location-request");
  };
  private readonly handleExtraSecondaryLocationClear = () => {
    this.setExtraSecondaryActionTarget(null, true);
  };
  private readonly handleExtraSecondaryPlayerSelection = (
    playerId: string | null
  ) => {
    this.setExtraSecondaryActionTargetPlayer(playerId ?? null, true);
  };
  private readonly handleExtraSecondaryItemPriorityChange = (
    itemIds: string[]
  ) => {
    this.setExtraSecondaryActionPriorityItems(itemIds ?? [], true);
  };
  private readonly handleSecondaryInspectAdditionalTargetToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.secondaryInspectAdditionalTargetToggle.visible) {
      return;
    }
    this.secondaryInspectAdditionalTarget =
      !this.secondaryInspectAdditionalTarget;
    this.updateInspectAdditionalTargetToggleText();
    this.refreshSecondaryInspectSecondPlayerSelectorState();
    this.emitSecondaryActionChange();
    event.stopPropagation();
  };
  private readonly handleSecondaryInspectSecondPlayerSelection = (
    playerId: string | null
  ) => {
    this.setSecondaryInspectSecondTargetPlayer(playerId ?? null, true);
  };
  private readonly handleSecondarySearchPriorityToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.secondarySearchPriorityToggle.visible) {
      return;
    }
    this.secondaryPrioritizeFoodDrink = !this.secondaryPrioritizeFoodDrink;
    this.updateSearchPriorityToggleText(
      this.secondarySearchPriorityToggle,
      this.secondaryPrioritizeFoodDrink
    );
    this.emitSecondaryActionChange();
    event.stopPropagation();
  };
  private readonly handleExtraSecondarySearchPriorityToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.extraSecondarySearchPriorityToggle.visible) {
      return;
    }
    this.extraSecondaryPrioritizeFoodDrink =
      !this.extraSecondaryPrioritizeFoodDrink;
    this.updateSearchPriorityToggleText(
      this.extraSecondarySearchPriorityToggle,
      this.extraSecondaryPrioritizeFoodDrink
    );
    this.emitExtraSecondaryActionChange();
    event.stopPropagation();
  };
  private readonly handleSecondaryDropSellToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.secondaryDropSellToggle.visible) {
      return;
    }
    this.secondarySellInstead = !this.secondarySellInstead;
    this.updateDropSellToggleText(
      this.secondaryDropSellToggle,
      this.secondarySellInstead
    );
    this.emitSecondaryActionChange();
    event.stopPropagation();
  };
  private readonly handleExtraSecondaryDropSellToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.extraSecondaryDropSellToggle.visible) {
      return;
    }
    this.extraSecondarySellInstead = !this.extraSecondarySellInstead;
    this.updateDropSellToggleText(
      this.extraSecondaryDropSellToggle,
      this.extraSecondarySellInstead
    );
    this.emitExtraSecondaryActionChange();
    event.stopPropagation();
  };
  private readonly handleSecondaryChemicalTargetToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.secondaryChemicalTargetToggle.visible) {
      return;
    }
    this.secondaryChemicalSingleTarget = !this.secondaryChemicalSingleTarget;
    this.updateChemicalTargetToggleText(
      this.secondaryChemicalTargetToggle,
      this.secondaryChemicalSingleTarget
    );
    if (!this.secondaryChemicalSingleTarget) {
      this.setSecondaryActionTargetPlayer(null, false);
    }
    this.refreshSecondaryPlayerSelectorState();
    this.emitSecondaryActionChange();
    this.updateScrollLayout();
    event.stopPropagation();
  };
  private readonly handleExtraSecondaryChemicalTargetToggle = (
    _pointer: Phaser.Input.Pointer,
    _localX: number,
    _localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
    if (!this.extraSecondaryChemicalTargetToggle.visible) {
      return;
    }
    this.extraSecondaryChemicalSingleTarget =
      !this.extraSecondaryChemicalSingleTarget;
    this.updateChemicalTargetToggleText(
      this.extraSecondaryChemicalTargetToggle,
      this.extraSecondaryChemicalSingleTarget
    );
    if (!this.extraSecondaryChemicalSingleTarget) {
      this.setExtraSecondaryActionTargetPlayer(null, false);
    }
    this.refreshExtraSecondaryPlayerSelectorState();
    this.emitExtraSecondaryActionChange();
    this.updateScrollLayout();
    event.stopPropagation();
  };
  private readonly handleSecondaryLocationClear = () => {
    this.setSecondaryActionTarget(null, true);
  };
  private readonly handleSecondaryPlayerSelection = (
    playerId: string | null
  ) => {
    this.setSecondaryActionTargetPlayer(playerId ?? null, true);
  };
  private readonly handleSecondaryItemPriorityChange = (itemIds: string[]) => {
    this.setSecondaryActionPriorityItems(itemIds ?? [], true);
  };
  private readonly handleActionModalOpen = () => {
    this.gridModalOpenCount += 1;
    if (this.gridModalOpenCount === 1) {
      this.scrollPanel?.setMouseWheelScrollerEnable?.(false);
      this.scrollPanel?.setScrollerEnable?.(false);
      this.skillsView?.setScrollerEnable?.(false);
      this.shopView?.setScrollerEnable(false);
      this.playersTabView?.setScrollerEnable?.(false);
      this.emit("grid-modal-open");
    }
  };
  private readonly handleActionModalClose = () => {
    this.gridModalOpenCount = Math.max(0, this.gridModalOpenCount - 1);
    if (this.gridModalOpenCount === 0) {
      this.scrollPanel?.setMouseWheelScrollerEnable?.(true);
      this.scrollPanel?.setScrollerEnable?.(true);
      this.skillsView?.setScrollerEnable?.(true);
      this.shopView?.setScrollerEnable(true);
      this.playersTabView?.setScrollerEnable?.(true);
      this.emit("grid-modal-close");
    }
  };
  private readonly handleLogElimination = (payload: LogEliminationPayload) => {
    const sprite = this.playerOptionSkinCache.resolve(
      payload.playerId,
      this.playerAccounts.get(payload.playerId)?.cosmetics.selectedSkinId ??
        null,
      this.currentUserId,
      this.currentPlayerSkin,
      1
    );
    const eventPayload: PlayerEliminatedPayload = {
      playerId: payload.playerId,
      playerName: payload.playerName,
      texture: sprite.texture,
      frame: sprite.frame ?? DEFAULT_SKIN.body,
      turn: payload.turn
    };
    this.emit("player-eliminated", eventPayload);
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width = DEFAULT_WIDTH,
    height: number = scene.scale.height
  ) {
    super(scene, x, y);

    this.panelWidth = width;
    this.panelHeight = height;
    this.setSize(width, height);
    this.setScrollFactor(0);
    scene.add.existing(this);
    this.playerOptionSkinCache = new PlayerOptionSkinCache(scene);
    this.setDepth(1000);
    this.background = scene.add
      .rectangle(0, 0, width, height, 0x151a2f, 0.92)
      .setOrigin(0, 0)
      .setInteractive();
    this.add(this.background);
    const tabWidth = width / this.tabConfigs.length;
    this.tabConfigs.forEach((tab, index) => {
      const isDefaultTab = tab.key === this.tabConfigs[0]?.key;
      const rect = scene.add
        .rectangle(
          index * tabWidth,
          0,
          tabWidth,
          TAB_HEIGHT,
          isDefaultTab ? 0x253055 : 0x1c233f
        )
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const text = scene.add
        .text(index * tabWidth + tabWidth / 2, TAB_HEIGHT / 2, tab.label, {
          fontSize: "16px",
          color: "#ffffff"
        })
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      const badge = scene.add
        .rectangle(index * tabWidth + tabWidth - 10, 6, 8, 8, 0xff6600)
        .setOrigin(0.5, 0)
        .setVisible(false);
      rect.on(Phaser.Input.Events.POINTER_UP, () => {
        this.handleTabRequest(tab.key as TabKey);
      });
      text.on(Phaser.Input.Events.POINTER_UP, () => {
        this.handleTabRequest(tab.key as TabKey);
      });
      this.add(rect);
      this.add(text);
      this.add(badge);
      this.tabs.push({ key: tab.key as TabKey, rect, text, badge });
    });

    this.tabPreviousButton = scene.add
      .rectangle(0, 0, TAB_ARROW_WIDTH, TAB_HEIGHT, 0x1c233f)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.tabPreviousText = scene.add
      .text(TAB_ARROW_WIDTH / 2, TAB_HEIGHT / 2, "‹", {
        fontSize: "28px",
        color: "#ffffff"
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.tabNextButton = scene.add
      .rectangle(0, 0, TAB_ARROW_WIDTH, TAB_HEIGHT, 0x1c233f)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.tabNextText = scene.add
      .text(0, TAB_HEIGHT / 2, "›", {
        fontSize: "28px",
        color: "#ffffff"
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    this.tabLayout = new CharacterPanelTabLayout(
      this.tabs,
      this.tabPreviousButton,
      this.tabPreviousText,
      this.tabNextButton,
      this.tabNextText,
      () => this.panelWidth,
      (key) => this.tabsController?.isTabUnread(key) ?? false
    );
    this.tabPreviousButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.tabLayout.move(-1);
    });
    this.tabPreviousText.on(Phaser.Input.Events.POINTER_UP, () => {
      this.tabLayout.move(-1);
    });
    this.tabNextButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.tabLayout.move(1);
    });
    this.tabNextText.on(Phaser.Input.Events.POINTER_UP, () => {
      this.tabLayout.move(1);
    });
    this.add(this.tabPreviousButton);
    this.add(this.tabPreviousText);
    this.add(this.tabNextButton);
    this.add(this.tabNextText);
    this.tabLayout.layout(width);

    const contentTop = TAB_HEIGHT + MARGIN;
    const subtabY = TAB_HEIGHT + 8;
    const subtabHeight = 28;
    const subtabBottom = subtabY + subtabHeight + 8;

    this.characterSubtabs = new Subtabs<CharacterSubTabKey>({
      scene,
      parent: this,
      x: MARGIN + 12,
      y: subtabY,
      width: width - MARGIN * 2 - 24,
      height: subtabHeight,
      tabs: [
        { key: "status", label: "Status" },
        { key: "skills", label: "Skills" }
      ],
      defaultKey: "status",
      onChange: () => {
        this.updateCharacterSubtabVisibility();
      }
    });

    const statusContentTop = subtabBottom + 14;
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    this.statusView = new CharacterPanelStatusView(scene, this, {
      margin: MARGIN,
      portraitSize: PORTRAIT_SIZE,
      barWidth: width - (PORTRAIT_SIZE + MARGIN * 3),
      contentTop: statusContentTop,
      barHeight: BAR_HEIGHT
    });
    const readyY = statusContentTop + 80;
    this.readyToggle = scene.add
      .text(barX, readyY, "[ ] Ready", {
        fontSize: "15px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    this.readyToggle.setInteractive({ useHandCursor: true });
    this.readyToggle.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleReadyPointerDown
    );
    this.readyToggle.on(
      Phaser.Input.Events.POINTER_OUT,
      this.handleReadyPointerOut
    );
    this.readyToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleReadyPointerUp
    );
    this.add(this.readyToggle);
    this.unspentSkillsWarning = scene.add
      .text(barX + this.readyToggle.width + 12, readyY + 1, "", {
        fontSize: "14px",
        color: THEME.colors.warning
      })
      .setOrigin(0, 0)
      .setVisible(false);
    this.add(this.unspentSkillsWarning);
    this.setReadyEnabled(false);

    this.scrollContent = scene.add.container(0, 0);
    const initialScrollWidth = Math.max(120, width - MARGIN * 2);
    this.scrollContentWidth = initialScrollWidth;
    const estimatedScrollTop = readyY + this.readyToggle.height + 24;
    this.scrollTop = estimatedScrollTop;
    const estimatedScrollHeight = Math.max(
      200,
      height - estimatedScrollTop - MARGIN
    );

    const matrix = this.getWorldTransformMatrix();
    const worldX = matrix.tx + MARGIN;
    const worldY = matrix.ty + estimatedScrollTop;

    this.scrollMaskShape = scene.add
      .rectangle(
        worldX,
        worldY,
        initialScrollWidth + 100,
        estimatedScrollHeight,
        0xffffff,
        0
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.scrollMask = this.scrollMaskShape.createGeometryMask();

    this.scrollPanel = scene.rexUI.add.scrollablePanel({
      x: MARGIN,
      y: estimatedScrollTop,
      width: initialScrollWidth,
      height: estimatedScrollHeight,
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
    }) as ScrollablePanelInstance;
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
    this.add(this.scrollPanel);

    const boxWidth = initialScrollWidth;
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
      mobileCellIcons: true,
      prebuildMobileCells: true
    });
    this.scrollContent.add(this.mainActionDropdown);
    this.mainActionDropdown.on("change", this.handleMainActionSelection);
    this.mainActionDropdown.on("modal-open", this.handleActionModalOpen);
    this.mainActionDropdown.on("modal-close", this.handleActionModalClose);
    this.extraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.mainActionDropdownWidth
    );
    this.extraExecutionSelector.setEnabled(false);
    this.extraExecutionSelector.setVisible(false);
    this.extraExecutionSelector.setActive(false);
    this.extraExecutionSelector.on(
      "change",
      this.handleMainExtraExecutionChange
    );
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
    this.locationSelector.on("pick-request", this.handleLocationPickRequest);
    this.locationSelector.on("clear-request", this.handleLocationClear);
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
    this.secondLocationSelector.on(
      "pick-request",
      this.handleSecondLocationPickRequest
    );
    this.secondLocationSelector.on(
      "clear-request",
      this.handleSecondLocationClear
    );
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
    this.playerSelector.on("change", this.handlePlayerSelection);
    this.playerSelector.on("modal-open", this.handleActionModalOpen);
    this.playerSelector.on("modal-close", this.handleActionModalClose);
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
    this.scareSecondPlayerSelector.on(
      "change",
      this.handleScareSecondPlayerSelection
    );
    this.scareSecondPlayerSelector.on("modal-open", this.handleActionModalOpen);
    this.scareSecondPlayerSelector.on("modal-close", this.handleActionModalClose);
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
    this.itemSelector.on("change", this.handleItemPriorityChange);
    this.itemSelector.on("modal-open", this.handleActionModalOpen);
    this.itemSelector.on("modal-close", this.handleActionModalClose);
    this.scrollContent.add(this.itemSelector);
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
      mobileCellIcons: true,
      prebuildMobileCells: true
    });
    this.scrollContent.add(this.secondaryActionDropdown);
    this.secondaryActionDropdown.on(
      "change",
      this.handleSecondaryActionSelection
    );
    this.secondaryActionDropdown.on("modal-open", this.handleActionModalOpen);
    this.secondaryActionDropdown.on("modal-close", this.handleActionModalClose);
    this.secondaryExtraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.secondaryActionDropdownWidth
    );
    this.secondaryExtraExecutionSelector.setEnabled(false);
    this.secondaryExtraExecutionSelector.setVisible(false);
    this.secondaryExtraExecutionSelector.setActive(false);
    this.secondaryExtraExecutionSelector.on(
      "change",
      this.handleSecondaryExtraExecutionChange
    );
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
    this.secondaryLocationSelector.on(
      "pick-request",
      this.handleSecondaryLocationPickRequest
    );
    this.secondaryLocationSelector.on(
      "clear-request",
      this.handleSecondaryLocationClear
    );
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
    this.secondaryPlayerSelector.on(
      "change",
      this.handleSecondaryPlayerSelection
    );
    this.secondaryPlayerSelector.on("modal-open", this.handleActionModalOpen);
    this.secondaryPlayerSelector.on("modal-close", this.handleActionModalClose);
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
    this.secondaryInspectSecondPlayerSelector.setLabel(
      "Additional inspected player"
    );
    this.secondaryInspectSecondPlayerSelector.setEnabled(false);
    this.secondaryInspectSecondPlayerSelector.setVisible(false);
    this.secondaryInspectSecondPlayerSelector.setActive(false);
    this.secondaryInspectSecondPlayerSelector.on(
      "change",
      this.handleSecondaryInspectSecondPlayerSelection
    );
    this.secondaryInspectSecondPlayerSelector.on(
      "modal-open",
      this.handleActionModalOpen
    );
    this.secondaryInspectSecondPlayerSelector.on(
      "modal-close",
      this.handleActionModalClose
    );
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
    this.secondaryItemSelector.on(
      "change",
      this.handleSecondaryItemPriorityChange
    );
    this.secondaryItemSelector.on("modal-open", this.handleActionModalOpen);
    this.secondaryItemSelector.on("modal-close", this.handleActionModalClose);
    this.scrollContent.add(this.secondaryItemSelector);
    this.secondarySearchPriorityToggle = scene.add
      .text(0, 0, "[ ] Prioritize food/drink", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondarySearchPriorityToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondarySearchPriorityToggle
    );
    this.scrollContent.add(this.secondarySearchPriorityToggle);
    this.secondaryDropSellToggle = scene.add
      .text(0, 0, "[ ] Sell instead", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondaryDropSellToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryDropSellToggle
    );
    this.scrollContent.add(this.secondaryDropSellToggle);
    this.secondaryChemicalTargetToggle = scene.add
      .text(0, 0, "[ ] Single target (Area)", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.secondaryChemicalTargetToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryChemicalTargetToggle
    );
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
      mobileCellIcons: true,
      prebuildMobileCells: true
    });
    this.extraSecondaryActionDropdown.setVisible(false);
    this.scrollContent.add(this.extraSecondaryActionDropdown);
    this.extraSecondaryActionDropdown.on(
      "change",
      this.handleExtraSecondaryActionSelection
    );
    this.extraSecondaryActionDropdown.on(
      "modal-open",
      this.handleActionModalOpen
    );
    this.extraSecondaryActionDropdown.on(
      "modal-close",
      this.handleActionModalClose
    );
    this.extraSecondaryExtraExecutionSelector = new ExtraExecutionSelector(
      scene,
      0,
      0,
      this.extraSecondaryActionDropdownWidth
    );
    this.extraSecondaryExtraExecutionSelector.setEnabled(false);
    this.extraSecondaryExtraExecutionSelector.setVisible(false);
    this.extraSecondaryExtraExecutionSelector.setActive(false);
    this.extraSecondaryExtraExecutionSelector.on(
      "change",
      this.handleExtraSecondaryExtraExecutionChange
    );
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
    this.extraSecondaryLocationSelector.on(
      "pick-request",
      this.handleExtraSecondaryLocationPickRequest
    );
    this.extraSecondaryLocationSelector.on(
      "clear-request",
      this.handleExtraSecondaryLocationClear
    );
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
    this.extraSecondaryPlayerSelector.on(
      "change",
      this.handleExtraSecondaryPlayerSelection
    );
    this.extraSecondaryPlayerSelector.on(
      "modal-open",
      this.handleActionModalOpen
    );
    this.extraSecondaryPlayerSelector.on(
      "modal-close",
      this.handleActionModalClose
    );
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
    this.extraSecondaryItemSelector.on(
      "change",
      this.handleExtraSecondaryItemPriorityChange
    );
    this.extraSecondaryItemSelector.on(
      "modal-open",
      this.handleActionModalOpen
    );
    this.extraSecondaryItemSelector.on(
      "modal-close",
      this.handleActionModalClose
    );
    this.scrollContent.add(this.extraSecondaryItemSelector);
    this.extraSecondarySearchPriorityToggle = scene.add
      .text(0, 0, "[ ] Prioritize food/drink", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondarySearchPriorityToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondarySearchPriorityToggle
    );
    this.scrollContent.add(this.extraSecondarySearchPriorityToggle);
    this.extraSecondaryDropSellToggle = scene.add
      .text(0, 0, "[ ] Sell instead", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondaryDropSellToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondaryDropSellToggle
    );
    this.scrollContent.add(this.extraSecondaryDropSellToggle);
    this.extraSecondaryChemicalTargetToggle = scene.add
      .text(0, 0, "[ ] Single target (Area)", {
        fontSize: "13px",
        color: "#facc15"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.extraSecondaryChemicalTargetToggle.on(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondaryChemicalTargetToggle
    );
    this.scrollContent.add(this.extraSecondaryChemicalTargetToggle);
    this.updateScrollLayout();
    this.inventoryView = new CharacterPanelInventoryView(scene, this, {
      margin: MARGIN,
      contentTop,
      boxWidth,
      panelHeight: height
    });
    this.itemsElements = this.inventoryView.getElements();
    this.shopView = new CharacterPanelShopView(scene, this, {
      margin: MARGIN,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight
    });
    this.shopView.on("testament-change", this.handleTestamentChange, this);
    this.shopView.on("shop-purchase", this.handleShopPurchase, this);
    this.shopView.on("donate-zarkans", this.handleZarkansDonation, this);
    this.shopView.on("modal-open", this.handleActionModalOpen, this);
    this.shopView.on("modal-close", this.handleActionModalClose, this);
    this.shopElements = this.shopView.getElements();
    this.playersTabView = new CharacterPanelPlayerListView(scene, this, {
      margin: MARGIN,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight
    });
    this.playersElements = this.playersTabView.getElements();
    const logControlY = contentTop;
    const baseX = MARGIN + 12;
    const logPrevButton = scene.add
      .text(baseX, logControlY, "◀", {
        fontSize: "18px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const logTurnLabel = scene.add
      .text(baseX + 32, logControlY, "Turn 0 / 0", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    const logNextButton = scene.add
      .text(baseX + 160, logControlY, "▶", {
        fontSize: "18px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const logPlayButton = scene.add
      .text(baseX + 200, logControlY, "Play", {
        fontSize: "16px",
        color: "#4ade80"
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const logBoxY = contentTop + 48;
    const logBoxHeight = Math.max(BOX_HEIGHT, height - logBoxY - MARGIN);
    const logEventsBox = scene.add
      .rectangle(MARGIN, logBoxY, boxWidth, logBoxHeight, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    const logStatusText = scene.add
      .text(MARGIN + 16, logBoxY + 16, "No replays yet.", {
        fontSize: "15px",
        color: "#cbd5f5"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    const logEventsText = scene.add
      .text(MARGIN + 16, logBoxY + 16, "", {
        fontSize: "15px",
        color: "#cbd5f5",
        wordWrap: {
          width: boxWidth - 32,
          useAdvancedWrap: true
        }
      })
      .setOrigin(0, 0)
      .setVisible(false);
    this.add(logPrevButton);
    this.add(logTurnLabel);
    this.add(logNextButton);
    this.add(logPlayButton);
    this.add(logEventsBox);
    this.add(logStatusText);
    this.add(logEventsText);
    this.logView = new CharacterPanelLogView({
      panel: this,
      elements: {
        prevButton: logPrevButton,
        nextButton: logNextButton,
        playButton: logPlayButton,
        turnLabel: logTurnLabel,
        statusText: logStatusText,
        eventsBox: logEventsBox,
        eventsText: logEventsText
      },
      onRequestReplay: (turn) => {
        this.emit("log-turn-request", turn);
      },
      onPlay: (turn) => {
        this.emit("log-play-manual", turn);
      },
      formatActionName: (id) => formatActionLabel(id),
      onElimination: this.handleLogElimination
    });
    this.logView.handleVisibilityChange({ visible: false, forceEnsure: false });
    this.logView.setTurnInfo(0);
    this.logView.layout({
      margin: MARGIN,
      tabHeight: TAB_HEIGHT,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight
    });
    this.chatView = new CharacterPanelChatView({
      scene,
      onSend: (message) => {
        this.emit("chat-send", message);
      },
      onFocusChange: (focused) => {
        this.emit("chat-focus-change", focused);
      }
    });
    this.chatElements = this.chatView.getElements();
    for (const element of this.chatElements) {
      this.add(element);
    }
    this.chatView.handleVisibilityChange(false);
    this.chatView.layout({
      margin: MARGIN,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight
    });
    this.skillsView = new CharacterPanelSkillsView(scene, this, {
      margin: MARGIN,
      contentTop: subtabBottom,
      boxWidth: width - MARGIN * 2,
      panelHeight: this.panelHeight
    });
    this.skillsView.setOnConfirmSkills((skillIds) => {
      this.emit("apply-skills", skillIds);
    });
    this.statusElements = [
      ...this.statusView.getElements(),
      this.readyToggle
    ];
    if (this.scrollPanel) {
      this.statusElements.push(this.scrollPanel);
    }
    this.characterElements = [...this.characterSubtabs.getElements()];
    this.tabsController = new CharacterPanelTabs({
      tabs: this.tabs,
      defaultKey: "character",
      characterElements: this.characterElements,
      itemsElements: this.itemsElements,
      shopElements: this.shopElements,
      playersElements: this.playersElements,
      chatElements: this.chatElements,
      onCharacterTabShow: () => {
        this.updateCharacterSubtabVisibility();
      },
      onCharacterTabHide: () => {
        this.hideCharacterTabContents();
      },
      onItemsTabShow: () => {
        this.inventoryView.setActive(true);
      },
      onItemsTabHide: () => {
        this.inventoryView.setActive(false);
      },
      onShopTabShow: () => {
        this.shopView.setVisible(true);
        this.shopView.setScrollerEnable(true);
      },
      onShopTabHide: () => {
        this.shopView.setVisible(false);
      },
      onPlayersTabShow: () => {
        this.playersTabView.refresh();
      },
      onPlayersTabHide: () => {
        this.playersTabView.clearSelectionStyles();
      },
      onChatTabShow: () => {
        this.tabsController.setTabUnread("chat", false);
        this.chatView.handleVisibilityChange(true);
        this.emit("chat-tab-opened");
      },
      onChatTabHide: () => {
        this.chatView.handleVisibilityChange(false);
        this.emit("chat-tab-closed");
      },
      onLogVisibilityChange: ({ visible, forceEnsure }) => {
        this.logView.handleVisibilityChange({ visible, forceEnsure });
      },
      onTabChange: (key, previous) => {
        this.tabLayout.reveal(key);
        this.emit("tab-change", key, previous);
      },
      onLogTabOpened: () => {
        this.emit("log-tab-opened");
      },
      onLogTabClosed: () => {
        this.emit("log-tab-closed");
      }
    });
    this.tabsController.refresh();
    this.bringToTop(this.mainActionDropdown);
    this.bringToTop(this.locationSelector);
    this.bringToTop(this.secondLocationSelector);
    this.bringToTop(this.playerSelector);
    this.bringToTop(this.scareSecondPlayerSelector);
    this.bringToTop(this.secondaryActionDropdown);
    this.bringToTop(this.secondaryLocationSelector);
    this.bringToTop(this.secondaryPlayerSelector);
    this.bringToTop(this.secondaryInspectAdditionalTargetToggle);
    this.bringToTop(this.secondaryInspectSecondPlayerSelector);
    this.bringToTop(this.extraSecondaryActionDropdown);
    this.bringToTop(this.extraSecondaryLocationSelector);
    this.bringToTop(this.extraSecondaryPlayerSelector);
    this.bringToTop(this.readyToggle);
    for (const tab of this.tabs) {
      this.bringToTop(tab.rect);
      this.bringToTop(tab.text);
      if (tab.badge) {
        this.bringToTop(tab.badge);
      }
    }
    this.bringToTop(this.tabPreviousButton);
    this.bringToTop(this.tabPreviousText);
    this.bringToTop(this.tabNextButton);
    this.bringToTop(this.tabNextText);
    this.playersTabView.bringSubtabsToTop();
    for (const element of this.characterSubtabs.getElements()) {
      this.bringToTop(element);
    }
  }

  override destroy(fromScene?: boolean) {
    this.mainActionDropdown.off("change", this.handleMainActionSelection);
    this.mainActionDropdown.off("modal-open", this.handleActionModalOpen);
    this.mainActionDropdown.off("modal-close", this.handleActionModalClose);
    try {
      this.mainActionDropdown.hideModal();
    } catch (e) {
      console.warn("hideModal mainActionDropdown skipped during teardown", e);
    }
    this.extraExecutionSelector.off(
      "change",
      this.handleMainExtraExecutionChange
    );
    this.locationSelector.off("pick-request", this.handleLocationPickRequest);
    this.locationSelector.off("clear-request", this.handleLocationClear);
    this.secondLocationSelector.off(
      "pick-request",
      this.handleSecondLocationPickRequest
    );
    this.secondLocationSelector.off(
      "clear-request",
      this.handleSecondLocationClear
    );
    this.playerSelector.off("change", this.handlePlayerSelection);
    this.playerSelector.off("modal-open", this.handleActionModalOpen);
    this.playerSelector.off("modal-close", this.handleActionModalClose);
    try {
      this.playerSelector.hideDropdown();
    } catch (e) {
      console.warn("hideDropdown playerSelector skipped during teardown", e);
    }
    this.scareSecondPlayerSelector.off(
      "change",
      this.handleScareSecondPlayerSelection
    );
    this.scareSecondPlayerSelector.off(
      "modal-open",
      this.handleActionModalOpen
    );
    this.scareSecondPlayerSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.scareSecondPlayerSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown scareSecondPlayerSelector skipped during teardown",
        e
      );
    }
    this.itemSelector.off("change", this.handleItemPriorityChange);
    this.itemSelector.off("modal-open", this.handleActionModalOpen);
    this.itemSelector.off("modal-close", this.handleActionModalClose);
    try {
      this.itemSelector.hideDropdown();
    } catch (e) {
      console.warn("hideDropdown itemSelector skipped during teardown", e);
    }
    this.secondaryActionDropdown.off(
      "change",
      this.handleSecondaryActionSelection
    );
    this.secondaryActionDropdown.off("modal-open", this.handleActionModalOpen);
    this.secondaryActionDropdown.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.secondaryActionDropdown.hideModal();
    } catch (e) {
      console.warn(
        "hideModal secondaryActionDropdown skipped during teardown",
        e
      );
    }
    this.secondaryExtraExecutionSelector.off(
      "change",
      this.handleSecondaryExtraExecutionChange
    );
    this.secondaryLocationSelector.off(
      "pick-request",
      this.handleSecondaryLocationPickRequest
    );
    this.secondaryLocationSelector.off(
      "clear-request",
      this.handleSecondaryLocationClear
    );
    this.secondaryPlayerSelector.off(
      "change",
      this.handleSecondaryPlayerSelection
    );
    this.secondaryPlayerSelector.off("modal-open", this.handleActionModalOpen);
    this.secondaryPlayerSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.secondaryPlayerSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown secondaryPlayerSelector skipped during teardown",
        e
      );
    }
    this.secondaryInspectAdditionalTargetToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryInspectAdditionalTargetToggle
    );
    this.secondaryInspectSecondPlayerSelector.off(
      "change",
      this.handleSecondaryInspectSecondPlayerSelection
    );
    this.secondaryInspectSecondPlayerSelector.off(
      "modal-open",
      this.handleActionModalOpen
    );
    this.secondaryInspectSecondPlayerSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.secondaryInspectSecondPlayerSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown secondaryInspectSecondPlayerSelector skipped during teardown",
        e
      );
    }
    this.secondaryItemSelector.off(
      "change",
      this.handleSecondaryItemPriorityChange
    );
    this.secondaryItemSelector.off("modal-open", this.handleActionModalOpen);
    this.secondaryItemSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.secondaryItemSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown secondaryItemSelector skipped during teardown",
        e
      );
    }
    this.extraSecondaryActionDropdown.off(
      "change",
      this.handleExtraSecondaryActionSelection
    );
    this.extraSecondaryActionDropdown.off("modal-open", this.handleActionModalOpen);
    this.extraSecondaryActionDropdown.off("modal-close", this.handleActionModalClose);
    try {
      this.extraSecondaryActionDropdown.hideModal();
    } catch (e) {
      console.warn(
        "hideModal extraSecondaryActionDropdown skipped during teardown",
        e
      );
    }
    this.extraSecondaryExtraExecutionSelector.off(
      "change",
      this.handleExtraSecondaryExtraExecutionChange
    );
    this.extraSecondaryLocationSelector.off(
      "pick-request",
      this.handleExtraSecondaryLocationPickRequest
    );
    this.extraSecondaryLocationSelector.off(
      "clear-request",
      this.handleExtraSecondaryLocationClear
    );
    this.extraSecondaryPlayerSelector.off(
      "change",
      this.handleExtraSecondaryPlayerSelection
    );
    this.extraSecondaryPlayerSelector.off(
      "modal-open",
      this.handleActionModalOpen
    );
    this.extraSecondaryPlayerSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    this.secondarySearchPriorityToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondarySearchPriorityToggle
    );
    this.secondaryChemicalTargetToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryChemicalTargetToggle
    );
    this.secondaryDropSellToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleSecondaryDropSellToggle
    );
    this.extraSecondarySearchPriorityToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondarySearchPriorityToggle
    );
    this.extraSecondaryChemicalTargetToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondaryChemicalTargetToggle
    );
    this.extraSecondaryDropSellToggle.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleExtraSecondaryDropSellToggle
    );
    try {
      this.extraSecondaryPlayerSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown extraSecondaryPlayerSelector skipped during teardown",
        e
      );
    }
    this.extraSecondaryItemSelector.off(
      "change",
      this.handleExtraSecondaryItemPriorityChange
    );
    this.extraSecondaryItemSelector.off(
      "modal-open",
      this.handleActionModalOpen
    );
    this.extraSecondaryItemSelector.off(
      "modal-close",
      this.handleActionModalClose
    );
    try {
      this.extraSecondaryItemSelector.hideDropdown();
    } catch (e) {
      console.warn(
        "hideDropdown extraSecondaryItemSelector skipped during teardown",
        e
      );
    }
    this.gridModalOpenCount = 0;
    this.readyToggle?.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleReadyPointerDown
    );
    this.readyToggle?.off(
      Phaser.Input.Events.POINTER_OUT,
      this.handleReadyPointerOut
    );
    this.readyToggle?.off(
      Phaser.Input.Events.POINTER_UP,
      this.handleReadyPointerUp
    );
    this.characterSubtabs?.destroy();
    this.skillsView?.destroy();
    this.shopView?.off("testament-change", this.handleTestamentChange, this);
    this.shopView?.off("shop-purchase", this.handleShopPurchase, this);
    this.shopView?.off("donate-zarkans", this.handleZarkansDonation, this);
    this.shopView?.off("modal-open", this.handleActionModalOpen, this);
    this.shopView?.off("modal-close", this.handleActionModalClose, this);
    this.shopView?.destroy();
    this.logView?.destroy();
    this.chatView?.destroy();
    this.playersTabView?.destroy();
    this.scrollPanel?.clearMask?.();
    this.scrollMask?.destroy();
    this.scrollMaskShape?.destroy();
    this.scrollPanel = null;
    this.scrollMask = null;
    this.scrollMaskShape = null;
    this.playerOptionSkinCache.dispose();
    this.statusView.destroy();
    this.inventoryView.destroy();
    super.destroy(fromScene);
  }

  private updateCharacterSubtabVisibility(): void {
    const isCharacterTabActive =
      this.tabsController.getActiveTab() === "character";
    if (!isCharacterTabActive) {
      this.hideCharacterTabContents();
      return;
    }

    this.characterSubtabs.setVisible(true);
    const activeSubtab = this.characterSubtabs.getActiveKey();

    if (activeSubtab === "status") {
      this.skillsView.setVisible(false);
      this.showStatusElements();
    } else {
      this.hideStatusElements();
      this.skillsView.setVisible(true);
    }
  }

  private showStatusElements(): void {
    for (const obj of this.statusElements) {
      const target = obj as Phaser.GameObjects.GameObject & {
        setVisible?: (value: boolean) => void;
        setActive?: (value: boolean) => void;
      };
      target.setVisible?.(true);
      target.setActive?.(true);
    }
    this.scrollPanel?.setMouseWheelScrollerEnable?.(true);
    this.scrollPanel?.setScrollerEnable?.(true);
    this.mainActionDropdown.setVisible(true);
    this.mainActionDropdown.setActive(true);
    this.refreshExtraExecutionSelectorState();
    this.refreshLocationSelectorState();
    this.refreshPlayerSelectorState();
    this.refreshItemSelectorState();
    this.secondaryActionDropdown.setVisible(true);
    this.secondaryActionDropdown.setActive(true);
    const hasExtraSecondaryAction = this.hasExtraSecondaryAction();
    this.extraSecondaryActionBox.setVisible(hasExtraSecondaryAction);
    this.extraSecondaryActionLabel.setVisible(hasExtraSecondaryAction);
    this.extraSecondaryActionDropdown.setVisible(hasExtraSecondaryAction);
    this.extraSecondaryActionDropdown.setActive(hasExtraSecondaryAction);
    this.refreshSecondaryExtraExecutionSelectorState();
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryChemicalTargetState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshSecondaryItemSelectorState();
    this.refreshSecondarySearchPriorityState();
    this.refreshSecondaryDropSellState();
    this.refreshExtraSecondaryExecutionSelectorState();
    this.refreshExtraSecondaryLocationSelectorState();
    this.refreshExtraSecondaryChemicalTargetState();
    this.refreshExtraSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
    this.refreshExtraSecondarySearchPriorityState();
    this.refreshExtraSecondaryDropSellState();
    this.setReadyEnabled(this.readyEnabled);
  }

  private hideStatusElements(): void {
    for (const obj of this.statusElements) {
      const target = obj as Phaser.GameObjects.GameObject & {
        setVisible?: (value: boolean) => void;
        setActive?: (value: boolean) => void;
      };
      target.setVisible?.(false);
      target.setActive?.(false);
    }
    this.mainActionDropdown.hideModal();
    this.mainActionDropdown.setVisible(false);
    this.mainActionDropdown.setActive(false);
    this.extraExecutionSelector.setVisible(false);
    this.extraExecutionSelector.setActive(false);
    this.locationSelector.setVisible(false);
    this.locationSelector.setActive(false);
    this.playerSelector.hideDropdown();
    this.playerSelector.setVisible(false);
    this.playerSelector.setActive(false);
    this.itemSelector.hideDropdown();
    this.itemSelector.setVisible(false);
    this.itemSelector.setActive(false);
    this.secondaryActionDropdown.hideModal();
    this.secondaryActionDropdown.setVisible(false);
    this.secondaryActionDropdown.setActive(false);
    this.secondaryExtraExecutionSelector.setVisible(false);
    this.secondaryExtraExecutionSelector.setActive(false);
    this.secondaryLocationSelector.setVisible(false);
    this.secondaryLocationSelector.setActive(false);
    this.secondaryPlayerSelector.hideDropdown();
    this.secondaryPlayerSelector.setVisible(false);
    this.secondaryPlayerSelector.setActive(false);
    this.secondaryItemSelector.hideDropdown();
    this.secondaryItemSelector.setVisible(false);
    this.secondaryItemSelector.setActive(false);
    this.extraSecondaryActionBox.setVisible(false);
    this.extraSecondaryActionLabel.setVisible(false);
    this.extraSecondaryActionDropdown.hideModal();
    this.extraSecondaryActionDropdown.setVisible(false);
    this.extraSecondaryActionDropdown.setActive(false);
    this.extraSecondaryExtraExecutionSelector.setVisible(false);
    this.extraSecondaryExtraExecutionSelector.setActive(false);
    this.extraSecondaryLocationSelector.setVisible(false);
    this.extraSecondaryLocationSelector.setActive(false);
    this.extraSecondaryPlayerSelector.hideDropdown();
    this.extraSecondaryPlayerSelector.setVisible(false);
    this.extraSecondaryPlayerSelector.setActive(false);
    this.extraSecondaryItemSelector.hideDropdown();
    this.extraSecondaryItemSelector.setVisible(false);
    this.extraSecondaryItemSelector.setActive(false);
    this.secondarySearchPriorityToggle.setVisible(false);
    this.secondarySearchPriorityToggle.setActive(false);
    this.secondaryChemicalTargetToggle.setVisible(false);
    this.secondaryChemicalTargetToggle.setActive(false);
    this.secondaryDropSellToggle.setVisible(false);
    this.secondaryDropSellToggle.setActive(false);
    this.extraSecondarySearchPriorityToggle.setVisible(false);
    this.extraSecondarySearchPriorityToggle.setActive(false);
    this.extraSecondaryChemicalTargetToggle.setVisible(false);
    this.extraSecondaryChemicalTargetToggle.setActive(false);
    this.extraSecondaryDropSellToggle.setVisible(false);
    this.extraSecondaryDropSellToggle.setActive(false);
    this.readyToggle.disableInteractive();
    this.unspentSkillsWarning?.setVisible(false);
    this.scrollPanel?.setMouseWheelScrollerEnable?.(false);
    this.scrollPanel?.setScrollerEnable?.(false);
  }

  private hideCharacterTabContents(): void {
    this.characterSubtabs.setVisible(false);
    this.hideStatusElements();
    this.skillsView.setVisible(false);
  }

  override setPosition(x?: number, y?: number, z?: number, w?: number): this {
    super.setPosition(x, y, z, w);
    this.updateScrollMaskPosition();
    return this;
  }

  setTutorialStep(
    stepId: TutorialStepId | null,
    active: boolean
  ): void {
    if (this.tutorialStepId === stepId && this.tutorialActive === active) {
      return;
    }
    this.tutorialStepId = stepId;
    this.tutorialActive = active;
    const policy = getTutorialUiPolicy(stepId);
    this.tutorialAllowedMainActionIds = active
      ? new Set(policy.primaryActionIds)
      : null;
    this.tutorialAllowedSecondaryActionIds = active
      ? new Set(policy.secondaryActionIds)
      : null;
    this.tutorialActionEditingEnabled =
      !active || policy.actionEditingEnabled;
    this.tutorialReadyEnabled = !active || policy.readyEnabled;
    this.closeCurrentGridSelect();
    this.tabsController.setHighlightedTab(
      active ? policy.highlightedTab : null
    );
    if (active && policy.highlightedTab) {
      this.tabLayout.reveal(policy.highlightedTab);
    }
    const isHighlighted = (control: TutorialControlHighlight): boolean =>
      active && policy.highlightedControls.includes(control);
    this.characterSubtabs.setHighlightedKey(
      active ? policy.highlightedCharacterSubtab : null
    );
    if (
      active &&
      policy.autoSelectCharacterSubtab &&
      policy.highlightedCharacterSubtab
    ) {
      this.characterSubtabs.setActiveKey(
        policy.highlightedCharacterSubtab,
        false
      );
      this.updateCharacterSubtabVisibility();
    }
    this.mainActionDropdown.setTutorialHighlight(
      isHighlighted("main_action")
    );
    this.secondaryActionDropdown.setTutorialHighlight(
      isHighlighted("secondary_action")
    );
    this.extraExecutionSelector.setTutorialHighlight(
      isHighlighted("extra_execution")
    );
    this.playerSelector.setTutorialHighlight(isHighlighted("player_target"));
    this.locationSelector.setTutorialHighlight(
      isHighlighted("location_target")
    );
    this.readyToggle.setColor(
      isHighlighted("ready") ? "#fbbf24" : "#ffffff"
    );
    this.skillsView.setAllowedSkillIds(active ? policy.skillIds : null);
    this.shopView.setTutorialShopPolicy(
      active ? policy.shopIds : null,
      isHighlighted("detective") ? "detective" : null
    );
    this.updateFromMatch(this.currentMatch, this.currentUserId, this.lastUserMap);
    if (active && policy.actionEditingEnabled) {
      this.syncTutorialActionSelection(policy);
    }
    this.setReadyEnabled(this.readyEnabled);
  }

  private syncTutorialActionSelection(
    policy: ReturnType<typeof getTutorialUiPolicy>
  ): void {
    if (policy.primaryActionIds.length === 1 && this.currentUserId) {
      const actionId = policy.primaryActionIds[0];
      const serverActionId =
        this.currentMatch?.playerCharacters?.[this.currentUserId]?.actionPlan
          ?.main?.actionId ?? null;
      if (serverActionId !== actionId) {
        this.mainActionDropdown.setValue(actionId, true);
      }
    }
    if (policy.secondaryActionIds.length === 1 && this.currentUserId) {
      const actionId = policy.secondaryActionIds[0];
      const serverActionId =
        this.currentMatch?.playerCharacters?.[this.currentUserId]?.actionPlan
          ?.secondary?.actionId ?? null;
      if (serverActionId !== actionId) {
        this.secondaryActionDropdown.setValue(actionId, true);
      }
    }
  }

  setMobileTabNavigation(enabled: boolean): void {
    this.tabLayout.setMobileNavigation(enabled);
    const activeKey = enabled ? this.tabsController?.getActiveTab() : null;
    if (activeKey) {
      this.tabLayout.reveal(activeKey);
    }
  }

  private updateScrollMaskPosition(): void {
    if (!this.scrollMaskShape) {
      return;
    }
    const matrix = this.getWorldTransformMatrix();
    this.scrollMaskShape.setPosition(
      matrix.tx + MARGIN,
      matrix.ty + this.scrollTop
    );
  }

  setPanelSize(width: number, height: number) {
    this.panelWidth = width;
    this.panelHeight = height;
    this.setSize(width, height);
    this.background.setSize(width, height);
    this.tabLayout.layout(width);
    const contentTop = TAB_HEIGHT + MARGIN;
    const subtabY = TAB_HEIGHT + 8;
    const subtabHeight = 28;
    const subtabBottom = subtabY + subtabHeight + 8;

    this.characterSubtabs.layout(
      MARGIN + 12,
      subtabY,
      width - MARGIN * 2 - 24,
      subtabHeight
    );

    const statusContentTop = subtabBottom + 14;
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    this.statusView.layout({
      margin: MARGIN,
      portraitSize: PORTRAIT_SIZE,
      barWidth: width - (PORTRAIT_SIZE + MARGIN * 3),
      contentTop: statusContentTop,
      barHeight: BAR_HEIGHT
    });
    if (this.readyToggle) {
      this.readyToggle.setPosition(barX, statusContentTop + 80);
      if (this.unspentSkillsWarning) {
        this.unspentSkillsWarning.setPosition(
          barX + this.readyToggle.width + 12,
          statusContentTop + 81
        );
      }
    }
    const scrollWidth = Math.max(120, width - MARGIN * 2);
    this.mainActionDropdownWidth = Math.max(0, scrollWidth - 24);
    this.secondaryActionDropdownWidth = Math.max(0, scrollWidth - 24);
    this.extraSecondaryActionDropdownWidth = Math.max(0, scrollWidth - 24);
    const readyHeight = this.readyToggle ? this.readyToggle.height : 0;
    const readyBottom = statusContentTop + 80 + readyHeight + 24;
    const scrollTop = readyBottom;
    this.scrollTop = scrollTop;
    const scrollHeight = Math.max(160, height - scrollTop - MARGIN);
    this.scrollContentWidth = scrollWidth;
    if (this.scrollMaskShape) {
      const matrix = this.getWorldTransformMatrix();
      this.scrollMaskShape.setPosition(
        matrix.tx + MARGIN,
        matrix.ty + scrollTop
      );
      this.scrollMaskShape.setSize(scrollWidth + 100, scrollHeight);
    }
    if (this.scrollPanel) {
      this.scrollPanel.setPosition?.(MARGIN, scrollTop);
      this.scrollPanel.setSize?.(scrollWidth, scrollHeight);
      this.scrollPanel.setMinSize?.(scrollWidth, scrollHeight);
    }
    this.updateScrollLayout();

    this.skillsView.layout({
      margin: MARGIN,
      contentTop: subtabBottom,
      boxWidth: width - MARGIN * 2,
      panelHeight: height
    });
    const boxWidth = width - MARGIN * 2;
    const itemsBoxY = contentTop;
    const itemsBoxWidth = boxWidth;
    this.inventoryView.layout({
      margin: MARGIN,
      contentTop: itemsBoxY,
      boxWidth: itemsBoxWidth,
      panelHeight: height
    });
    this.shopView.layout({
      margin: MARGIN,
      contentTop: itemsBoxY,
      boxWidth: itemsBoxWidth,
      panelHeight: height
    });
    this.playersTabView.layout({
      margin: MARGIN,
      contentTop: itemsBoxY,
      boxWidth: itemsBoxWidth,
      panelHeight: height
    });
    if (this.logView) {
      this.logView.layout({
        margin: MARGIN,
        tabHeight: TAB_HEIGHT,
        contentTop,
        boxWidth,
        panelHeight: height
      });
    }
    if (this.chatView) {
      this.chatView.layout({
        margin: MARGIN,
        contentTop,
        boxWidth,
        panelHeight: height
      });
    }
  }

  setChatMessages(messages: ChatMessageViewModel[]) {
    this.chatView?.setMessages(messages);
  }

  appendChatMessage(message: ChatMessageViewModel) {
    this.chatView?.appendMessage(message);
  }

  markChatUnread(unread: boolean) {
    if (unread && this.tabsController?.getActiveTab() === "chat") {
      return;
    }
    this.tabsController?.setTabUnread("chat", unread);
  }

  setChatConnectionState(state: ChatConnectionState, message?: string) {
    this.chatView?.setConnectionState(state, message);
  }

  setChatInputEnabled(enabled: boolean) {
    this.chatView?.setInputEnabled(enabled);
  }

  setChatSendCooldown(durationMs: number) {
    this.chatView?.startSendCooldown(durationMs);
  }

  getPanelWidth() {
    return this.panelWidth;
  }

  setCurrentPlayerSkin(skin: Skin) {
    this.currentPlayerSkin = skin;
    this.statusView.setSkin(skin, this.scene.textures);
  }

  setPlayerAccount(userId: string, account: UserAccount) {
    this.playerAccounts.set(userId, account);
    if (this.currentMatch) {
      this.updatePlayerOptions(
        this.currentMatch,
        this.lastUserMap,
        this.currentUserId
      );
      this.playersTabView.update(
        this.currentMatch,
        this.playerOptions,
        this.currentUserId
      );
      if (this.currentUserId && userId === this.currentUserId) {
        const characters = this.currentMatch.playerCharacters ?? {};
        const character =
          (characters[this.currentUserId] as PlayerCharacter) ?? null;
        const accountDisplayName =
          typeof account.displayName === "string" &&
          account.displayName.trim().length > 0
            ? account.displayName.trim()
            : null;
        const name =
          accountDisplayName ??
          this.lastUserMap[this.currentUserId] ??
          null;
        const ready =
          this.currentMatch.readyStates?.[this.currentUserId] ?? false;
        this.applyCharacter(character, name, ready);
      }
    }
  }

  updateFromMatch(
    match: MatchRecord | null,
    currentUserId: string | null,
    usernames?: Record<string, string>
  ) {
    const userMap = usernames ? { ...usernames } : {};
    this.lastUserMap = userMap;
    this.logView.setUsernames(userMap);
    this.logView.setDonations(match?.zarkanDonations ?? []);
    const teamMap: Record<string, string> = {
      ...(match?.revealedTeamsByPlayerId ?? {})
    };
    for (const [playerId, character] of Object.entries(
      match?.playerCharacters ?? {}
    )) {
      if (typeof character?.teamId === "string" && character.teamId.length > 0) {
        teamMap[playerId] = character.teamId;
      }
    }
    this.logView.setTeams(teamMap);
    this.currentMatch = match ?? null;
    this.currentUserId = currentUserId ?? null;
    this.updatePlayerOptions(match ?? null, userMap, currentUserId);
    this.playersTabView.update(
      match ?? null,
      this.playerOptions,
      currentUserId
    );
    this.updateItemOptions(match ?? null, currentUserId);
    this.shopView.update(match ?? null, currentUserId, this.playerOptions);
    if (!match || !currentUserId) {
      this.currentTurn = 0;
      this.applyCharacter(null, null, false);
      this.applyTutorialActionEditingState();
      this.setLogTurnInfo(0);
      return;
    }
    this.currentTurn = match.current_turn ?? 0;
    const characters = match.playerCharacters ?? {};
    // Current character is always received as PlayerCharacter type
    const character = (characters[currentUserId] as PlayerCharacter) ?? null;
    const currentAccount = this.playerAccounts.get(currentUserId);
    const accountDisplayName =
      typeof currentAccount?.displayName === "string" &&
      currentAccount.displayName.trim().length > 0
        ? currentAccount.displayName.trim()
        : null;
    const name = accountDisplayName ?? userMap[currentUserId] ?? null;
    const ready = match.readyStates?.[currentUserId] ?? false;
    this.applyCharacter(character, name, ready);
    this.applyTutorialActionEditingState();
  }

  private applyCharacter(
    character: PlayerCharacter | null,
    playerName: string | null,
    ready: boolean
  ) {
    this.currentCharacter = character;
    this.skillsView?.update(character);
    if (!character) {
      this.statusView.update(null, null);
      this.applyMainActions([], null, null);
      this.setMainActionTarget(null, false);
      this.setMainActionSecondTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
      this.setScareSecondTargetPlayer(null, false);
      this.setLocationSelectionPending(false);
      this.setSecondLocationSelectionPending(false);
      this.playerSelector.setPending(false);
      this.playerSelector.setEnabled(false);
      this.playerSelector.hideDropdown();
      this.mainActionPriorityItems = [];
      this.itemSelector.setValue([], false);
      this.itemSelector.setEnabled(false);
      this.itemSelector.setVisible(false);
      this.itemSelector.setActive(false);
      this.itemSelector.setPending(false);
      this.itemSelector.hideDropdown();
      this.refreshPlayerSelectorState();
      this.applySecondaryActions([], null, null);
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
      this.secondaryInspectAdditionalTarget = false;
      this.setSecondaryInspectSecondTargetPlayer(null, false);
      this.setSecondaryLocationSelectionPending(false);
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.setEnabled(false);
      this.secondaryPlayerSelector.hideDropdown();
      this.secondaryActionPriorityItems = [];
      this.secondaryItemSelector.setValue([], false);
      this.secondaryItemSelector.setEnabled(false);
      this.secondaryItemSelector.setVisible(false);
      this.secondaryItemSelector.setActive(false);
      this.secondaryItemSelector.setPending(false);
      this.secondaryItemSelector.hideDropdown();
      this.refreshSecondaryPlayerSelectorState();
      this.refreshSecondaryInspectAdditionalTargetState();
      this.refreshItemSelectorState();
      this.refreshSecondaryItemSelectorState();
      this.applyExtraSecondaryActions([], null, null);
      this.extraSecondaryActionPriorityItems = [];
      this.extraSecondaryItemSelector.setValue([], false);
      this.extraSecondaryItemSelector.setEnabled(false);
      this.extraSecondaryItemSelector.setVisible(false);
      this.extraSecondaryItemSelector.setActive(false);
      this.extraSecondaryPlayerSelector.setPending(false);
      this.extraSecondaryPlayerSelector.setEnabled(false);
      this.extraSecondaryPlayerSelector.hideDropdown();
      this.refreshExtraSecondaryPlayerSelectorState();
      this.refreshExtraSecondaryItemSelectorState();
      this.setReadyEnabled(false);
      this.setReadyState(false, false);
      this.inventoryView.update(null);
      this.updateScrollLayout();
      return;
    }
    this.statusView.update(character, playerName);
    const actions = collectMainActions(character);
    const mainActionId = character.actionPlan?.main?.actionId ?? null;
    const mainExtraExecutions =
      character.actionPlan?.main?.extraExecutions ?? 0;
    this.applyMainActions(
      actions,
      mainActionId,
      character,
      mainExtraExecutions
    );
    const targetLocation = character.actionPlan?.main?.targetLocationId ?? null;
    const normalizedTargetLocation = this.normalizeAxial(targetLocation);
    this.setMainActionTarget(normalizedTargetLocation, false);
    const normalizedSecondTargetLocation = this.normalizeAxial(
      character.actionPlan?.main?.secondTargetLocationId ?? null
    );
    this.setMainActionSecondTarget(normalizedSecondTargetLocation, false);
    const targetPlayers = character.actionPlan?.main?.targetPlayerIds ?? null;
    const serverTargetPlayerId = this.normalizePlayerId(
      Array.isArray(targetPlayers) && targetPlayers.length > 0
        ? targetPlayers[0]
        : null
    );
    this.setMainActionTargetPlayer(serverTargetPlayerId, false);
    const serverSecondTargetPlayerId = this.normalizePlayerId(
      mainActionId === "shoot_pistol"
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
    this.setLocationSelectionPending(false);
    this.playerSelector.setPending(false);
    const secondaryActions = collectSecondaryActions(character);
    const hasExtraSecondary = this.hasExtraSecondaryAction();
    const secondaryId = character.actionPlan?.secondary?.actionId ?? null;
    let extraSecondaryId =
      character.actionPlan?.extraSecondary?.actionId ?? null;
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
    const secondaryTargetPlayers =
      character.actionPlan?.secondary?.targetPlayerIds ?? null;
    this.secondaryChemicalSingleTarget =
      secondaryId === "use_chemical_weapon" &&
      (character.actionPlan?.secondary?.singleTarget === true ||
        (Array.isArray(secondaryTargetPlayers) &&
          secondaryTargetPlayers.length > 0));
    this.updateChemicalTargetToggleText(
      this.secondaryChemicalTargetToggle,
      this.secondaryChemicalSingleTarget
    );
    const secondaryExtraExecutions =
      character.actionPlan?.secondary?.extraExecutions ?? 0;
    this.applySecondaryActions(
      secondaryActions,
      secondaryId,
      character,
      secondaryExtraExecutions,
      hasExtraSecondary ? extraSecondaryId : null
    );
    const secondaryTargetLocation =
      character.actionPlan?.secondary?.targetLocationId ?? null;
    const normalizedSecondaryTargetLocation = this.normalizeAxial(
      secondaryTargetLocation
    );
    this.setSecondaryActionTarget(normalizedSecondaryTargetLocation, false);
    const secondaryServerTargetPlayerId = this.normalizePlayerId(
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
    const secondarySecondTargetPlayerId = this.normalizePlayerId(
      Array.isArray(secondaryTargetPlayers) && secondaryTargetPlayers.length > 1
        ? secondaryTargetPlayers[1]
        : null
    );
    this.setSecondaryInspectSecondTargetPlayer(
      secondarySecondTargetPlayerId,
      false
    );
    const secondaryTargetItems = Array.isArray(
      character.actionPlan?.secondary?.targetItemIds
    )
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
    const extraSecondaryTargetPlayers =
      character.actionPlan?.extraSecondary?.targetPlayerIds ?? null;
    this.extraSecondaryChemicalSingleTarget =
      extraSecondaryId === "use_chemical_weapon" &&
      (character.actionPlan?.extraSecondary?.singleTarget === true ||
        (Array.isArray(extraSecondaryTargetPlayers) &&
          extraSecondaryTargetPlayers.length > 0));
    this.updateChemicalTargetToggleText(
      this.extraSecondaryChemicalTargetToggle,
      this.extraSecondaryChemicalSingleTarget
    );
    const extraSecondaryExtraExecutions =
      character.actionPlan?.extraSecondary?.extraExecutions ?? 0;
    this.applyExtraSecondaryActions(
      extraSecondaryActions,
      extraSecondaryId,
      character,
      extraSecondaryExtraExecutions,
      secondaryId
    );
    const extraSecondaryTargetLocation =
      character.actionPlan?.extraSecondary?.targetLocationId ?? null;
    const normalizedExtraSecondaryTargetLocation = this.normalizeAxial(
      extraSecondaryTargetLocation
    );
    this.setExtraSecondaryActionTarget(
      normalizedExtraSecondaryTargetLocation,
      false
    );
    const extraSecondaryServerTargetPlayerId = this.normalizePlayerId(
      Array.isArray(extraSecondaryTargetPlayers) &&
        extraSecondaryTargetPlayers.length > 0
        ? extraSecondaryTargetPlayers[0]
        : null
    );
    this.setExtraSecondaryActionTargetPlayer(
      extraSecondaryServerTargetPlayerId,
      false
    );
    const extraSecondaryTargetItems = Array.isArray(
      character.actionPlan?.extraSecondary?.targetItemIds
    )
      ? (character.actionPlan?.extraSecondary?.targetItemIds as string[])
      : [];
    this.setExtraSecondaryActionPriorityItems(extraSecondaryTargetItems, false);
    this.setReadyEnabled(true);
    this.setReadyState(ready, false);
    this.syncMainActionWithServer(
      mainActionId,
      normalizedTargetLocation,
      normalizedSecondTargetLocation,
      serverTargetPlayerId,
      serverSecondTargetPlayerId,
      targetItems
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
    this.inventoryView.update(character);
    this.updateScrollLayout();
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;
    if (this.readyToggle) {
      this.readyToggle.setText(normalized ? "[x] Ready" : "[ ] Ready");
      if (this.unspentSkillsWarning) {
        this.unspentSkillsWarning.setPosition(
          this.readyToggle.x + this.readyToggle.width + 12,
          this.readyToggle.y + 1
        );
      }
    }
    if (emit && changed) {
      this.emit("ready-change", normalized);
    }
    return changed;
  }

  /**
   * Update readiness indicators without reapplying the character state.
   * Readiness is broadcast to every client, but it does not change this
   * client's skills, action plans, or inventory.
   */
  updateReadyStates(readyStates: Record<string, boolean> | undefined): void {
    if (this.currentMatch) {
      this.currentMatch.readyStates = readyStates ?? {};
    }
    if (this.currentUserId) {
      this.setReadyState(readyStates?.[this.currentUserId] ?? false, false);
    }
    this.playersTabView.refresh();
  }

  getReadyState(): boolean {
    return this.readyState;
  }

  private applyTutorialActionEditingState(): void {
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
    this.secondaryLocationSelector.setEnabled(false);
    this.secondaryPlayerSelector.setEnabled(false);
    this.secondaryInspectSecondPlayerSelector.setEnabled(false);
    this.secondaryItemSelector.setEnabled(false);
    this.extraSecondaryLocationSelector.setEnabled(false);
    this.extraSecondaryPlayerSelector.setEnabled(false);
    this.extraSecondaryItemSelector.setEnabled(false);
  }

  private isTutorialReadyAllowed(): boolean {
    if (!this.tutorialActive || !this.tutorialStepId) {
      return true;
    }
    return isTutorialReadyActionAllowed(this.tutorialStepId, {
      mainActionId: this.mainActionSelection,
      targetLocation: this.mainActionTarget,
      extraExecutions: this.mainExtraExecutions
    });
  }

  private getUnspentSkillPoints(): number {
    return this.currentCharacter?.progression?.availableSkillPoints ?? 0;
  }

  private setReadyEnabled(enabled: boolean) {
    this.readyEnabled = enabled;
    if (!this.readyToggle) {
      return;
    }
    const isCharacterActive =
      this.tabsController?.isActive("character") ?? false;
    const isStatusActive =
      !this.characterSubtabs ||
      this.characterSubtabs.getActiveKey() === "status";
    const tutorialReadyAllowed = this.isTutorialReadyAllowed();
    const unspentPoints = this.getUnspentSkillPoints();
    const hasUnspentSkillPoints = unspentPoints > 0;
    const showReady =
      enabled &&
      !hasUnspentSkillPoints &&
      (!this.tutorialActive || (this.tutorialReadyEnabled && tutorialReadyAllowed)) &&
      isCharacterActive &&
      isStatusActive;
    if (showReady) {
      this.readyToggle.setAlpha(1);
      this.readyToggle.setInteractive({ useHandCursor: true });
    } else {
      this.readyToggle.setAlpha(0.5);
      this.readyToggle.disableInteractive();
      if (this.tutorialActive && !tutorialReadyAllowed && this.readyState) {
        this.setReadyState(false, true);
      }
      if (hasUnspentSkillPoints && this.readyState) {
        this.setReadyState(false, true);
      }
    }

    if (this.unspentSkillsWarning) {
      if (hasUnspentSkillPoints && isCharacterActive && isStatusActive) {
        this.unspentSkillsWarning.setText(
          `${t("Unspent points")}: ${unspentPoints}`
        );
        this.unspentSkillsWarning.setPosition(
          this.readyToggle.x + this.readyToggle.width + 12,
          this.readyToggle.y + 1
        );
        this.unspentSkillsWarning.setVisible(true);
      } else {
        this.unspentSkillsWarning.setVisible(false);
      }
    }
    if (this.tutorialActive) {
      const isReadyHighlighted =
        this.tutorialStepId === "return_to_bot" ||
        this.tutorialStepId === "scare_bot_to_doomed_cell"
          ? tutorialReadyAllowed
          : (this.tutorialStepId
              ? getTutorialUiPolicy(this.tutorialStepId).highlightedControls.includes("ready")
              : false);
      this.readyToggle.setColor(isReadyHighlighted ? "#fbbf24" : "#ffffff");
    }
  }

  private getActionOptionsContext(
    character: PlayerCharacter | null = this.getCurrentCharacter()
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
  ) {
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
    this.refreshLocationSelectorState();
    this.refreshPlayerSelectorState();
    this.refreshItemSelectorState();
  }

  private applySecondaryActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null,
    storedExtraExecutions = 0,
    disabledActionId: string | null = null
  ) {
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      disabledActionId,
      "Already chosen as extra secondary action"
    );
    this.secondaryActionDropdown.setItems(items);
    this.secondaryActionDropdown.setEnabled(
      !this.tutorialActive ||
        (this.tutorialActionEditingEnabled &&
          (this.tutorialAllowedSecondaryActionIds?.size ?? 0) > 0)
    );
    if (preferredId) {
      this.secondaryActionDropdown.setValue(preferredId, false);
      if (!this.secondaryActionDropdown.getSelectedItem()) {
        this.secondaryActionDropdown.setValue(null, false);
      }
    } else {
      this.secondaryActionDropdown.setValue(null, false);
      if (!this.secondaryActionDropdown.getSelectedItem() && items[0]) {
        this.secondaryActionDropdown.setValue(items[0].id, false);
      }
    }
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
    this.secondaryActionSelection = this.secondaryActionDropdown.getValue();
    if (!this.secondaryActionSelection) {
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
    }
    this.refreshSecondaryExtraExecutionSelectorState(storedExtraExecutions);
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryChemicalTargetState();
    this.refreshSecondaryPlayerSelectorState();
    this.refreshSecondaryInspectAdditionalTargetState();
    this.refreshSecondaryItemSelectorState();
    this.refreshSecondarySearchPriorityState();
    this.refreshSecondaryDropSellState();
  }

  private applyExtraSecondaryActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null,
    storedExtraExecutions = 0,
    disabledActionId: string | null = null
  ) {
    const available =
      !this.tutorialActive && this.hasExtraSecondaryAction();
    this.extraSecondaryActionBox.setVisible(available);
    this.extraSecondaryActionLabel.setVisible(available);
    this.extraSecondaryActionDropdown.setVisible(available);
    this.extraSecondaryActionDropdown.setActive(available);
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      available ? disabledActionId : null,
      "Already chosen as secondary action"
    );
    this.extraSecondaryActionDropdown.setItems(items);
    if (preferredId) {
      this.extraSecondaryActionDropdown.setValue(preferredId, false);
      if (!this.extraSecondaryActionDropdown.getSelectedItem()) {
        this.extraSecondaryActionDropdown.setValue(null, false);
      }
    } else {
      this.extraSecondaryActionDropdown.setValue(null, false);
      if (!this.extraSecondaryActionDropdown.getSelectedItem() && items[0]) {
        this.extraSecondaryActionDropdown.setValue(items[0].id, false);
      }
    }
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
    this.extraSecondaryActionSelection =
      this.extraSecondaryActionDropdown.getValue();
    if (!this.extraSecondaryActionSelection) {
      this.setExtraSecondaryActionTarget(null, false);
      this.setExtraSecondaryActionTargetPlayer(null, false);
    }
    this.refreshExtraSecondaryExecutionSelectorState(storedExtraExecutions);
    this.refreshExtraSecondaryLocationSelectorState();
    this.refreshExtraSecondaryChemicalTargetState();
    this.refreshExtraSecondaryPlayerSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
    this.refreshExtraSecondarySearchPriorityState();
    this.refreshExtraSecondaryDropSellState();
  }

  private refreshSecondaryDropdownItems() {
    const character = this.getCurrentCharacter();
    const actions = collectSecondaryActions(character);
    const disabledId = this.hasExtraSecondaryAction()
      ? this.extraSecondaryActionSelection
      : null;
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      disabledId,
      "Already chosen as extra secondary action"
    );
    this.secondaryActionDropdown.setItems(items);
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
  }

  private refreshExtraSecondaryDropdownItems() {
    if (!this.hasExtraSecondaryAction()) {
      return;
    }
    const character = this.getCurrentCharacter();
    const actions = collectSecondaryActions(character);
    const items = buildSecondaryActionItems(
      actions,
      this.getActionOptionsContext(character),
      this.secondaryActionSelection,
      "Already chosen as secondary action"
    );
    this.extraSecondaryActionDropdown.setItems(items);
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
  }

  private getCurrentCharacter(): PlayerCharacter | null {
    if (!this.currentMatch || !this.currentUserId) {
      return null;
    }
    const characters = this.currentMatch.playerCharacters ?? {};
    return (characters[this.currentUserId] as PlayerCharacter | undefined) ?? null;
  }

  private getCurrentEnergy(): number {
    const character = this.getCurrentCharacter();
    return character?.stats?.energy?.current ?? 0;
  }

  private refreshExtraExecutionSelectorState(initialReps = 0) {
    const definition = this.mainActionSelection
      ? (ActionLibrary[this.mainActionSelection as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const supports = extraExecution !== null;
    this.extraExecutionSelector.setVisible(supports);
    this.extraExecutionSelector.setActive(supports);
    if (!supports) {
      this.mainExtraExecutions = 0;
      this.extraExecutionSelector.setValue(0);
      this.extraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const energy = this.getCurrentEnergy();
    const character = this.getCurrentCharacter();
    const discount = character && definition
      ? getActionEnergyDiscount(character, definition.id)
      : 0;
    this.extraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy,
      discount
    });
    this.mainExtraExecutions = Math.max(0, initialReps);
    this.extraExecutionSelector.setValue(this.mainExtraExecutions);
    const hasSelection = this.mainActionSelection !== null;
    this.extraExecutionSelector.setEnabled(hasSelection);
    this.updateScrollLayout();
  }

  private refreshSecondaryExtraExecutionSelectorState(initialReps = 0) {
    const definition = this.secondaryActionSelection
      ? (ActionLibrary[this.secondaryActionSelection as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const supports = extraExecution !== null;
    this.secondaryExtraExecutionSelector.setVisible(supports);
    this.secondaryExtraExecutionSelector.setActive(supports);
    if (!supports) {
      if (this.secondaryExtraExecutions !== 0) {
        this.secondaryExtraExecutions = 0;
      }
      this.secondaryExtraExecutionSelector.setValue(0);
      this.secondaryExtraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const energy = this.getCurrentEnergy();
    const character = this.getCurrentCharacter();
    const discount = character && definition
      ? getActionEnergyDiscount(character, definition.id)
      : 0;
    this.secondaryExtraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy,
      discount
    });
    if (initialReps > 0) {
      this.secondaryExtraExecutions = initialReps;
      this.secondaryExtraExecutionSelector.setValue(initialReps);
    }
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryExtraExecutionSelector.setEnabled(hasSelection);
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryExecutionSelectorState(initialReps = 0) {
    const definition = this.extraSecondaryActionSelection
      ? (ActionLibrary[this.extraSecondaryActionSelection as ActionId] ?? null)
      : null;
    const extraExecution = definition?.extraExecution ?? null;
    const supports = extraExecution !== null && this.hasExtraSecondaryAction();
    this.extraSecondaryExtraExecutionSelector.setVisible(supports);
    this.extraSecondaryExtraExecutionSelector.setActive(supports);
    if (!supports) {
      this.extraSecondaryExtraExecutions = 0;
      this.extraSecondaryExtraExecutionSelector.setValue(0);
      this.extraSecondaryExtraExecutionSelector.setEnabled(false);
      this.updateScrollLayout();
      return;
    }
    const character = this.getCurrentCharacter();
    const discount = character && definition
      ? getActionEnergyDiscount(character, definition.id)
      : 0;
    this.extraSecondaryExtraExecutionSelector.configure({
      baseCost: definition!.energyCost,
      extraCostPerRep: extraExecution.cost,
      maxReps: extraExecution.maxRepetitions ?? 1,
      description: extraExecution.description,
      energy: this.getCurrentEnergy(),
      discount
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

  private refreshExtraSecondaryLocationSelectorState() {
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

  private refreshExtraSecondaryPlayerSelectorState() {
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

  private refreshExtraSecondaryItemSelectorState() {
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
        this.getCurrentCharacter(),
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
    }
    this.updateSearchPriorityToggleText(
      this.secondarySearchPriorityToggle,
      this.secondaryPrioritizeFoodDrink
    );
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
    }
    this.updateSearchPriorityToggleText(
      this.extraSecondarySearchPriorityToggle,
      this.extraSecondaryPrioritizeFoodDrink
    );
    this.updateScrollLayout();
  }

  private updateChemicalTargetToggleText(
    toggle: Phaser.GameObjects.Text,
    singleTarget: boolean
  ): void {
    toggle.setText(
      singleTarget ? "[x] Single target" : "[ ] Single target (Area)"
    );
  }

  private refreshSecondaryChemicalTargetState(): void {
    const visible = this.secondaryActionSelection === "use_chemical_weapon";
    this.secondaryChemicalTargetToggle.setVisible(visible);
    this.secondaryChemicalTargetToggle.setActive(visible);
    if (!visible) {
      this.secondaryChemicalSingleTarget = false;
    }
    this.updateChemicalTargetToggleText(
      this.secondaryChemicalTargetToggle,
      this.secondaryChemicalSingleTarget
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryChemicalTargetState(): void {
    const visible =
      this.extraSecondaryActionSelection === "use_chemical_weapon";
    this.extraSecondaryChemicalTargetToggle.setVisible(visible);
    this.extraSecondaryChemicalTargetToggle.setActive(visible);
    if (!visible) {
      this.extraSecondaryChemicalSingleTarget = false;
    }
    this.updateChemicalTargetToggleText(
      this.extraSecondaryChemicalTargetToggle,
      this.extraSecondaryChemicalSingleTarget
    );
    this.updateScrollLayout();
  }

  private updateDropSellToggleText(
    toggle: Phaser.GameObjects.Text,
    sellInstead: boolean
  ): void {
    toggle.setText(sellInstead ? "[x] Sell instead" : "[ ] Sell instead");
  }

  private refreshSecondaryDropSellState(): void {
    const visible = this.secondaryActionSelection === "drop";
    this.secondaryDropSellToggle.setVisible(visible);
    this.secondaryDropSellToggle.setActive(visible);
    if (!visible) {
      this.secondarySellInstead = false;
    }
    this.updateDropSellToggleText(
      this.secondaryDropSellToggle,
      this.secondarySellInstead
    );
    this.updateScrollLayout();
  }

  private refreshExtraSecondaryDropSellState(): void {
    const visible = this.extraSecondaryActionSelection === "drop";
    this.extraSecondaryDropSellToggle.setVisible(visible);
    this.extraSecondaryDropSellToggle.setActive(visible);
    if (!visible) {
      this.extraSecondarySellInstead = false;
    }
    this.updateDropSellToggleText(
      this.extraSecondaryDropSellToggle,
      this.extraSecondarySellInstead
    );
    this.updateScrollLayout();
  }

  private refreshLocationSelectorState() {
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedMainActionSupportsLocation();
    this.locationSelector.setVisible(supports);
    this.locationSelector.setActive(supports);
    if (!supports) {
      if (this.mainActionTarget !== null) {
        this.mainActionTarget = null;
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setEnabled(false);
      this.locationSelector.setPending(false);
      this.refreshSecondLocationSelectorState();
      this.updateScrollLayout();
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.locationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.locationSelector.setPending(false);
    }
    this.refreshSecondLocationSelectorState();
    this.updateScrollLayout();
  }

  private refreshSecondLocationSelectorState(): void {
    const supports = this.selectedMainActionSupportsSecondLocation();
    this.secondLocationSelector.setLabel(
      t(
        this.mainActionSelection === "place_trap"
          ? "Second Trap Destination"
          : this.mainActionSelection === "detonate_c4"
            ? "Second C4 Destination"
            : "Second Shot Destination"
      )
    );
    this.secondLocationSelector.setVisible(supports);
    this.secondLocationSelector.setActive(supports);
    if (!supports) {
      this.mainActionSecondTarget = null;
      this.secondLocationSelector.setValue(null);
      this.secondLocationSelector.setEnabled(false);
      this.secondLocationSelector.setPending(false);
      return;
    }
    this.secondLocationSelector.setEnabled(
      this.mainActionSelection !== null
    );
  }

  private refreshPlayerSelectorState() {
    const supports = this.selectedActionSupportsSingleTarget();
    const hasOptions = this.mainPlayerOptions.length > 0;
    const shouldShow = supports && hasOptions;
    this.playerSelector.setVisible(shouldShow);
    this.playerSelector.setActive(shouldShow);
    if (!shouldShow) {
      if (this.mainActionTargetPlayerId !== null) {
        this.mainActionTargetPlayerId = null;
      }
      this.playerSelector.setValue(null);
      this.playerSelector.setEnabled(false);
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
      this.refreshScareSecondPlayerSelectorState();
      this.updateScrollLayout();
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.playerSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
    }
    this.refreshScareSecondPlayerSelectorState();
    this.updateScrollLayout();
  }

  private refreshScareSecondPlayerSelectorState(): void {
    const isScare = this.mainActionSelection === "scare";
    const isPistolExtra =
      this.mainActionSelection === "shoot_pistol" &&
      this.mainExtraExecutions > 0;
    this.scareSecondPlayerSelector.setLabel(
      t(isPistolExtra ? "Second Shot Target Player" : "Second Target Player")
    );
    const shouldShow =
      (isScare &&
        this.mainExtraExecutions > 0 &&
        this.mainPlayerOptions.length > 1 &&
        this.mainActionTarget === null) ||
      (isPistolExtra && this.mainPlayerOptions.length > 0);
    this.scareSecondPlayerSelector.setVisible(shouldShow);
    this.scareSecondPlayerSelector.setActive(shouldShow);
    if (!shouldShow) {
      this.scareSecondTargetPlayerId = null;
      this.scareSecondPlayerSelector.setValue(null);
      this.scareSecondPlayerSelector.setEnabled(false);
      this.scareSecondPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    const options = isPistolExtra
      ? this.mainPlayerOptions
      : this.mainPlayerOptions.filter(
          (option) => option.id !== this.mainActionTargetPlayerId
        );
    this.scareSecondPlayerSelector.setOptions(options);
    if (
      this.scareSecondTargetPlayerId &&
      !options.some((option) => option.id === this.scareSecondTargetPlayerId)
    ) {
      this.scareSecondTargetPlayerId = null;
    }
    this.scareSecondPlayerSelector.setValue(
      this.scareSecondTargetPlayerId,
      false
    );
    this.scareSecondPlayerSelector.setEnabled(
      this.mainActionSelection !== null
    );
    this.updateScrollLayout();
  }

  private refreshItemSelectorState() {
    const supports = this.selectedActionSupportsItemPriority();
    const options = this.getMainActionItemOptions();
    const hasOptions = options.length > 0;
    const shouldShow = supports && hasOptions;
    if (!shouldShow) {
      this.itemSelector.setVisible(false);
      this.itemSelector.setActive(false);
      if (this.mainActionPriorityItems.length > 0) {
        this.mainActionPriorityItems = [];
      }
      this.itemSelector.setValue([], false);
      this.itemSelector.setEnabled(false);
      this.itemSelector.setPending(false);
      this.itemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    this.itemSelector.setOptions(options);
    this.itemSelector.setVisible(true);
    this.itemSelector.setActive(true);
    const hasSelection = this.mainActionSelection !== null;
    this.itemSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.itemSelector.setPending(false);
      this.itemSelector.hideDropdown();
    }
    this.updateScrollLayout();
  }

  private refreshSecondaryLocationSelectorState() {
    this.lastSecondaryActionItem =
      this.secondaryActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedSecondaryActionSupportsLocation();
    this.secondaryLocationSelector.setVisible(supports);
    this.secondaryLocationSelector.setActive(supports);
    if (!supports) {
      if (this.secondaryActionTarget !== null) {
        this.secondaryActionTarget = null;
      }
      this.secondaryLocationSelector.setValue(null);
      this.secondaryLocationSelector.setEnabled(false);
      this.secondaryLocationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryLocationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.secondaryLocationSelector.setPending(false);
    }
    this.updateScrollLayout();
  }

  private refreshSecondaryPlayerSelectorState() {
    const supports = this.selectedSecondaryActionSupportsSingleTarget();
    const hasOptions = this.secondaryPlayerOptions.length > 0;
    const shouldShow = supports && hasOptions;
    this.secondaryPlayerSelector.setVisible(shouldShow);
    this.secondaryPlayerSelector.setActive(shouldShow);
    if (!shouldShow) {
      if (this.secondaryActionTargetPlayerId !== null) {
        this.secondaryActionTargetPlayerId = null;
      }
      this.secondaryPlayerSelector.setValue(null);
      this.secondaryPlayerSelector.setEnabled(false);
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryPlayerSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
    }
    this.updateScrollLayout();
  }

  private supportsSecondaryAdditionalTargetSelection(): boolean {
    return (
      this.secondaryExtraExecutions > 0 &&
      (this.secondaryActionSelection === "inspect" ||
        this.secondaryActionSelection === "place_tracker")
    );
  }

  private updateInspectAdditionalTargetToggleText(): void {
    const label =
      this.secondaryActionSelection === "place_tracker"
        ? "Place second tracker on another player"
        : "Inspect another player";
    this.secondaryInspectAdditionalTargetToggle.setText(
      this.secondaryInspectAdditionalTarget
        ? `[x] ${label}`
        : `[ ] ${label}`
    );
    this.secondaryInspectSecondPlayerSelector.setLabel(
      this.secondaryActionSelection === "place_tracker"
        ? "Second tracker target player"
        : "Additional inspected player"
    );
  }

  private refreshSecondaryInspectAdditionalTargetState(): void {
    const visible = this.supportsSecondaryAdditionalTargetSelection();
    this.secondaryInspectAdditionalTargetToggle.setVisible(visible);
    this.secondaryInspectAdditionalTargetToggle.setActive(visible);
    if (!visible) {
      this.secondaryInspectAdditionalTarget = false;
      this.setSecondaryInspectSecondTargetPlayer(null, false);
    }
    this.updateInspectAdditionalTargetToggleText();
    this.refreshSecondaryInspectSecondPlayerSelectorState();
    this.updateScrollLayout();
  }

  private refreshSecondaryInspectSecondPlayerSelectorState(): void {
    const visible =
      this.supportsSecondaryAdditionalTargetSelection() &&
      this.secondaryInspectAdditionalTarget;
    this.secondaryInspectSecondPlayerSelector.setVisible(visible);
    this.secondaryInspectSecondPlayerSelector.setActive(visible);
    this.secondaryInspectSecondPlayerSelector.setEnabled(visible);
    if (!visible) {
      this.setSecondaryInspectSecondTargetPlayer(null, false);
      this.secondaryInspectSecondPlayerSelector.hideDropdown();
    }
  }

  private refreshSecondaryItemSelectorState() {
    const isInventorySale =
      this.secondaryActionSelection === "drop" ||
      this.secondaryActionSelection === "black_market_trade";
    const availableOptions = isInventorySale
      ? this.inventoryItemOptions
      : this.itemOptions;
    const supports = this.selectedSecondaryActionSupportsItemPriority();
    const hasOptions = availableOptions.length > 0;
    const shouldShow = supports && hasOptions;
    if (!shouldShow) {
      this.secondaryItemSelector.setVisible(false);
      this.secondaryItemSelector.setActive(false);
      if (this.secondaryActionPriorityItems.length > 0) {
        this.secondaryActionPriorityItems = [];
      }
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
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryItemSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.secondaryItemSelector.setPending(false);
      this.secondaryItemSelector.hideDropdown();
    }
    this.updateScrollLayout();
  }

  private updateScrollLayout(): void {
    layoutActionPlan({
      width: this.scrollContentWidth,
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

  private setMainActionTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const supports = this.selectedActionSupportsSingleTarget();
    if (!supports) {
      const changed = this.mainActionTargetPlayerId !== null;
      if (changed) {
        this.mainActionTargetPlayerId = null;
      }
      this.playerSelector.setValue(null);
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    let normalized: string | null = null;
    if (
      targetId &&
      this.mainPlayerOptions.some((option) => option.id === targetId)
    ) {
      normalized = targetId;
    }
    const changed = this.mainActionTargetPlayerId !== normalized;
    if (!changed) {
      return false;
    }
    this.mainActionTargetPlayerId = normalized;
    this.playerSelector.setValue(normalized);
    if (
      normalized &&
      this.mainActionSelection === "scare" &&
      this.mainExtraExecutions > 0 &&
      this.mainActionTarget !== null
    ) {
      this.setMainActionTarget(null, false);
    }
    this.refreshScareSecondPlayerSelectorState();
    this.setReadyEnabled(this.readyEnabled);
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setScareSecondTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const isScare =
      this.mainActionSelection === "scare" && this.mainExtraExecutions > 0;
    const isPistolExtra =
      this.mainActionSelection === "shoot_pistol" &&
      this.mainExtraExecutions > 0;
    const supports = isScare || isPistolExtra;
    if (!supports) {
      const changed = this.scareSecondTargetPlayerId !== null;
      this.scareSecondTargetPlayerId = null;
      this.scareSecondPlayerSelector.setValue(null);
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    let normalized: string | null = null;
    if (
      targetId &&
      (isPistolExtra || targetId !== this.mainActionTargetPlayerId) &&
      this.mainPlayerOptions.some((option) => option.id === targetId)
    ) {
      normalized = targetId;
    }
    const changed = this.scareSecondTargetPlayerId !== normalized;
    if (!changed) {
      return false;
    }
    this.scareSecondTargetPlayerId = normalized;
    this.scareSecondPlayerSelector.setValue(normalized);
    if (isScare && normalized && this.mainActionTarget !== null) {
      this.setMainActionTarget(null, false);
    }
    this.refreshLocationSelectorState();
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setSecondaryActionTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const supports = this.selectedSecondaryActionSupportsSingleTarget();
    if (!supports) {
      const changed = this.secondaryActionTargetPlayerId !== null;
      if (changed) {
        this.secondaryActionTargetPlayerId = null;
      }
      this.secondaryPlayerSelector.setValue(null);
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
      if (emit && changed) {
        this.emitSecondaryActionChange();
      }
      return changed;
    }
    let normalized: string | null = null;
    if (
      targetId &&
      this.secondaryPlayerOptions.some((option) => option.id === targetId)
    ) {
      normalized = targetId;
    }
    const changed = this.secondaryActionTargetPlayerId !== normalized;
    if (!changed) {
      return false;
    }
    this.secondaryActionTargetPlayerId = normalized;
    this.secondaryPlayerSelector.setValue(normalized);
    this.secondaryInspectSecondPlayerSelector.setOptions(
      this.secondaryPlayerOptions.filter(
        (option) => option.id !== normalized
      )
    );
    if (this.secondaryInspectSecondTargetPlayerId === normalized) {
      this.setSecondaryInspectSecondTargetPlayer(null, false);
    }
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
  }

  private setSecondaryInspectSecondTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const supports =
      this.supportsSecondaryAdditionalTargetSelection() &&
      this.secondaryInspectAdditionalTarget;
    if (!supports) {
      const changed = this.secondaryInspectSecondTargetPlayerId !== null;
      this.secondaryInspectSecondTargetPlayerId = null;
      this.secondaryInspectSecondPlayerSelector.setValue(null);
      if (emit && changed) {
        this.emitSecondaryActionChange();
      }
      return changed;
    }
    const normalized =
      targetId &&
      targetId !== this.secondaryActionTargetPlayerId &&
      this.secondaryPlayerOptions.some((option) => option.id === targetId)
        ? targetId
        : null;
    const changed =
      this.secondaryInspectSecondTargetPlayerId !== normalized;
    this.secondaryInspectSecondTargetPlayerId = normalized;
    this.secondaryInspectSecondPlayerSelector.setValue(normalized);
    if (emit && changed) {
      this.emitSecondaryActionChange();
    }
    return changed;
  }

  private updatePlayerOptions(
    match: MatchRecord | null,
    usernames: Record<string, string>,
    currentUserId: string | null
  ) {
    this.playerOptions = buildPlayerOptions(
      match,
      usernames,
      currentUserId,
      this.playerAccounts,
      (playerId, accountSkin) =>
        this.playerOptionSkinCache.resolve(
          playerId,
          accountSkin,
          currentUserId,
          this.currentPlayerSkin,
          1
        )
    );
    this.playerOptionSkinCache.retain(
      new Set(this.playerOptions.map((option) => option.id))
    );
    this.currentUserId = currentUserId ?? null;
    this.refreshPlayerOptionsForSelectors();
    this.refreshPlayerSelectorState();
    this.refreshSecondaryPlayerSelectorState();
  }

  openPlayerCard(playerId: string): boolean {
    const opened = this.playersTabView.openPlayerCard(playerId);
    if (!opened) {
      return false;
    }
    this.tabsController.setActiveTab("players");
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
        extraSecondaryAllowsSelf:
          this.selectedExtraSecondaryActionCanTargetSelf()
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
    this.scareSecondPlayerSelector.setOptions(
      this.mainActionSelection === "shoot_pistol" &&
        this.mainExtraExecutions > 0
        ? mainOptions
        : mainOptions.filter(
            (option) => option.id !== this.mainActionTargetPlayerId
          )
    );
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
    const definition =
      ActionLibrary[this.extraSecondaryActionSelection as ActionId];
    return definition?.tags?.includes("CanTargetSelf") === true;
  }

  private filterPriorityIds(
    ids: string[],
    optionsList: ItemPriorityOption[] = this.itemOptions
  ): string[] {
    if (!Array.isArray(ids) || ids.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const value of ids) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      const option = optionsList.find((entry) => entry.id === trimmed);
      if (!option || option.disabled) {
        continue;
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
      this.getMainActionItemOptions()
    );
    if (this.isSameTargetItems(this.mainActionPriorityItems, filtered)) {
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

  private setSecondaryActionPriorityItems(
    ids: string[],
    emit = false
  ): boolean {
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
    if (this.isSameTargetItems(this.secondaryActionPriorityItems, filtered)) {
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

  private updateItemOptions(
    match: MatchRecord | null,
    currentUserId: string | null
  ) {
    const options = buildCharacterPanelItemOptions(match, currentUserId);
    this.inventoryItemOptions = options.inventoryItems;
    this.itemOptions = options.groundItems;
    this.stealItemOptions = options.stealItems;
    const normalizedMain = this.filterPriorityIds(
      this.mainActionPriorityItems,
      this.getMainActionItemOptions()
    );
    this.mainActionPriorityItems = normalizedMain;
    const normalizedSecondary = this.filterPriorityIds(
      this.secondaryActionPriorityItems,
      this.secondaryActionSelection === "drop" ||
      this.secondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : this.itemOptions
    );
    this.secondaryActionPriorityItems = normalizedSecondary;
    const normalizedExtraSecondary = this.filterPriorityIds(
      this.extraSecondaryActionPriorityItems,
      this.extraSecondaryActionSelection === "drop" ||
      this.extraSecondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : this.itemOptions
    );
    this.extraSecondaryActionPriorityItems = normalizedExtraSecondary;
    if (this.selectedActionSupportsItemPriority()) {
      this.itemSelector.setValue(normalizedMain, false);
    } else {
      this.itemSelector.setValue([], false);
    }
    if (this.selectedSecondaryActionSupportsItemPriority()) {
      this.secondaryItemSelector.setValue(normalizedSecondary, false);
    } else {
      this.secondaryItemSelector.setValue([], false);
    }
    if (this.selectedExtraSecondaryActionSupportsItemPriority()) {
      this.extraSecondaryItemSelector.setValue(normalizedExtraSecondary, false);
    } else {
      this.extraSecondaryItemSelector.setValue([], false);
    }
    this.refreshItemSelectorState();
    this.refreshSecondaryItemSelectorState();
    this.refreshExtraSecondaryItemSelectorState();
  }

  private selectedActionSupportsLocation() {
    return actionSupportsLocation(this.lastMainActionItem);
  }

  private selectedMainActionSupportsLocation(): boolean {
    const isScare = this.mainActionSelection === "scare";
    return (
      this.selectedActionSupportsLocation() &&
      (!isScare || this.mainExtraExecutions > 0) &&
      (!isScare || this.scareSecondTargetPlayerId === null)
    );
  }

  private selectedMainActionSupportsSecondLocation(): boolean {
    return (
      (this.mainActionSelection === "shoot_pistol" ||
        this.mainActionSelection === "place_trap" ||
        this.mainActionSelection === "detonate_c4") &&
      this.mainExtraExecutions > 0 &&
      this.selectedActionSupportsLocation()
    );
  }

  private selectedActionSupportsSingleTarget() {
    return actionSupportsSingleTarget(this.lastMainActionItem);
  }

  private selectedActionSupportsItemPriority() {
    return actionSupportsTargetItems(
      this.lastMainActionItem,
      this.mainActionSelection,
      this.hasDexterity2()
    );
  }

  private hasDexterity2(): boolean {
    return this.getCurrentCharacter()?.abilities?.includes("dexterity2") ?? false;
  }

  private getMainActionItemOptions(): ItemPriorityOption[] {
    if (this.mainActionSelection === "give") {
      return this.inventoryItemOptions;
    }
    if (this.mainActionSelection === "throw_object") {
      return this.inventoryItemOptions.filter(
        (option) => option.id !== "zarkans"
      );
    }
    return this.mainActionSelection === "steal"
      ? this.stealItemOptions
      : this.itemOptions;
  }

  private selectedSecondaryActionSupportsLocation() {
    return actionSupportsLocation(this.lastSecondaryActionItem);
  }

  private selectedSecondaryActionSupportsSingleTarget() {
    if (this.secondaryActionSelection === "use_chemical_weapon") {
      return this.secondaryChemicalSingleTarget;
    }
    return actionSupportsSingleTarget(this.lastSecondaryActionItem);
  }

  private selectedSecondaryActionSupportsItemPriority() {
    return actionSupportsTargetItems(
      this.lastSecondaryActionItem,
      this.secondaryActionSelection,
      false
    );
  }

  private hasExtraSecondaryAction(): boolean {
    return (
      getSkillEffectTotal(
        this.getCurrentCharacter(),
        "extra_secondary_action"
      ) > 0
    );
  }

  private selectedExtraSecondaryActionSupportsLocation() {
    return actionSupportsLocation(this.lastExtraSecondaryActionItem);
  }

  private selectedExtraSecondaryActionSupportsSingleTarget() {
    if (this.extraSecondaryActionSelection === "use_chemical_weapon") {
      return this.extraSecondaryChemicalSingleTarget;
    }
    return actionSupportsSingleTarget(this.lastExtraSecondaryActionItem);
  }

  private selectedExtraSecondaryActionSupportsItemPriority() {
    return actionSupportsTargetItems(
      this.lastExtraSecondaryActionItem,
      this.extraSecondaryActionSelection,
      false
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

  private emitMainActionChange() {
    const payload = buildMainActionSelection({
      actionId: this.mainActionSelection,
      targetLocation: this.mainActionTarget,
      secondTargetLocation: this.mainActionSecondTarget,
      targetPlayerId: this.mainActionTargetPlayerId,
      secondTargetPlayerId: this.scareSecondTargetPlayerId,
      targetItemIds: this.mainActionPriorityItems,
      extraExecutions: this.mainExtraExecutions,
      supportsLocation: this.selectedMainActionSupportsLocation(),
      supportsSecondLocation: this.selectedMainActionSupportsSecondLocation(),
      supportsPlayer: this.selectedActionSupportsSingleTarget(),
      supportsItems: this.selectedActionSupportsItemPriority(),
      supportsExtra: this.selectedActionSupportsExtraExecution(),
      secondTargetPlayerIsPistolTarget:
        this.mainActionSelection === "shoot_pistol" &&
        this.mainExtraExecutions > 0,
      secondTargetPlayerIsScareTarget:
        this.mainActionSelection === "scare" && this.mainExtraExecutions > 0
    });
    this.emit("main-action-change", payload);
  }

  private emitSecondaryActionChange() {
    const payload = buildSecondaryActionSelection({
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
      hasAdditionalTarget:
        this.supportsSecondaryAdditionalTargetSelection() &&
        this.secondaryInspectAdditionalTarget &&
        this.secondaryInspectSecondTargetPlayerId !== null
    });
    this.emit("secondary-action-change", payload);
  }

  private emitExtraSecondaryActionChange() {
    const payload = buildExtraSecondaryActionSelection({
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
      supportsExtra:
        this.selectedExtraSecondaryActionSupportsExtraExecution(),
      hasAdditionalTarget: false
    });
    this.emit("extra-secondary-action-change", payload);
  }

  private syncMainActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverSecondTargetLocation: Axial | null,
    serverTargetPlayerId: string | null,
    serverSecondTargetPlayerId: string | null,
    serverTargetItems: string[] | null
  ): void {
    const matchesSelection =
      (this.mainActionSelection ?? null) === (serverActionId ?? null);
    const matchesLocation = this.isSameAxial(
      this.mainActionTarget,
      serverTargetLocation
    );
    const matchesSecondLocation = this.isSameAxial(
      this.mainActionSecondTarget,
      serverSecondTargetLocation
    );
    const matchesPlayer =
      (this.mainActionTargetPlayerId ?? null) ===
      (serverTargetPlayerId ?? null);
    const matchesSecondPlayer =
      (this.scareSecondTargetPlayerId ?? null) ===
      (serverSecondTargetPlayerId ?? null);
    const matchesItems = this.isSameTargetItems(
      this.mainActionPriorityItems,
      serverTargetItems
    );
    if (
      !matchesSelection ||
      !matchesLocation ||
      !matchesSecondLocation ||
      !matchesPlayer ||
      !matchesSecondPlayer ||
      !matchesItems
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
    serverSellInstead: boolean = false
  ): void {
    const matchesSelection =
      (this.secondaryActionSelection ?? null) === (serverActionId ?? null);
    const matchesLocation = this.isSameAxial(
      this.secondaryActionTarget,
      serverTargetLocation
    );
    const matchesPlayer =
      (this.secondaryActionTargetPlayerId ?? null) ===
      (serverTargetPlayerId ?? null);
    const matchesItems = this.isSameTargetItems(
      this.secondaryActionPriorityItems,
      serverTargetItems
    );
    const matchesFoodDrinkPriority =
      this.secondaryActionSelection !== "search" ||
      this.secondaryPrioritizeFoodDrink === serverPrioritizeFoodDrink;
    const matchesSellInstead =
      this.secondaryActionSelection !== "drop" ||
      this.secondarySellInstead === serverSellInstead;
    if (
      !matchesSelection ||
      !matchesLocation ||
      !matchesPlayer ||
      !matchesItems ||
      !matchesFoodDrinkPriority ||
      !matchesSellInstead
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
    serverSellInstead: boolean = false
  ): void {
    const matchesSelection =
      (this.extraSecondaryActionSelection ?? null) ===
      (serverActionId ?? null);
    const matchesLocation = this.isSameAxial(
      this.extraSecondaryActionTarget,
      serverTargetLocation
    );
    const matchesPlayer =
      (this.extraSecondaryActionTargetPlayerId ?? null) ===
      (serverTargetPlayerId ?? null);
    const matchesItems = this.isSameTargetItems(
      this.extraSecondaryActionPriorityItems,
      serverTargetItems
    );
    const matchesFoodDrinkPriority =
      this.extraSecondaryActionSelection !== "search" ||
      this.extraSecondaryPrioritizeFoodDrink === serverPrioritizeFoodDrink;
    const matchesSellInstead =
      this.extraSecondaryActionSelection !== "drop" ||
      this.extraSecondarySellInstead === serverSellInstead;
    if (
      !matchesSelection ||
      !matchesLocation ||
      !matchesPlayer ||
      !matchesItems ||
      !matchesFoodDrinkPriority ||
      !matchesSellInstead
    ) {
      this.emitExtraSecondaryActionChange();
    }
  }

  setMainActionTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedMainActionSupportsLocation();
    if (!supports) {
      const changed = this.mainActionTarget !== null;
      if (changed) {
        this.mainActionTarget = null;
        this.setReadyEnabled(this.readyEnabled);
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setPending(false);
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    const normalized = this.normalizeAxial(target);
    if (this.isSameAxial(normalized, this.mainActionTarget)) {
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
    this.setReadyEnabled(this.readyEnabled);
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
    const normalized = this.normalizeAxial(target);
    if (this.isSameAxial(normalized, this.mainActionSecondTarget)) {
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
    const normalized = this.normalizeAxial(target);
    if (this.isSameAxial(normalized, this.secondaryActionTarget)) {
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

  private setExtraSecondaryActionTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsSingleTarget();
    if (!supports) {
      const changed = this.extraSecondaryActionTargetPlayerId !== null;
      this.extraSecondaryActionTargetPlayerId = null;
      this.extraSecondaryPlayerSelector.setValue(null);
      if (emit && changed) {
        this.emitExtraSecondaryActionChange();
      }
      return changed;
    }
    const normalized = targetId &&
      this.extraSecondaryPlayerOptions.some((option) => option.id === targetId)
      ? targetId
      : null;
    const changed = this.extraSecondaryActionTargetPlayerId !== normalized;
    this.extraSecondaryActionTargetPlayerId = normalized;
    this.extraSecondaryPlayerSelector.setValue(normalized);
    if (emit && changed) {
      this.emitExtraSecondaryActionChange();
    }
    return changed;
  }

  private setExtraSecondaryActionPriorityItems(
    ids: string[],
    emit = false
  ): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsItemPriority();
    if (!supports) {
      const changed = this.extraSecondaryActionPriorityItems.length > 0;
      this.extraSecondaryActionPriorityItems = [];
      this.extraSecondaryItemSelector.setValue([], false);
      if (emit && changed) {
        this.emitExtraSecondaryActionChange();
      }
      return changed;
    }
    const optionsList =
      this.extraSecondaryActionSelection === "drop" ||
      this.extraSecondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : this.itemOptions;
    const filtered = this.filterPriorityIds(ids, optionsList);
    if (this.isSameTargetItems(this.extraSecondaryActionPriorityItems, filtered)) {
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

  setExtraSecondaryActionTarget(
    target: Axial | null,
    emit = false
  ): boolean {
    const supports = this.selectedExtraSecondaryActionSupportsLocation();
    if (!supports) {
      const changed = this.extraSecondaryActionTarget !== null;
      this.extraSecondaryActionTarget = null;
      this.extraSecondaryLocationSelector.setValue(null);
      if (emit && changed) {
        this.emitExtraSecondaryActionChange();
      }
      return changed;
    }
    const normalized = this.normalizeAxial(target);
    if (this.isSameAxial(normalized, this.extraSecondaryActionTarget)) {
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

  getMainActionSelection(): MainActionSelection {
    return buildMainActionSelection({
      actionId: this.mainActionSelection,
      targetLocation: this.mainActionTarget,
      secondTargetLocation: this.mainActionSecondTarget,
      targetPlayerId: this.mainActionTargetPlayerId,
      secondTargetPlayerId: this.scareSecondTargetPlayerId,
      targetItemIds: this.mainActionPriorityItems,
      extraExecutions: this.mainExtraExecutions,
      supportsLocation: this.selectedActionSupportsLocation(),
      supportsSecondLocation: this.selectedMainActionSupportsSecondLocation(),
      supportsPlayer: this.selectedActionSupportsSingleTarget(),
      supportsItems: this.selectedActionSupportsItemPriority(),
      supportsExtra: this.selectedActionSupportsExtraExecution(),
      secondTargetPlayerIsPistolTarget:
        this.mainActionSelection === "shoot_pistol" &&
        this.mainExtraExecutions > 0,
      secondTargetPlayerIsScareTarget: false
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
        hasAdditionalTarget:
          this.supportsSecondaryAdditionalTargetSelection() &&
          this.secondaryInspectAdditionalTarget &&
          this.secondaryInspectSecondTargetPlayerId !== null
      },
      { includeSellInstead: false, includeTargetItems: false }
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
        supportsExtra:
          this.selectedExtraSecondaryActionSupportsExtraExecution(),
        hasAdditionalTarget: false
      },
      { includeToggles: false, includeTargetLists: false }
    );
  }

  setLocationSelectionPending(active: boolean): void {
    if (!this.selectedActionSupportsLocation()) {
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

  private normalizeAxial(target: Axial | null): Axial | null {
    if (!target) {
      return null;
    }
    const q = typeof target.q === "number" ? target.q : Number(target.q);
    const r = typeof target.r === "number" ? target.r : Number(target.r);
    if (Number.isNaN(q) || Number.isNaN(r)) {
      return null;
    }
    return { q, r };
  }

  private normalizePlayerId(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isSameAxial(a: Axial | null, b: Axial | null) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.q === b.q && a.r === b.r;
  }

  private isSameTargetItems(
    local: string[] | undefined | null,
    remote: string[] | undefined | null
  ): boolean {
    const normalize = (input: string[] | undefined | null) => {
      if (!input || input.length === 0) {
        return [] as string[];
      }
      const result: string[] = [];
      for (const value of input) {
        if (typeof value !== "string") {
          continue;
        }
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }
        result.push(trimmed);
      }
      return result;
    };
    const a = normalize(local);
    const b = normalize(remote);
    if (a.length !== b.length) {
      return false;
    }
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return false;
      }
    }
    return true;
  }

  private handleTabRequest(key: TabKey) {
    this.tabsController.setActiveTab(key);
  }

  openLogTab(): void {
    this.tabsController.setActiveTab("log");
  }

  setLogTurnInfo(maxTurn: number, initialTurn?: number) {
    this.logView.setTurnInfo(maxTurn, initialTurn);
  }

  setLogReplay(turn: number, maxTurn: number, events: ReplayEvent[]) {
    this.logView.setReplay(turn, maxTurn, events);
  }

  appendLogReplay(turn: number, maxTurn: number, events: ReplayEvent[]) {
    this.logView.appendReplay(turn, maxTurn, events);
  }

  setLogError(message: string) {
    this.logView.setError(message);
  }

  setLogLoading(active: boolean) {
    this.logView.setLoading(active);
  }

  setLogPlaybackState(active: boolean) {
    this.logView.setPlaybackState(active);
  }

  beginDetectivePurchase(): void {
    this.shopView.beginDetectivePurchase();
  }

  finishDetectivePurchase(): void {
    this.shopView.finishDetectivePurchase();
  }

  finishShopPurchase(): void {
    this.shopView.finishShopPurchase();
  }

  setDonationPending(pending: boolean, error?: string): void {
    this.shopView.setDonationPending(pending, error);
  }

  closeDonationModal(): void {
    this.shopView.closeDonationModal();
  }

  beginSpyDronePurchase(): void {
    this.shopView.beginSpyDronePurchase();
  }

  beginPyromaniacPurchase(): void {
    this.shopView.beginPyromaniacPurchase();
  }

  beginBomberPurchase(): void {
    this.shopView.beginBomberPurchase();
  }

  closeCurrentGridSelect(): void {
    this.mainActionDropdown.hideModal();
    this.playerSelector.hideDropdown();
    this.scareSecondPlayerSelector.hideDropdown();
    this.itemSelector.hideDropdown();
    this.secondaryActionDropdown.hideModal();
    this.secondaryPlayerSelector.hideDropdown();
    this.secondaryInspectSecondPlayerSelector.hideDropdown();
    this.secondaryItemSelector.hideDropdown();
    this.extraSecondaryActionDropdown.hideModal();
    this.extraSecondaryPlayerSelector.hideDropdown();
    this.extraSecondaryItemSelector.hideDropdown();
    this.shopView.closeModal();
  }
}
