import Phaser from "phaser";
import {
  ActionLibrary,
  type ActionDefinition,
  type ActionId,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  ActionCategory,
  type ReplayEvent,
  ItemLibrary,
  type ItemId,
  type ItemDefinition,
  DEFAULT_SKIN,
  Skin,
  PlayerCharacterUnknown,
  getActionEnergyDiscount,
  getSkillEffectTotal,
  LocalizationType,
  type HexTileSnapshot
} from "@shared";
import { GridSelect, type GridSelectItem } from "./GridSelect";
import { deriveBoardIconKey, isBoardIconTexture } from "./actionIcons";
import { ProgressBar } from "./ProgressBar";
import { LocationSelector } from "./LocationSelector";
import { ExtraExecutionSelector } from "./ExtraExecutionSelector";
import { PlayerSelector, type PlayerOption } from "./PlayerSelector";
import {
  ItemPrioritySelector,
  type ItemPriorityOption
} from "./ItemPrioritySelector";
import {
  CharacterPanelTabs,
  type CharacterPanelTabEntry,
  type TabKey
} from "./CharacterPanelTabs";
import { CharacterPanelLogView } from "./CharacterPanelLogView";
import { InventoryGrid, type InventoryGridItem } from "./InventoryGrid";
import { resolveItemTexture } from "./itemIcons";
import { THEME } from "./ColorPalette";
import { createSkinContainer, SkinContainer } from "./PlayerSkinRenderer";
import {
  CharacterPanelChatView,
  type ChatConnectionState,
  type ChatMessageViewModel
} from "./CharacterPanelChatView";
import { CharacterPanelPlayerListView } from "./CharacterPanelPlayerListView";
import { Subtabs } from "./Subtabs";
import { CharacterPanelSkillsView } from "./CharacterPanelSkillsView";
import { CharacterPanelShopView } from "./CharacterPanelShopView";
import { t } from "../services/i18n";

export type CharacterSubTabKey = "status" | "skills";

export type {
  ChatMessageViewModel,
  ChatConnectionState
} from "./CharacterPanelChatView";

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
const MOBILE_TAB_MIN_WIDTH = 82;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 180;
const PRIMARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter(
    (definition) =>
      definition.category === ActionCategory.Primary && !definition.hidden
  )
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));
const SECONDARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter(
    (definition) =>
      definition.category === ActionCategory.Secondary && !definition.hidden
  )
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));

const ACTION_REQUIRED_LOCATIONS: Partial<Record<ActionId, LocalizationType[]>> = {
  breakfast: [LocalizationType.Restaurant],
  recover: [LocalizationType.Hospital],
  refuel: [LocalizationType.GasStation],
  fabricate: [LocalizationType.Workshop],
  activate_cameras: [LocalizationType.Security],
  black_market_trade: [LocalizationType.Market],
  look_through_window: [LocalizationType.House, LocalizationType.Pharmacy]
};

const LOCATION_DISPLAY_NAMES: Partial<Record<LocalizationType, string>> = {
  [LocalizationType.Restaurant]: "restaurant",
  [LocalizationType.Hospital]: "hospital",
  [LocalizationType.GasStation]: "gas station",
  [LocalizationType.Workshop]: "workshop",
  [LocalizationType.Security]: "security room",
  [LocalizationType.Market]: "black market",
  [LocalizationType.House]: "house",
  [LocalizationType.Pharmacy]: "pharmacy"
};

const ITEM_DISPLAY_NAMES: Record<string, string> = {
  axe: "axe",
  bat: "bat",
  nail_bat: "nail bat",
  knife: "knife",
  bandage: "bandage",
  medicine: "medicine",
  chemical_weapon: "chemical weapon",
  fuel: "fuel",
  chainsaw: "chainsaw",
  pistol: "pistol",
  suppressed_pistol: "silenced pistol",
  bullet: "bullet",
  harpoon: "harpoon",
  arrow: "arrow",
  rocket_launcher: "rocket launcher",
  antidote: "antidote",
  virus: "virus",
  vaccine: "vaccine",
  poison: "poison",
  tracker: "tracker",
  c4: "c4",
  trap: "trap",
  detonator: "detonator",
  binoculars: "binoculars"
};

export type MainActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerIds?: string[];
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

type LogEliminationPayload = {
  playerId: string;
  playerName: string;
  teamName?: string;
  turn: number;
};

type PlayerEliminatedPayload = {
  playerId: string;
  playerName: string;
  teamName?: string;
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
  private mobileTabNavigation = false;
  private tabStartIndex = 0;
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
  private logView!: CharacterPanelLogView;
  private chatView!: CharacterPanelChatView;
  private portrait: SkinContainer;
  private nameText: Phaser.GameObjects.Text;
  private healthLabel: Phaser.GameObjects.Text;
  private energyLabel: Phaser.GameObjects.Text;
  private healthBar: ProgressBar;
  private energyBar: ProgressBar;
  private readyToggle!: Phaser.GameObjects.Text;
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
  private itemsBackground!: Phaser.GameObjects.Rectangle;
  private itemsTitle!: Phaser.GameObjects.Text;
  private inventoryGrid!: InventoryGrid;
  private scrollPanel: ScrollablePanelInstance | null = null;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private scrollContent: Phaser.GameObjects.Container;
  private scrollContentWidth = 0;
  private scrollTop = 0;
  private gridModalOpenCount = 0;
  private panelWidth: number;
  private panelHeight: number;
  private barWidth: number;
  private mainActionSelection: string | null = null;
  private secondaryActionSelection: string | null = null;
  private extraSecondaryActionSelection: string | null = null;
  private currentTurn = 0;
  private mainActionTarget: Axial | null = null;
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
  private currentPlayerSkin: import("@shared").Skin | null = null;
  private playerAccounts = new Map<string, import("@shared").UserAccount>();
  private lastUserMap: Record<string, string> = {};
  private playerOptionSkinIcons = new Map<
    string,
    { textureKey: string; signature: string }
  >();
  private readonly handleMainExtraExecutionChange = (reps: number) => {
    this.mainExtraExecutions = reps;
    this.refreshLocationSelectorState();
    this.refreshScareSecondPlayerSelectorState();
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
      this.setMainActionTargetPlayer(null, false);
      this.setMainActionPriorityItems([], false);
    }
    this.refreshPlayerOptionsForSelectors();
    this.refreshExtraExecutionSelectorState();
    this.refreshLocationSelectorState();
    this.refreshPlayerSelectorState();
    this.emitMainActionChange();
  };
  private readonly handleLocationPickRequest = () => {
    if (!this.mainActionSelection || !this.selectedActionSupportsLocation()) {
      return;
    }
    this.emit("main-action-location-request");
  };
  private readonly handleLocationClear = () => {
    this.setMainActionTarget(null, true);
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
    if (!this.readyEnabled) {
      return;
    }
    this.setReadyState(!this.readyState, true);
  };
  private readonly handleTestamentChange = (recipientId: string | null) => {
    this.emit("testament-change", recipientId);
  };
  private readyPointerIsDown = false;
  private readonly handleReadyPointerDown = (
    pointer: Phaser.Input.Pointer,
    localX: number,
    localY: number,
    event: Phaser.Types.Input.EventData
  ) => {
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
    const character =
      this.currentMatch?.playerCharacters?.[payload.playerId] ?? null;
    const sprite = this.resolvePlayerSpriteInfo(
      payload.playerId,
      character,
      this.playerAccounts.get(payload.playerId)?.cosmetics.selectedSkinId ??
        null,
      1
    );
    const teamName = payload.teamName || character?.teamId || undefined;
    const eventPayload: PlayerEliminatedPayload = {
      playerId: payload.playerId,
      playerName: payload.playerName,
      teamName,
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
    this.barWidth = width - (PORTRAIT_SIZE + MARGIN * 3);
    this.setSize(width, height);
    this.setScrollFactor(0);
    scene.add.existing(this);
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
    this.tabPreviousButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.moveTabWindow(-1);
    });
    this.tabPreviousText.on(Phaser.Input.Events.POINTER_UP, () => {
      this.moveTabWindow(-1);
    });
    this.tabNextButton.on(Phaser.Input.Events.POINTER_UP, () => {
      this.moveTabWindow(1);
    });
    this.tabNextText.on(Phaser.Input.Events.POINTER_UP, () => {
      this.moveTabWindow(1);
    });
    this.add(this.tabPreviousButton);
    this.add(this.tabPreviousText);
    this.add(this.tabNextButton);
    this.add(this.tabNextText);
    this.layoutTabs(width);

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
    const portraitScale = PORTRAIT_SIZE / 16;
    this.portrait = createSkinContainer(
      scene,
      MARGIN + PORTRAIT_SIZE / 2,
      statusContentTop + PORTRAIT_SIZE / 2,
      DEFAULT_SKIN,
      portraitScale
    );
    this.add(this.portrait);
    this.nameText = scene.add
      .text(MARGIN, statusContentTop - 14, "", {
        fontSize: "18px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    this.add(this.nameText);
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    this.healthLabel = scene.add
      .text(barX, statusContentTop - 14, "Health", {
        fontSize: "14px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0);
    this.add(this.healthLabel);
    this.healthBar = new ProgressBar(scene, barX, statusContentTop, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: THEME.colors.healthAccent
    });
    this.add(this.healthBar);
    this.energyLabel = scene.add
      .text(barX, statusContentTop + 32, t("Energy"), {
        fontSize: "14px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0);
    this.add(this.energyLabel);
    this.energyBar = new ProgressBar(scene, barX, statusContentTop + 46, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: THEME.colors.energyAccent
    });
    this.add(this.energyBar);
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
      cellHeight: 260
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
    this.scareSecondPlayerSelector.setLabel("Second Target Player");
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
      emptyOptionDescription: "Removes the planned secondary action."
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
      emptyOptionDescription: "Removes the extra secondary action."
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
    const itemsBoxY = contentTop;
    const itemsBoxHeight = Math.max(
      BOX_HEIGHT * 2,
      height - itemsBoxY - MARGIN
    );
    const itemsBoxWidth = boxWidth;
    this.itemsBackground = scene.add
      .rectangle(MARGIN, itemsBoxY, itemsBoxWidth, itemsBoxHeight, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.itemsBackground.setStrokeStyle?.(1, 0x253055, 0.8);
    this.add(this.itemsBackground);
    this.itemsTitle = scene.add
      .text(MARGIN + 12, itemsBoxY + 12, "Inventory", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    this.add(this.itemsTitle);
    this.inventoryGrid = new InventoryGrid(
      scene,
      MARGIN + 12,
      itemsBoxY + 48,
      itemsBoxWidth - 24,
      Math.max(0, itemsBoxHeight - 60),
      { columns: 2, iconSize: 32 }
    );
    this.inventoryGrid.setVisible(false);
    this.inventoryGrid.setActive(false);
    this.add(this.inventoryGrid);
    this.inventoryGrid.setItems([]);
    this.itemsElements = [
      this.itemsBackground,
      this.itemsTitle,
      this.inventoryGrid
    ];
    this.shopView = new CharacterPanelShopView(scene, this, {
      margin: MARGIN,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight
    });
    this.shopView.on("testament-change", this.handleTestamentChange, this);
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
      formatActionName: (id) => this.formatActionName(id),
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
      this.portrait,
      this.nameText,
      this.healthLabel,
      this.energyLabel,
      this.healthBar,
      this.energyBar,
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
        this.inventoryGrid.setActive(true);
        this.inventoryGrid.refreshLayout();
      },
      onItemsTabHide: () => {
        this.inventoryGrid.setActive(false);
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
        this.revealTab(key);
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
    this.disposePlayerOptionSkinIcons();
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

  setMobileTabNavigation(enabled: boolean): void {
    const modeChanged = this.mobileTabNavigation !== enabled;
    this.mobileTabNavigation = enabled;
    if (!enabled) {
      this.tabStartIndex = 0;
      this.layoutTabs(this.panelWidth);
      return;
    }
    if (modeChanged) {
      this.tabStartIndex = 0;
      const activeKey = this.tabsController?.getActiveTab();
      if (activeKey) {
        this.revealTab(activeKey);
        return;
      }
    }
    this.layoutTabs(this.panelWidth);
  }

  private getMobileVisibleTabCount(width: number): number {
    if (width >= this.tabs.length * MOBILE_TAB_MIN_WIDTH) {
      return this.tabs.length;
    }
    const availableWidth = Math.max(1, width - TAB_ARROW_WIDTH * 2);
    return Math.max(
      1,
      Math.min(
        this.tabs.length,
        Math.floor(availableWidth / MOBILE_TAB_MIN_WIDTH)
      )
    );
  }

  private revealTab(key: TabKey): void {
    if (!this.mobileTabNavigation) {
      return;
    }
    const tabIndex = this.tabs.findIndex((tab) => tab.key === key);
    const visibleCount = this.getMobileVisibleTabCount(this.panelWidth);
    if (tabIndex < 0 || visibleCount >= this.tabs.length) {
      this.tabStartIndex = 0;
      this.layoutTabs(this.panelWidth);
      return;
    }
    if (tabIndex < this.tabStartIndex) {
      this.tabStartIndex = tabIndex;
    } else if (tabIndex >= this.tabStartIndex + visibleCount) {
      this.tabStartIndex = tabIndex - visibleCount + 1;
    }
    this.layoutTabs(this.panelWidth);
  }

  private moveTabWindow(delta: number): void {
    if (!this.mobileTabNavigation) {
      return;
    }
    const visibleCount = this.getMobileVisibleTabCount(this.panelWidth);
    if (visibleCount >= this.tabs.length) {
      return;
    }
    const maxStart = this.tabs.length - visibleCount;
    this.tabStartIndex = Math.max(
      0,
      Math.min(maxStart, this.tabStartIndex + delta)
    );
    this.layoutTabs(this.panelWidth);
  }

  private layoutTabs(width: number): void {
    const compact =
      this.mobileTabNavigation &&
      this.getMobileVisibleTabCount(width) < this.tabs.length;
    const visibleCount = compact
      ? this.getMobileVisibleTabCount(width)
      : this.tabs.length;
    const tabAreaWidth = compact ? Math.max(1, width - TAB_ARROW_WIDTH * 2) : width;
    const tabWidth = tabAreaWidth / Math.max(1, visibleCount);

    if (!compact) {
      this.tabStartIndex = 0;
    } else {
      this.tabStartIndex = Math.max(
        0,
        Math.min(this.tabs.length - visibleCount, this.tabStartIndex)
      );
    }

    this.tabs.forEach((tab, index) => {
      const visible =
        !compact ||
        (index >= this.tabStartIndex &&
          index < this.tabStartIndex + visibleCount);
      if (!visible) {
        tab.rect.setVisible(false).disableInteractive();
        tab.text.setVisible(false).disableInteractive();
        tab.badge?.setVisible(false);
        return;
      }
      const displayIndex = compact ? index - this.tabStartIndex : index;
      const tabX = (compact ? TAB_ARROW_WIDTH : 0) + displayIndex * tabWidth;
      tab.rect
        .setPosition(tabX, 0)
        .setSize(tabWidth, TAB_HEIGHT)
        .setVisible(true)
        .setInteractive({ useHandCursor: true });
      tab.text
        .setPosition(tabX + tabWidth / 2, TAB_HEIGHT / 2)
        .setVisible(true)
        .setInteractive({ useHandCursor: true });
      tab.badge
        ?.setPosition(tabX + tabWidth - 10, 6)
        .setVisible(this.tabsController?.isTabUnread(tab.key) ?? false);
    });

    const showArrows = compact;
    this.tabPreviousButton.setVisible(showArrows);
    this.tabPreviousText.setVisible(showArrows);
    this.tabNextButton.setVisible(showArrows);
    this.tabNextText.setVisible(showArrows);
    if (!showArrows) {
      this.tabPreviousButton.disableInteractive();
      this.tabPreviousText.disableInteractive();
      this.tabNextButton.disableInteractive();
      this.tabNextText.disableInteractive();
      return;
    }

    const canMovePrevious = this.tabStartIndex > 0;
    const canMoveNext = this.tabStartIndex + visibleCount < this.tabs.length;
    this.tabPreviousButton.setPosition(0, 0).setAlpha(canMovePrevious ? 1 : 0.35);
    this.tabPreviousText
      .setPosition(TAB_ARROW_WIDTH / 2, TAB_HEIGHT / 2)
      .setAlpha(canMovePrevious ? 1 : 0.35);
    this.tabNextButton
      .setPosition(width - TAB_ARROW_WIDTH, 0)
      .setAlpha(canMoveNext ? 1 : 0.35);
    this.tabNextText
      .setPosition(width - TAB_ARROW_WIDTH / 2, TAB_HEIGHT / 2)
      .setAlpha(canMoveNext ? 1 : 0.35);
    if (canMovePrevious) {
      this.tabPreviousButton.setInteractive({ useHandCursor: true });
      this.tabPreviousText.setInteractive({ useHandCursor: true });
    } else {
      this.tabPreviousButton.disableInteractive();
      this.tabPreviousText.disableInteractive();
    }
    if (canMoveNext) {
      this.tabNextButton.setInteractive({ useHandCursor: true });
      this.tabNextText.setInteractive({ useHandCursor: true });
    } else {
      this.tabNextButton.disableInteractive();
      this.tabNextText.disableInteractive();
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
    this.barWidth = width - (PORTRAIT_SIZE + MARGIN * 3);
    this.setSize(width, height);
    this.background.setSize(width, height);
    this.layoutTabs(width);
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
    this.portrait.setPosition(
      MARGIN + PORTRAIT_SIZE / 2,
      statusContentTop + PORTRAIT_SIZE / 2
    );
    this.nameText.setPosition(MARGIN, statusContentTop - 14);
    this.healthLabel.setPosition(barX, statusContentTop - 14);
    this.healthBar.setPosition(barX, statusContentTop);
    this.energyBar.setPosition(barX, statusContentTop + 46);
    this.healthBar.resize(this.barWidth, BAR_HEIGHT);
    this.energyBar.resize(this.barWidth, BAR_HEIGHT);
    if (this.readyToggle) {
      this.readyToggle.setPosition(barX, statusContentTop + 80);
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
    const itemsBoxHeight = Math.max(
      BOX_HEIGHT * 2,
      height - itemsBoxY - MARGIN
    );
    this.itemsBackground.setPosition(MARGIN, itemsBoxY);
    this.itemsBackground.setSize(itemsBoxWidth, itemsBoxHeight);
    this.itemsBackground.setDisplaySize(itemsBoxWidth, itemsBoxHeight);
    this.itemsTitle.setPosition(MARGIN + 12, itemsBoxY + 12);
    this.inventoryGrid.setPosition(MARGIN + 12, itemsBoxY + 48);
    this.inventoryGrid.setDimensions(
      itemsBoxWidth - 24,
      Math.max(0, itemsBoxHeight - 60)
    );
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

  setCurrentPlayerSkin(skin: import("@shared").Skin) {
    this.currentPlayerSkin = skin;
    this.portrait.updateSkin(skin, this.scene.textures);
  }

  setPlayerAccount(userId: string, account: import("@shared").UserAccount) {
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
  }

  private applyCharacter(
    character: PlayerCharacter | null,
    playerName: string | null,
    ready: boolean
  ) {
    this.skillsView?.update(character);
    if (!character) {
      this.nameText.setText("No character");
      this.useBarValue(this.healthBar, 0);
      this.useBarValue(this.energyBar, 0);
      this.energyLabel.setText(t("Energy"));
      this.applyMainActions([], null, null);
      this.setMainActionTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
      this.setLocationSelectionPending(false);
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
      this.updateInventoryPanel(null);
      this.updateScrollLayout();
      return;
    }
    this.nameText.setText(playerName ?? character.name);
    const health = character.stats.health;
    const energy = character.stats.energy;

    const upcomingTemporary =
      typeof energy.temporary === "number" && energy.temporary > 0
        ? energy.temporary
        : 0;
    let energyLabel = `${t("Energy")} ${energy.current}/${energy.max}`;
    const extraSegments: string[] = [];

    if (upcomingTemporary > 0) {
      extraSegments.push(`+${upcomingTemporary} extra`);
    }
    if (extraSegments.length > 0) {
      energyLabel += ` (${extraSegments.join(", ")})`;
    }
    this.energyLabel.setText(energyLabel);
    this.useBarValue(
      this.healthBar,
      health.max === 0 ? 0 : health.current / health.max
    );
    this.healthLabel.setText(`Health ${health.current}/${health.max}`);
    this.useBarValue(
      this.energyBar,
      energy.max === 0 ? 0 : energy.current / energy.max
    );
    const actions = this.collectMainActions(character);
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
    const targetPlayers = character.actionPlan?.main?.targetPlayerIds ?? null;
    const serverTargetPlayerId = this.normalizePlayerId(
      Array.isArray(targetPlayers) && targetPlayers.length > 0
        ? targetPlayers[0]
        : null
    );
    this.setMainActionTargetPlayer(serverTargetPlayerId, false);
    const serverSecondTargetPlayerId = this.normalizePlayerId(
      Array.isArray(targetPlayers) && targetPlayers.length > 1
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
    const secondaryActions = this.collectSecondaryActions(character);
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
      secondaryId === "inspect" &&
      character.actionPlan?.secondary?.inspectAdditionalTarget === true;
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
      serverTargetPlayerId,
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
    this.updateInventoryPanel(character);
    this.updateScrollLayout();
  }

  private useBarValue(bar: ProgressBar, ratio: number) {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    bar.setValue(clamped);
  }

  private updateInventoryPanel(character: PlayerCharacter | null) {
    if (!this.itemsTitle || !this.inventoryGrid) {
      return;
    }
    if (!character) {
      this.itemsTitle.setText("Inventory");
      this.inventoryGrid.setItems([]);
      this.inventoryGrid.refreshLayout();
      return;
    }
    const load = character.stats?.load;
    if (load) {
      const current = this.normalizeWeight(load.current);
      const max = this.normalizeWeight(load.max);
      this.itemsTitle.setText(`Inventory (Load ${current}/${max})`);
    } else {
      this.itemsTitle.setText("Inventory");
    }
    const carried = Array.isArray(character.inventory?.carriedItems)
      ? character.inventory.carriedItems
      : [];
    const items = this.buildInventoryItems(
      carried,
      character.economy?.zarkans ?? 0
    );
    this.inventoryGrid.setItems(items);
    this.inventoryGrid.refreshLayout();
  }

  private buildInventoryItems(
    stacks: Array<{ itemId?: string; quantity?: number; weight?: number }>,
    walletZarkans = 0
  ): InventoryGridItem[] {
    const aggregated = new Map<
      string,
      { quantity: number; totalWeight: number }
    >();
    for (const stack of stacks) {
      if (!stack || typeof stack.itemId !== "string") {
        continue;
      }
      const id = stack.itemId;
      const quantity = this.normalizeQuantity(stack.quantity);
      const weight = this.normalizeWeightRaw(stack.weight);
      const entry = aggregated.get(id) ?? { quantity: 0, totalWeight: 0 };
      entry.quantity += quantity;
      entry.totalWeight += weight;
      aggregated.set(id, entry);
    }
    const walletQuantity = this.normalizeQuantity(walletZarkans);
    if (walletQuantity > 0) {
      const zarkanEntry = aggregated.get("zarkans") ?? {
        quantity: 0,
        totalWeight: 0,
      };
      zarkanEntry.quantity += walletQuantity;
      aggregated.set("zarkans", zarkanEntry);
    }
    const items: InventoryGridItem[] = [];
    for (const [itemId, entry] of aggregated) {
      const definition = this.resolveItemDefinition(itemId);
      const quantity = entry.quantity;
      const totalWeightRaw = entry.totalWeight;
      const fallbackPerWeight = definition?.weight ?? 0;
      const computedWeight =
        totalWeightRaw > 0 ? totalWeightRaw : quantity * fallbackPerWeight;
      const perItemWeight =
        fallbackPerWeight > 0
          ? fallbackPerWeight
          : quantity > 0
            ? computedWeight / quantity
            : 0;
      if (quantity <= 0 && computedWeight <= 0) {
        continue;
      }
      const normalizedTotalWeight = this.normalizeWeight(computedWeight);
      const normalizedPerItem = this.normalizeWeight(perItemWeight);
      const textureInfo = definition
        ? resolveItemTexture(definition)
        : { texture: "hex", frame: "grass_01.png" as const };
      items.push({
        id: definition?.id ?? itemId,
        name: definition?.name ?? this.formatActionName(itemId),
        category: definition?.category ?? undefined,
        description:
          definition?.description ?? "Description not available yet.",
        notes: definition?.notes ?? undefined,
        quantity,
        totalWeight: normalizedTotalWeight,
        weightPerItem: normalizedPerItem,
        texture: textureInfo.texture,
        frame: textureInfo.frame
      });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }

  private resolveItemDefinition(itemId: string): ItemDefinition | null {
    const candidate = ItemLibrary[itemId as ItemId];
    return candidate ?? null;
  }

  private normalizeQuantity(value: number | null | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.floor(value));
  }

  private normalizeWeight(value: number | null | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.round(value * 100) / 100);
  }

  private normalizeWeightRaw(value: number | null | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, value);
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;
    if (this.readyToggle) {
      this.readyToggle.setText(normalized ? "[x] Ready" : "[ ] Ready");
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
    const showReady = enabled && isCharacterActive && isStatusActive;
    if (showReady) {
      this.readyToggle.setAlpha(1);
      this.readyToggle.setInteractive({ useHandCursor: true });
    } else {
      this.readyToggle.setAlpha(0.5);
      this.readyToggle.disableInteractive();
    }
  }

  private applyMainActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null,
    storedExtraExecutions = 0
  ) {
    const items = this.buildMainActionItems(
      actions,
      character,
      this.currentTurn
    );
    this.mainActionDropdown.setItems(items);
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
      this.setMainActionTargetPlayer(null, false);
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
    const items = this.buildSecondaryActionItems(
      actions,
      character,
      this.currentTurn,
      disabledActionId,
      "Already chosen as extra secondary action"
    );
    this.secondaryActionDropdown.setItems(items);
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
    const available = this.hasExtraSecondaryAction();
    this.extraSecondaryActionBox.setVisible(available);
    this.extraSecondaryActionLabel.setVisible(available);
    this.extraSecondaryActionDropdown.setVisible(available);
    this.extraSecondaryActionDropdown.setActive(available);
    const items = this.buildSecondaryActionItems(
      actions,
      character,
      this.currentTurn,
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
    const actions = this.collectSecondaryActions(character);
    const disabledId = this.hasExtraSecondaryAction()
      ? this.extraSecondaryActionSelection
      : null;
    const items = this.buildSecondaryActionItems(
      actions,
      character,
      this.currentTurn,
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
    const actions = this.collectSecondaryActions(character);
    const items = this.buildSecondaryActionItems(
      actions,
      character,
      this.currentTurn,
      this.secondaryActionSelection,
      "Already chosen as secondary action"
    );
    this.extraSecondaryActionDropdown.setItems(items);
    this.lastExtraSecondaryActionItem =
      this.extraSecondaryActionDropdown.getSelectedItem() ?? null;
  }

  private collectMainActions(character: PlayerCharacter) {
    const set = new Set<ActionId>();
    const plan = character.actionPlan;
    if (plan?.main?.actionId) set.add(plan.main.actionId as ActionId);
    if (plan?.nextMain?.actionId) set.add(plan.nextMain.actionId as ActionId);
    return Array.from(set);
  }

  private collectSecondaryActions(character: PlayerCharacter | null) {
    if (!character) {
      return [];
    }
    const set = new Set<ActionId>();
    const plan = character.actionPlan;
    if (plan?.secondary?.actionId) set.add(plan.secondary.actionId as ActionId);
    if (plan?.extraSecondary?.actionId)
      set.add(plan.extraSecondary.actionId as ActionId);
    return Array.from(set);
  }

  private buildMainActionItems(
    actionIds: ActionId[],
    character: PlayerCharacter | null,
    currentTurn: number
  ): GridSelectItem[] {
    const cooldowns = this.buildActionCooldownMap(character, currentTurn);
    const baseList: (ActionId | string)[] = PRIMARY_ACTION_IDS;
    const sourceIds =
      actionIds.length > 0
        ? Array.from(new Set([...actionIds, ...baseList]))
        : baseList;
    const seen = new Set<string>();
    const items: GridSelectItem[] = [];
    for (const id of sourceIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const remaining = cooldowns.get(id) ?? 0;
      items.push(
        this.resolveActionMetadata(id, remaining, false, undefined, character)
      );
    }
    return items;
  }

  private buildSecondaryActionItems(
    actionIds: ActionId[],
    character: PlayerCharacter | null,
    currentTurn: number,
    disabledActionId?: string | null,
    disabledReason?: string
  ): GridSelectItem[] {
    const cooldowns = this.buildActionCooldownMap(character, currentTurn);
    const baseList: (ActionId | string)[] = SECONDARY_ACTION_IDS;
    const sourceIds =
      actionIds.length > 0
        ? Array.from(new Set([...actionIds, ...baseList]))
        : baseList;
    const seen = new Set<string>();
    const items: GridSelectItem[] = [];
    for (const id of sourceIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const remaining = cooldowns.get(id) ?? 0;
      const isBlockedByOtherSlot = Boolean(
        disabledActionId && id === disabledActionId
      );
      items.push(
        this.resolveActionMetadata(
          id,
          remaining,
          isBlockedByOtherSlot,
          disabledReason,
          character
        )
      );
    }
    return items;
  }

  private buildActionCooldownMap(
    character: PlayerCharacter | null,
    currentTurn: number
  ): Map<string, number> {
    const map = new Map<string, number>();
    if (!character?.statuses?.cooldowns) {
      return map;
    }
    for (const entry of character.statuses.cooldowns) {
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
        const current = map.get(entry.actionId) ?? 0;
        map.set(entry.actionId, Math.max(current, remaining));
      }
    }
    return map;
  }

  private resolveActionMetadata(
    actionId: ActionId | string,
    cooldownRemaining: number,
    disabledByOtherSlot = false,
    disabledReason?: string,
    character: PlayerCharacter | null = null
  ): GridSelectItem {
    const normalizedRemaining = Math.max(0, Math.ceil(cooldownRemaining));
    let isDisabled = normalizedRemaining > 0 || disabledByOtherSlot;
    const definition = ActionLibrary[actionId as ActionId] ?? null;
    if (definition) {
      const { texture, frame } = this.resolveActionTexture(definition);
      const developed = definition.developed === true;
      if (!developed) {
        isDisabled = true;
      }
      const descriptionBase = this.describeAction(definition);
      let description = developed
        ? descriptionBase
        : `${descriptionBase}\n\n(${t("Not available in this build.")})`;
      if (disabledByOtherSlot && disabledReason) {
        description = `${description}\n\n(${disabledReason}.)`;
      }
      const targetCharacter = character ?? this.getCurrentCharacter();
      const discount = targetCharacter
        ? getActionEnergyDiscount(targetCharacter, definition.id)
        : 0;
      const effectiveEnergyCost = Math.max(0, definition.energyCost - discount);
      const missingRequirement = developed
        ? this.getMissingRequirement(definition, targetCharacter)
        : null;
      return {
        id: definition.id,
        name: definition.name,
        description,
        texture,
        frame,
        tags: definition.tags,
        energyCost: effectiveEnergyCost,
        cooldownRemaining: normalizedRemaining,
        missingRequirement,
        disabled: isDisabled
      };
    }
    const fallbackName = this.formatActionName(actionId);
    let description = "Description coming soon.";
    if (disabledByOtherSlot && disabledReason) {
      description = `${description}\n\n(${disabledReason}.)`;
    }
    return {
      id: actionId,
      name: fallbackName,
      description,
      texture: "hex",
      frame: "grass_01.png",
      cooldownRemaining: normalizedRemaining,
      disabled: isDisabled
    };
  }

  private getCurrentCharacterTile(
    character: PlayerCharacter | null
  ): HexTileSnapshot | null {
    if (!this.currentMatch || !character?.position) {
      return null;
    }
    const tiles = Array.isArray(this.currentMatch.map?.tiles)
      ? this.currentMatch.map!.tiles
      : [];
    const tileId = character.position.tileId;
    if (tileId) {
      const tile = tiles.find((t) => t && t.id === tileId);
      if (tile) {
        return tile;
      }
    }
    const coord = character.position.coord;
    if (coord && typeof coord.q === "number" && typeof coord.r === "number") {
      const tile = tiles.find(
        (t) => t && t.coord && t.coord.q === coord.q && t.coord.r === coord.r
      );
      if (tile) {
        return tile;
      }
    }
    return null;
  }

  private getMissingRequirement(
    definition: ActionDefinition,
    character: PlayerCharacter | null
  ): string | null {
    const requiredLocations = ACTION_REQUIRED_LOCATIONS[definition.id];
    if (requiredLocations && requiredLocations.length > 0) {
      const currentTile = this.getCurrentCharacterTile(character);
      const currentLocType = currentTile?.localizationType;
      if (!currentLocType || !requiredLocations.includes(currentLocType)) {
        if (requiredLocations.length === 1) {
          const locName =
            LOCATION_DISPLAY_NAMES[requiredLocations[0]] ??
            requiredLocations[0].toLowerCase();
          return `Not in ${locName}`;
        }
        const names = requiredLocations
          .map((t) => LOCATION_DISPLAY_NAMES[t] ?? t.toLowerCase())
          .join(" or ");
        return `Not in ${names}`;
      }
    }

    if (definition.requiredItems && definition.requiredItems.length > 0) {
      const carried = Array.isArray(character?.inventory?.carriedItems)
        ? character!.inventory.carriedItems
        : [];

      if (definition.id === "bat_attack") {
        const hasBat = carried.some(
          (s) =>
            (s.itemId === "bat" || s.itemId === "nail_bat") &&
            typeof s.quantity === "number" &&
            s.quantity > 0
        );
        if (!hasBat) {
          return t("Missing bat");
        }
      } else if (definition.id === "shoot_pistol") {
        const hasPistol = carried.some(
          (s) =>
            (s.itemId === "pistol" || s.itemId === "suppressed_pistol") &&
            typeof s.quantity === "number" &&
            s.quantity > 0
        );
        const hasBullet = carried.some(
          (s) =>
            s.itemId === "bullet" &&
            typeof s.quantity === "number" &&
            s.quantity > 0
        );
        if (!hasPistol && !hasBullet) {
          return t("Missing pistol, bullet");
        }
        if (!hasPistol) {
          return t("Missing pistol");
        }
        if (!hasBullet) {
          return t("Missing bullet");
        }
      } else {
        const missingItems: string[] = [];
        for (const itemId of definition.requiredItems) {
          const hasItem = carried.some(
            (s) =>
              s.itemId === itemId &&
              typeof s.quantity === "number" &&
              s.quantity > 0
          );
          if (!hasItem) {
            const itemName =
              ItemLibrary[itemId as ItemId]?.name ??
              ITEM_DISPLAY_NAMES[itemId] ??
              itemId.replace(/_/g, " ");
            missingItems.push(t(itemName));
          }
        }
        if (missingItems.length > 0) {
          return `${t("Missing")} ${missingItems.join(", ")}`;
        }
      }
    }

    return null;
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
      if (this.mainExtraExecutions !== 0) {
        this.mainExtraExecutions = 0;
      }
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
    if (initialReps > 0) {
      this.mainExtraExecutions = initialReps;
      this.extraExecutionSelector.setValue(initialReps);
    }
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
    this.extraSecondaryItemSelector.setOptions(availableOptions);
    const supports = this.selectedExtraSecondaryActionSupportsItemPriority();
    const shouldShow = supports && availableOptions.length > 0;
    this.extraSecondaryItemSelector.setVisible(shouldShow);
    this.extraSecondaryItemSelector.setActive(shouldShow);
    if (!shouldShow) {
      this.extraSecondaryActionPriorityItems = [];
      this.extraSecondaryItemSelector.setValue([], false);
      this.extraSecondaryItemSelector.setEnabled(false);
      this.extraSecondaryItemSelector.setPending(false);
      this.extraSecondaryItemSelector.hideDropdown();
      this.updateScrollLayout();
      return;
    }
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
    const supports = this.selectedActionSupportsLocation();
    this.locationSelector.setVisible(supports);
    this.locationSelector.setActive(supports);
    if (!supports) {
      if (this.mainActionTarget !== null) {
        this.mainActionTarget = null;
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setEnabled(false);
      this.locationSelector.setPending(false);
      this.updateScrollLayout();
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.locationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.locationSelector.setPending(false);
    }
    this.updateScrollLayout();
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
    const shouldShow =
      this.mainActionSelection === "scare" &&
      this.mainExtraExecutions > 0 &&
      this.mainPlayerOptions.length > 1;
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
    const options = this.mainPlayerOptions.filter(
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
    this.itemSelector.setOptions(options);
    this.itemSelector.setVisible(shouldShow);
    this.itemSelector.setActive(shouldShow);
    if (!shouldShow) {
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

  private updateInspectAdditionalTargetToggleText(): void {
    this.secondaryInspectAdditionalTargetToggle.setText(
      this.secondaryInspectAdditionalTarget
        ? "[x] Inspect another player"
        : "[ ] Inspect another player"
    );
  }

  private refreshSecondaryInspectAdditionalTargetState(): void {
    const visible =
      this.secondaryActionSelection === "inspect" &&
      this.secondaryExtraExecutions > 0;
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
      this.secondaryActionSelection === "inspect" &&
      this.secondaryExtraExecutions > 0 &&
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
    this.secondaryItemSelector.setOptions(availableOptions);
    const supports = this.selectedSecondaryActionSupportsItemPriority();
    const hasOptions = availableOptions.length > 0;
    const shouldShow = supports && hasOptions;
    this.secondaryItemSelector.setVisible(shouldShow);
    this.secondaryItemSelector.setActive(shouldShow);
    if (!shouldShow) {
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

  private updateScrollLayout() {
    if (!this.scrollPanel) {
      return;
    }
    const width = this.scrollContentWidth;
    if (width <= 0) {
      return;
    }
    const horizontalPadding = 12;
    let cursorY = 0;
    const layoutActionBlock = (
      box: Phaser.GameObjects.Rectangle,
      label: Phaser.GameObjects.Text,
      dropdown: GridSelect,
      extraExecutionSelector: ExtraExecutionSelector | null,
      locationSelector: LocationSelector,
      playerSelector: PlayerSelector,
      itemSelector: ItemPrioritySelector,
      searchPriorityToggle: Phaser.GameObjects.Text | null,
      chemicalTargetToggle?: Phaser.GameObjects.Text | null,
      dropSellToggle?: Phaser.GameObjects.Text | null,
      additionalPlayerSelector: PlayerSelector | null = null,
      additionalTargetToggle: Phaser.GameObjects.Text | null = null
    ) => {
      box.setPosition(0, cursorY);
      box.setSize(width, BOX_HEIGHT);
      box.setDisplaySize(width, BOX_HEIGHT);
      label.setPosition(horizontalPadding, cursorY + 12);
      dropdown.setPosition(horizontalPadding, cursorY + 48);
      dropdown.setDisplayWidth(width - horizontalPadding * 2);
      let innerCursor = cursorY + 48 + dropdown.height + 12;
      if (extraExecutionSelector) {
        extraExecutionSelector.setSelectorWidth(width - horizontalPadding * 2);
        extraExecutionSelector.setPosition(horizontalPadding, innerCursor);
        if (extraExecutionSelector.visible) {
          innerCursor += extraExecutionSelector.height + 8;
        }
      }
      locationSelector.setSelectorWidth(width - horizontalPadding * 2);
      locationSelector.setPosition(horizontalPadding, innerCursor);
      if (locationSelector.visible) {
        innerCursor += locationSelector.height + 8;
      }
      if (chemicalTargetToggle) {
        chemicalTargetToggle.setPosition(horizontalPadding, innerCursor);
        if (chemicalTargetToggle.visible) {
          innerCursor += chemicalTargetToggle.height + 8;
        }
      }
      playerSelector.setSelectorWidth(width - horizontalPadding * 2);
      playerSelector.setPosition(horizontalPadding, innerCursor);
      if (playerSelector.visible) {
        innerCursor += playerSelector.height + 8;
      }
      if (additionalTargetToggle) {
        additionalTargetToggle.setPosition(horizontalPadding, innerCursor);
        if (additionalTargetToggle.visible) {
          innerCursor += additionalTargetToggle.height + 8;
        }
      }
      if (additionalPlayerSelector) {
        additionalPlayerSelector.setSelectorWidth(width - horizontalPadding * 2);
        additionalPlayerSelector.setPosition(horizontalPadding, innerCursor);
        if (additionalPlayerSelector.visible) {
          innerCursor += additionalPlayerSelector.height + 8;
        }
      }
      itemSelector.setSelectorWidth(width - horizontalPadding * 2);
      itemSelector.setPosition(horizontalPadding, innerCursor);
      if (itemSelector.visible) {
        innerCursor += itemSelector.height + 8;
      }
      if (searchPriorityToggle) {
        searchPriorityToggle.setPosition(horizontalPadding, innerCursor);
        if (searchPriorityToggle.visible) {
          innerCursor += searchPriorityToggle.height + 8;
        }
      }
      if (dropSellToggle) {
        dropSellToggle.setPosition(horizontalPadding, innerCursor);
        if (dropSellToggle.visible) {
          innerCursor += dropSellToggle.height + 8;
        }
      }
      const blockHeight = Math.max(BOX_HEIGHT, innerCursor - cursorY + 16);
      box.setSize(width, blockHeight);
      box.setDisplaySize(width, blockHeight);
      cursorY += blockHeight;
    };

    layoutActionBlock(
      this.mainActionBox,
      this.mainActionLabel,
      this.mainActionDropdown,
      this.extraExecutionSelector,
      this.locationSelector,
      this.playerSelector,
      this.itemSelector,
      null,
      null,
      null,
      this.scareSecondPlayerSelector,
      null
    );
    cursorY += 16;
    layoutActionBlock(
      this.secondaryActionBox,
      this.secondaryActionLabel,
      this.secondaryActionDropdown,
      this.secondaryExtraExecutionSelector,
      this.secondaryLocationSelector,
      this.secondaryPlayerSelector,
      this.secondaryItemSelector,
      this.secondarySearchPriorityToggle,
      this.secondaryChemicalTargetToggle,
      this.secondaryDropSellToggle,
      this.secondaryInspectSecondPlayerSelector,
      this.secondaryInspectAdditionalTargetToggle
    );
    cursorY += 16;
    if (this.hasExtraSecondaryAction()) {
      this.extraSecondaryActionBox.setVisible(true);
      this.extraSecondaryActionLabel.setVisible(true);
      layoutActionBlock(
        this.extraSecondaryActionBox,
        this.extraSecondaryActionLabel,
        this.extraSecondaryActionDropdown,
        this.extraSecondaryExtraExecutionSelector,
        this.extraSecondaryLocationSelector,
        this.extraSecondaryPlayerSelector,
        this.extraSecondaryItemSelector,
        this.extraSecondarySearchPriorityToggle,
        this.extraSecondaryChemicalTargetToggle,
        this.extraSecondaryDropSellToggle
      );
      cursorY += 16;
    } else {
      this.extraSecondaryActionBox.setVisible(false);
      this.extraSecondaryActionLabel.setVisible(false);
      this.extraSecondaryActionDropdown.setVisible(false);
    }
    this.scrollContent.setPosition(0, 0);
    this.scrollContent.setSize(width, cursorY);
    this.scrollPanel.layout?.();
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
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  private setScareSecondTargetPlayer(
    targetId: string | null,
    emit = false
  ): boolean {
    const supports =
      this.mainActionSelection === "scare" && this.mainExtraExecutions > 0;
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
      targetId !== this.mainActionTargetPlayerId &&
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
    if (normalized && this.mainActionTarget !== null) {
      this.setMainActionTarget(null, false);
    }
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
      this.secondaryActionSelection === "inspect" &&
      this.secondaryExtraExecutions > 0 &&
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
    const options: PlayerOption[] = [];
    if (match) {
      const seen = new Set<string>();
      const pushOption = (id: string | null | undefined) => {
        if (!id || seen.has(id)) {
          return;
        }
        seen.add(id);
        const character = match.playerCharacters?.[id] ?? null;
        const account = this.playerAccounts.get(id) ?? null;
        const accountDisplayName =
          typeof account?.displayName === "string" &&
          account.displayName.trim().length > 0
            ? account.displayName.trim()
            : null;
        const baseName =
          accountDisplayName ?? usernames[id] ?? character?.name ?? id;
        const accountSkin = account?.cosmetics.selectedSkinId ?? null;
        const displayName = baseName && baseName.length > 0 ? baseName : id;
        const label =
          currentUserId && id === currentUserId
            ? `${displayName} (You)`
            : displayName;
        const sprite = this.resolvePlayerSpriteInfo(
          id,
          character,
          accountSkin,
          1
        );
        options.push({
          id,
          label,
          name: displayName,
          texture: sprite.texture,
          frame: sprite.frame,
          iconScale: sprite.iconScale
        });
      };
      if (match.playerList) {
        Object.keys(match.playerList).forEach((id) => pushOption(id));
      }
    }
    this.playerOptions = options;
    const activeIds = new Set(options.map((option) => option.id));
    this.disposePlayerOptionSkinIcons(activeIds);
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
    const match = this.currentMatch;
    const allowsDeadTarget = (actionId: string | null): boolean =>
      actionId === "inspect";
    const currentUserId = this.currentUserId;
    const mainAllowsSelf = this.selectedActionCanTargetSelf();
    const secondaryAllowsSelf = this.selectedSecondaryActionCanTargetSelf();
    const extraSecondaryAllowsSelf =
      this.selectedExtraSecondaryActionCanTargetSelf();
    const buildOptions = (
      actionId: string | null,
      allowsSelf: boolean
    ): PlayerOption[] => {
      const options = this.playerOptions.filter((option) => {
        if (match) {
          const char = match.playerCharacters?.[option.id];
          const isDead =
            match.deadCharacters?.[option.id] === true ||
            char?.statuses?.conditions?.includes("dead") ||
            (typeof char?.stats?.health?.current === "number" &&
              char.stats.health.current <= 0);
          if (isDead && !allowsDeadTarget(actionId)) {
            return false;
          }
        }
        return allowsSelf || option.id !== currentUserId;
      });
      options.sort((a, b) => {
        const aVisible = match?.playerCharacters?.[a.id] !== undefined;
        const bVisible = match?.playerCharacters?.[b.id] !== undefined;
        return Number(!aVisible) - Number(!bVisible);
      });
      return options.map((option) => {
        const isVisible = match?.playerCharacters?.[option.id] !== undefined;
        return isVisible ? option : { ...option, warning: "Not visible" };
      });
    };

    const mainOptions = buildOptions(
      this.mainActionSelection,
      mainAllowsSelf
    );
    const secondaryOptions = buildOptions(
      this.secondaryActionSelection,
      secondaryAllowsSelf
    );
    const extraSecondaryOptions = buildOptions(
      this.extraSecondaryActionSelection,
      extraSecondaryAllowsSelf
    );

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
      mainOptions.filter(
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
    const options: ItemPriorityOption[] = [];
    const currentCharacter =
      match && currentUserId
        ? match.playerCharacters?.[currentUserId] ?? null
        : null;
    if (match && currentUserId) {
      const character = match.playerCharacters?.[currentUserId] ?? null;
      const tileId = character?.position?.tileId ?? null;
      if (tileId) {
        const tiles = Array.isArray(match.map?.tiles) ? match.map!.tiles : [];
        const tile = tiles.find((entry) => entry && entry.id === tileId);
        const matchItems = Array.isArray(match.items) ? match.items : [];
        const lookup = new Map<string, (typeof matchItems)[number]>();
        for (const record of matchItems) {
          if (!record || typeof record.item_id !== "string") {
            continue;
          }
          lookup.set(record.item_id, record);
        }
        const itemIds = Array.isArray(tile?.itemIds) ? tile!.itemIds : [];
        for (const rawId of itemIds) {
          if (typeof rawId !== "string" || rawId.length === 0) {
            continue;
          }
          const record = lookup.get(rawId);
          const itemType = record?.item_type;
          let label = rawId;
          let description: string | undefined;
          let texture = "hex";
          let frame: string | undefined = "grass_01.png";
          let iconScale: number | undefined;
          if (
            itemType &&
            (ItemLibrary as Record<string, ItemDefinition>)[itemType]
          ) {
            const definition =
              ItemLibrary[itemType as keyof typeof ItemLibrary];
            label = definition.name ?? label;
            description = definition.description ?? description;
            const visual = resolveItemTexture(definition);
            texture = visual.texture;
            frame = visual.frame;
          }
          options.push({
            id: rawId,
            label,
            description,
            texture,
            frame,
            iconScale
          });
        }
      }
    }
    const inventoryOptions: ItemPriorityOption[] = [];
    if (match && currentUserId) {
      const character = match.playerCharacters?.[currentUserId] ?? null;
      if (
        character?.inventory &&
        Array.isArray(character.inventory.carriedItems)
      ) {
        for (const stack of character.inventory.carriedItems) {
          if (
            !stack ||
            typeof stack.itemId !== "string" ||
            stack.quantity <= 0
          ) {
            continue;
          }
          const itemType = stack.itemId as ItemId;
          const definition = ItemLibrary[itemType] as
            | ItemDefinition
            | undefined;
          const baseName = definition?.name ?? itemType;
          const label =
            stack.quantity > 1
              ? `${baseName} (x${stack.quantity})`
              : baseName;
          const description = definition?.description;
          let texture = "hex";
          let frame: string | undefined = "grass_01.png";
          let iconScale: number | undefined;
          if (definition) {
            const visual = resolveItemTexture(definition);
            texture = visual.texture;
            frame = visual.frame;
          }
          inventoryOptions.push({
            id: itemType,
            label,
            description,
            texture,
            frame,
            iconScale
          });
        }
      }
    }
    const stealOptions: ItemPriorityOption[] = [];
    if (currentCharacter?.abilities?.includes("dexterity2")) {
      for (const definition of Object.values(ItemLibrary)) {
        if (definition.id === "zarkans") {
          continue;
        }
        const visual = resolveItemTexture(definition);
        stealOptions.push({
          id: definition.id,
          label: definition.name,
          description: definition.description,
          texture: visual.texture,
          frame: visual.frame
        });
      }
    }
    this.inventoryItemOptions = inventoryOptions;
    this.itemOptions = options;
    this.stealItemOptions = stealOptions;
    this.itemSelector.setOptions(this.getMainActionItemOptions());
    this.secondaryItemSelector.setOptions(
      this.secondaryActionSelection === "drop" ||
      this.secondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : options
    );
    this.extraSecondaryItemSelector.setOptions(
      this.extraSecondaryActionSelection === "drop" ||
      this.extraSecondaryActionSelection === "black_market_trade"
        ? this.inventoryItemOptions
        : options
    );
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

  private resolvePlayerSpriteInfo(
    playerId: string,
    _character: PlayerCharacter | PlayerCharacterUnknown | null,
    accountSkin: Skin | null,
    scale: number
  ) {
    const skinForPlayer =
      accountSkin ??
      (this.currentUserId && playerId === this.currentUserId
        ? (this.currentPlayerSkin ?? DEFAULT_SKIN)
        : DEFAULT_SKIN);
    const signature = this.skinSignature(skinForPlayer);
    const existing = this.playerOptionSkinIcons.get(playerId);
    if (
      existing &&
      existing.signature === signature &&
      this.scene.textures.exists(existing.textureKey)
    ) {
      return {
        texture: existing.textureKey,
        frame: undefined,
        iconScale: scale
      };
    }

    if (existing) {
      if (this.scene.textures.exists(existing.textureKey)) {
        this.scene.textures.remove(existing.textureKey);
      }
      this.playerOptionSkinIcons.delete(playerId);
    }

    const textureKey = `player-option-skin-${playerId}`;
    const created = this.createPlayerOptionSkinTexture(
      textureKey,
      skinForPlayer
    );
    if (created) {
      this.playerOptionSkinIcons.set(playerId, { textureKey, signature });
      return { texture: textureKey, frame: undefined, iconScale: scale };
    }

    return { texture: "char", frame: DEFAULT_SKIN.body, iconScale: scale };
  }

  private createPlayerOptionSkinTexture(
    textureKey: string,
    skin: Skin
  ): boolean {
    if (this.scene.textures.exists(textureKey)) {
      this.scene.textures.remove(textureKey);
    }
    const sprite = createSkinContainer(this.scene, 0, 0, skin, 1);
    const rt = this.scene.make.renderTexture({ width: 16, height: 16 }, false);
    if (!rt) {
      sprite.destroy(true);
      return false;
    }
    rt.draw(sprite, 8, 8);
    rt.saveTexture(textureKey);
    rt.destroy();
    sprite.destroy(true);
    return this.scene.textures.exists(textureKey);
  }

  private skinSignature(skin: Skin): string {
    return [skin.body, skin.shoes, skin.shirt, skin.hair, skin.hat].join("|");
  }

  private disposePlayerOptionSkinIcons(activeIds?: Set<string>): void {
    for (const [playerId, cached] of this.playerOptionSkinIcons) {
      if (activeIds && activeIds.has(playerId)) {
        continue;
      }
      if (this.scene.textures.exists(cached.textureKey)) {
        this.scene.textures.remove(cached.textureKey);
      }
      this.playerOptionSkinIcons.delete(playerId);
    }
  }

  private selectedActionSupportsLocation() {
    return this.lastMainActionItem?.tags?.includes("Ranged") ?? false;
  }

  private selectedActionSupportsSingleTarget() {
    return this.lastMainActionItem?.tags?.includes("SingleTarget") ?? false;
  }

  private selectedActionSupportsItemPriority() {
    if (this.mainActionSelection === "steal") {
      return this.hasDexterity2();
    }
    return this.lastMainActionItem?.tags?.includes("TargetItems") ?? false;
  }

  private hasDexterity2(): boolean {
    return this.getCurrentCharacter()?.abilities?.includes("dexterity2") ?? false;
  }

  private getMainActionItemOptions(): ItemPriorityOption[] {
    return this.mainActionSelection === "steal"
      ? this.stealItemOptions
      : this.itemOptions;
  }

  private selectedSecondaryActionSupportsLocation() {
    return this.lastSecondaryActionItem?.tags?.includes("Ranged") ?? false;
  }

  private selectedSecondaryActionSupportsSingleTarget() {
    if (this.secondaryActionSelection === "use_chemical_weapon") {
      return this.secondaryChemicalSingleTarget;
    }
    return (
      this.lastSecondaryActionItem?.tags?.includes("SingleTarget") ?? false
    );
  }

  private selectedSecondaryActionSupportsItemPriority() {
    return this.lastSecondaryActionItem?.tags?.includes("TargetItems") ?? false;
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
    return this.lastExtraSecondaryActionItem?.tags?.includes("Ranged") ?? false;
  }

  private selectedExtraSecondaryActionSupportsSingleTarget() {
    if (this.extraSecondaryActionSelection === "use_chemical_weapon") {
      return this.extraSecondaryChemicalSingleTarget;
    }
    return (
      this.lastExtraSecondaryActionItem?.tags?.includes("SingleTarget") ?? false
    );
  }

  private selectedExtraSecondaryActionSupportsItemPriority() {
    return (
      this.lastExtraSecondaryActionItem?.tags?.includes("TargetItems") ?? false
    );
  }

  private selectedExtraSecondaryActionSupportsExtraExecution(): boolean {
    if (!this.extraSecondaryActionSelection) {
      return false;
    }
    const definition =
      ActionLibrary[this.extraSecondaryActionSelection as ActionId] ?? null;
    return definition?.extraExecution !== undefined;
  }

  private selectedActionSupportsExtraExecution(): boolean {
    if (!this.mainActionSelection) {
      return false;
    }
    const definition =
      ActionLibrary[this.mainActionSelection as ActionId] ?? null;
    return definition?.extraExecution !== undefined;
  }

  private selectedSecondaryActionSupportsExtraExecution(): boolean {
    if (!this.secondaryActionSelection) {
      return false;
    }
    const definition =
      ActionLibrary[this.secondaryActionSelection as ActionId] ?? null;
    return definition?.extraExecution !== undefined;
  }

  private emitMainActionChange() {
    const supportsLocation = this.selectedActionSupportsLocation();
    const supportsPlayer = this.selectedActionSupportsSingleTarget();
    const supportsItems = this.selectedActionSupportsItemPriority();
    const supportsExtra = this.selectedActionSupportsExtraExecution();
    const payload: MainActionSelection = {
      actionId: this.mainActionSelection,
      targetLocation:
        supportsLocation && this.mainActionTarget
          ? { q: this.mainActionTarget.q, r: this.mainActionTarget.r }
          : null,
      targetPlayerIds: supportsPlayer
        ? [
            ...new Set(
              [
                this.mainActionTargetPlayerId,
                this.mainActionSelection === "scare" &&
                this.mainExtraExecutions > 0
                  ? this.scareSecondTargetPlayerId
                  : null
              ].filter((id): id is string => id !== null)
            )
          ]
        : undefined,
      targetItemIds: supportsItems
        ? [...this.mainActionPriorityItems]
        : undefined,
      extraExecutions: supportsExtra ? this.mainExtraExecutions : undefined
    };
    this.emit("main-action-change", payload);
  }

  private emitSecondaryActionChange() {
    const supportsLocation = this.selectedSecondaryActionSupportsLocation();
    const supportsPlayer = this.selectedSecondaryActionSupportsSingleTarget();
    const supportsItems = this.selectedSecondaryActionSupportsItemPriority();
    const supportsExtra = this.selectedSecondaryActionSupportsExtraExecution();
    const isAdditionalInspectTarget =
      this.secondaryActionSelection === "inspect" &&
      this.secondaryExtraExecutions > 0 &&
      this.secondaryInspectAdditionalTarget &&
      this.secondaryInspectSecondTargetPlayerId !== null;
    const payload: SecondaryActionSelection = {
      actionId: this.secondaryActionSelection,
      prioritizeFoodDrink:
        this.secondaryActionSelection === "search" &&
        this.secondaryPrioritizeFoodDrink,
      sellInstead:
        this.secondaryActionSelection === "drop" &&
        this.secondarySellInstead,
      singleTarget:
        this.secondaryActionSelection === "use_chemical_weapon"
          ? this.secondaryChemicalSingleTarget
          : undefined,
      inspectAdditionalTarget: isAdditionalInspectTarget,
      targetLocation:
        supportsLocation && this.secondaryActionTarget
          ? {
              q: this.secondaryActionTarget.q,
              r: this.secondaryActionTarget.r
            }
          : null,
      targetPlayerIds: supportsPlayer
        ? [
            this.secondaryActionTargetPlayerId,
            isAdditionalInspectTarget
              ? this.secondaryInspectSecondTargetPlayerId
              : null
          ].filter((id): id is string => id !== null)
        : undefined,
      targetItemIds: supportsItems
        ? [...this.secondaryActionPriorityItems]
        : undefined,
      extraExecutions: supportsExtra ? this.secondaryExtraExecutions : undefined
    };
    this.emit("secondary-action-change", payload);
  }

  private emitExtraSecondaryActionChange() {
    const supportsLocation = this.selectedExtraSecondaryActionSupportsLocation();
    const supportsPlayer = this.selectedExtraSecondaryActionSupportsSingleTarget();
    const supportsItems = this.selectedExtraSecondaryActionSupportsItemPriority();
    const supportsExtra = this.selectedExtraSecondaryActionSupportsExtraExecution();
    const payload: SecondaryActionSelection = {
      actionId: this.extraSecondaryActionSelection,
      prioritizeFoodDrink:
        this.extraSecondaryActionSelection === "search" &&
        this.extraSecondaryPrioritizeFoodDrink,
      sellInstead:
        this.extraSecondaryActionSelection === "drop" &&
        this.extraSecondarySellInstead,
      singleTarget:
        this.extraSecondaryActionSelection === "use_chemical_weapon"
          ? this.extraSecondaryChemicalSingleTarget
          : undefined,
      targetLocation:
        supportsLocation && this.extraSecondaryActionTarget
          ? {
              q: this.extraSecondaryActionTarget.q,
              r: this.extraSecondaryActionTarget.r
            }
          : null,
      targetPlayerIds: supportsPlayer
        ? this.extraSecondaryActionTargetPlayerId
          ? [this.extraSecondaryActionTargetPlayerId]
          : []
        : undefined,
      targetItemIds: supportsItems
        ? [...this.extraSecondaryActionPriorityItems]
        : undefined,
      extraExecutions: supportsExtra
        ? this.extraSecondaryExtraExecutions
        : undefined
    };
    this.emit("extra-secondary-action-change", payload);
  }

  private syncMainActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverTargetPlayerId: string | null,
    serverTargetItems: string[] | null
  ): void {
    const matchesSelection =
      (this.mainActionSelection ?? null) === (serverActionId ?? null);
    const matchesLocation = this.isSameAxial(
      this.mainActionTarget,
      serverTargetLocation
    );
    const matchesPlayer =
      (this.mainActionTargetPlayerId ?? null) ===
      (serverTargetPlayerId ?? null);
    const matchesItems = this.isSameTargetItems(
      this.mainActionPriorityItems,
      serverTargetItems
    );
    if (
      !matchesSelection ||
      !matchesLocation ||
      !matchesPlayer ||
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
    const supports = this.selectedActionSupportsLocation();
    if (!supports) {
      const changed = this.mainActionTarget !== null;
      if (changed) {
        this.mainActionTarget = null;
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

  private setExtraSecondaryActionTarget(
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
    const supportsLocation = this.selectedActionSupportsLocation();
    const supportsPlayer = this.selectedActionSupportsSingleTarget();
    const supportsItems = this.selectedActionSupportsItemPriority();
    const supportsExtra = this.selectedActionSupportsExtraExecution();
    return {
      actionId: this.mainActionSelection,
      targetLocation:
        supportsLocation && this.mainActionTarget
          ? { q: this.mainActionTarget.q, r: this.mainActionTarget.r }
          : null,
      targetPlayerIds: supportsPlayer
        ? this.mainActionTargetPlayerId
          ? [this.mainActionTargetPlayerId]
          : []
        : undefined,
      targetItemIds: supportsItems
        ? [...this.mainActionPriorityItems]
        : undefined,
      extraExecutions: supportsExtra ? this.mainExtraExecutions : undefined
    };
  }

  getSecondaryActionSelection(): SecondaryActionSelection {
    const supportsLocation = this.selectedSecondaryActionSupportsLocation();
    const supportsPlayer = this.selectedSecondaryActionSupportsSingleTarget();
    const supportsExtra = this.selectedSecondaryActionSupportsExtraExecution();
    const isAdditionalInspectTarget =
      this.secondaryActionSelection === "inspect" &&
      this.secondaryExtraExecutions > 0 &&
      this.secondaryInspectAdditionalTarget &&
      this.secondaryInspectSecondTargetPlayerId !== null;
    return {
      actionId: this.secondaryActionSelection,
      prioritizeFoodDrink:
        this.secondaryActionSelection === "search" &&
        this.secondaryPrioritizeFoodDrink,
      singleTarget:
        this.secondaryActionSelection === "use_chemical_weapon"
          ? this.secondaryChemicalSingleTarget
          : undefined,
      inspectAdditionalTarget: isAdditionalInspectTarget,
      targetLocation:
        supportsLocation && this.secondaryActionTarget
          ? {
              q: this.secondaryActionTarget.q,
              r: this.secondaryActionTarget.r
            }
          : null,
      targetPlayerIds: supportsPlayer
        ? [
            this.secondaryActionTargetPlayerId,
            isAdditionalInspectTarget
              ? this.secondaryInspectSecondTargetPlayerId
              : null
          ].filter((id): id is string => id !== null)
        : undefined,
      extraExecutions: supportsExtra ? this.secondaryExtraExecutions : undefined
    };
  }

  setLocationSelectionPending(active: boolean): void {
    if (!this.selectedActionSupportsLocation()) {
      this.locationSelector.setPending(false);
      return;
    }
    this.locationSelector.setPending(active);
  }

  setSecondaryLocationSelectionPending(active: boolean): void {
    if (!this.selectedSecondaryActionSupportsLocation()) {
      this.secondaryLocationSelector.setPending(false);
      return;
    }
    this.secondaryLocationSelector.setPending(active);
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

  private formatActionName(id: string) {
    const spaced = id.replace(/[_-]+/g, " ");
    return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
  }

  private describeAction(definition: ActionDefinition) {
    const parts: string[] = [];
    if (definition.requirements?.length) {
      const reqDescs = definition.requirements
        .map((r) => r.description)
        .filter((d): d is string => Boolean(d && d.trim().length > 0));
      if (reqDescs.length > 0) {
        parts.push(reqDescs.join("\n"));
      }
    }
    if (definition.effects?.length) {
      const effDescs = definition.effects
        .map((e) => e.description)
        .filter((d): d is string => Boolean(d && d.trim().length > 0));
      if (effDescs.length > 0) {
        parts.push(effDescs.join("\n"));
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

  private resolveActionTexture(definition: ActionDefinition) {
    if (isBoardIconTexture(definition.texture) && definition.frame) {
      return { texture: deriveBoardIconKey(definition.frame) };
    }
    return { texture: definition.texture, frame: definition.frame };
  }

  private handleTabRequest(key: TabKey) {
    this.tabsController.setActiveTab(key);
  }

  setLogTurnInfo(maxTurn: number) {
    this.logView.setTurnInfo(maxTurn);
  }

  setLogReplay(turn: number, maxTurn: number, events: ReplayEvent[]) {
    this.logView.setReplay(turn, maxTurn, events);
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
