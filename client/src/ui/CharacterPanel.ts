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
} from "@shared";
import { GridSelect, type GridSelectItem } from "./GridSelect";
import { deriveBoardIconKey, isBoardIconTexture } from "./actionIcons";
import { ProgressBar } from "./ProgressBar";
import { LocationSelector } from "./LocationSelector";
import { PlayerSelector, type PlayerOption } from "./PlayerSelector";
import {
  CharacterPanelTabs,
  type CharacterPanelTabEntry,
  type TabKey,
} from "./CharacterPanelTabs";
import { CharacterPanelLogView } from "./CharacterPanelLogView";
import { InventoryGrid, type InventoryGridItem } from "./InventoryGrid";
import { resolveItemTexture } from "./itemIcons";
import { ENERGY_ACCENT_COLOR, HEALTH_ACCENT_COLOR } from "./ColorPalette";

const DEFAULT_WIDTH = 420;
const TAB_HEIGHT = 40;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 180;
const PRIMARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter((definition) => definition.category === ActionCategory.Primary)
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));
const SECONDARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter((definition) => definition.category === ActionCategory.Secondary)
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));
const PLAYER_SPRITE_FRAMES = [
  "body_human_light_01.png",
  "body_human_tan_01.png",
  "body_orc_green_01.png",
  "body_elf_pale_01.png",
  "body_dwarf_ruddy_01.png",
  "body_human_dark_01.png",
  "body_human_brown_01.png",
  "body_human_red_01.png",
  "body_human_olive_01.png",
  "body_human_peach_01.png",
];

export type MainActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerIds?: string[];
};

export type SecondaryActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
  targetPlayerIds?: string[];
};

export class CharacterPanel extends Phaser.GameObjects.Container {
  private readonly tabConfigs: Array<{ key: TabKey; label: string }> = [
    { key: "character", label: "Character" },
    { key: "items", label: "Items" },
    { key: "players", label: "Players" },
    { key: "chat", label: "Chat" },
    { key: "log", label: "Log" },
  ];
  private background: Phaser.GameObjects.Rectangle;
  private tabs: CharacterPanelTabEntry[] = [];
  private characterElements: Phaser.GameObjects.GameObject[] = [];
  private itemsElements: Phaser.GameObjects.GameObject[] = [];
  private tabsController!: CharacterPanelTabs;
  private logView!: CharacterPanelLogView;
  private portrait: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private healthLabel: Phaser.GameObjects.Text;
  private energyLabel: Phaser.GameObjects.Text;
  private healthBar: ProgressBar;
  private energyBar: ProgressBar;
  private readyToggle!: Phaser.GameObjects.Text;
  private mainActionBox: Phaser.GameObjects.Rectangle;
  private secondaryActionBox: Phaser.GameObjects.Rectangle;
  private mainActionLabel: Phaser.GameObjects.Text;
  private secondaryActionLabel: Phaser.GameObjects.Text;
  private mainActionDropdown: GridSelect;
  private mainActionDropdownWidth: number;
  private secondaryActionDropdown: GridSelect;
  private secondaryActionDropdownWidth: number;
  private locationSelector: LocationSelector;
  private playerSelector: PlayerSelector;
  private secondaryLocationSelector: LocationSelector;
  private secondaryPlayerSelector: PlayerSelector;
  private itemsBackground!: Phaser.GameObjects.Rectangle;
  private itemsTitle!: Phaser.GameObjects.Text;
  private inventoryGrid!: InventoryGrid;
  private panelWidth: number;
  private panelHeight: number;
  private barWidth: number;
  private mainActionSelection: string | null = null;
  private secondaryActionSelection: string | null = null;
  private currentTurn = 0;
  private mainActionTarget: Axial | null = null;
  private secondaryActionTarget: Axial | null = null;
  private mainActionTargetPlayerId: string | null = null;
  private secondaryActionTargetPlayerId: string | null = null;
  private lastMainActionItem: GridSelectItem | null = null;
  private lastSecondaryActionItem: GridSelectItem | null = null;
  private readyState = false;
  private readyEnabled = false;
  private playerOptions: PlayerOption[] = [];
  private readonly handleMainActionSelection = (actionId: string | null) => {
    this.mainActionSelection = actionId ?? null;
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    if (!this.mainActionSelection) {
      this.setMainActionTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
    }
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
  private readonly handleReadyToggle = () => {
    if (!this.readyEnabled) {
      return;
    }
    this.setReadyState(!this.readyState, true);
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
    }
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryPlayerSelectorState();
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
  private readonly handleSecondaryLocationClear = () => {
    this.setSecondaryActionTarget(null, true);
  };
  private readonly handleSecondaryPlayerSelection = (
    playerId: string | null
  ) => {
    this.setSecondaryActionTargetPlayer(playerId ?? null, true);
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
      .setOrigin(0, 0);
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
        .text(index * tabWidth + 12, 10, tab.label, {
          fontSize: "16px",
          color: "#ffffff",
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      rect.on(Phaser.Input.Events.POINTER_UP, () => {
        this.handleTabRequest(tab.key as TabKey);
      });
      text.on(Phaser.Input.Events.POINTER_UP, () => {
        this.handleTabRequest(tab.key as TabKey);
      });
      this.add(rect);
      this.add(text);
      this.tabs.push({ key: tab.key as TabKey, rect, text });
    });
    const contentTop = TAB_HEIGHT + MARGIN;
    this.portrait = scene.add
      .image(MARGIN, contentTop, "char", "body_human_tan_01.png")
      .setOrigin(0, 0);
    this.portrait.setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);
    this.add(this.portrait);
    this.nameText = scene.add
      .text(MARGIN, contentTop - 14, "", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.nameText);
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    this.healthLabel = scene.add
      .text(barX, contentTop - 14, "Health", {
        fontSize: "14px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.add(this.healthLabel);
    this.healthBar = new ProgressBar(scene, barX, contentTop, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: HEALTH_ACCENT_COLOR,
    });
    this.add(this.healthBar);
    this.energyLabel = scene.add
      .text(barX, contentTop + 32, "Energy", {
        fontSize: "14px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.add(this.energyLabel);
    this.energyBar = new ProgressBar(scene, barX, contentTop + 46, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: ENERGY_ACCENT_COLOR,
    });
    this.add(this.energyBar);
    const readyY = contentTop + 80;
    this.readyToggle = scene.add
      .text(barX, readyY, "[ ] Ready", {
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.readyToggle.setInteractive({ useHandCursor: true });
    this.readyToggle.on("pointerup", this.handleReadyToggle);
    this.add(this.readyToggle);
    this.setReadyEnabled(false);
    const mainBoxY =
      this.portrait.y + this.portrait.height * this.portrait.scaleY + 12;
    const boxWidth = width - MARGIN * 2;
    this.mainActionBox = scene.add
      .rectangle(MARGIN, mainBoxY, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.add(this.mainActionBox);
    this.mainActionLabel = scene.add
      .text(MARGIN + 12, mainBoxY + 12, "Main Action", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.mainActionLabel);
    this.mainActionDropdownWidth = boxWidth - 24;
    this.mainActionDropdown = new GridSelect(
      scene,
      MARGIN + 12,
      mainBoxY + 48,
      {
        width: this.mainActionDropdownWidth,
        title: "Select Main Action",
        placeholder: "Choose action",
        emptyLabel: "Unknown",
        columns: 3,
        cellHeight: 260,
      }
    );
    this.add(this.mainActionDropdown);
    this.mainActionDropdown.on("change", this.handleMainActionSelection);
    const locationY = mainBoxY + 48 + this.mainActionDropdown.height + 12;
    this.locationSelector = new LocationSelector(
      scene,
      MARGIN + 12,
      locationY,
      this.mainActionDropdownWidth
    );
    this.locationSelector.setEnabled(false);
    this.locationSelector.setVisible(false);
    this.locationSelector.setActive(false);
    this.locationSelector.on("pick-request", this.handleLocationPickRequest);
    this.locationSelector.on("clear-request", this.handleLocationClear);
    this.add(this.locationSelector);
    this.playerSelector = new PlayerSelector(
      scene,
      MARGIN + 12,
      locationY,
      this.mainActionDropdownWidth
    );
    this.playerSelector.setEnabled(false);
    this.playerSelector.setVisible(false);
    this.playerSelector.setActive(false);
    this.playerSelector.on("change", this.handlePlayerSelection);
    this.add(this.playerSelector);
    this.layoutMainActionSelectors();
    const secondaryBoxY = mainBoxY + BOX_HEIGHT + 16;
    this.secondaryActionBox = scene.add
      .rectangle(MARGIN, secondaryBoxY, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.add(this.secondaryActionBox);
    this.secondaryActionLabel = scene.add
      .text(MARGIN + 12, secondaryBoxY + 12, "Secondary Action", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.secondaryActionLabel);
    this.secondaryActionDropdownWidth = boxWidth - 24;
    this.secondaryActionDropdown = new GridSelect(
      scene,
      MARGIN + 12,
      secondaryBoxY + 48,
      {
        width: this.secondaryActionDropdownWidth,
        title: "Select Secondary Action",
        placeholder: "Choose action",
        emptyLabel: "Unknown",
        columns: 3,
        cellHeight: 260,
        includeEmptyOption: true,
        emptyOptionLabel: "No secondary action",
        emptyOptionDescription: "Removes the planned secondary action.",
      }
    );
    this.add(this.secondaryActionDropdown);
    this.secondaryActionDropdown.on(
      "change",
      this.handleSecondaryActionSelection
    );
    const secondarySelectorsY =
      secondaryBoxY + 48 + this.secondaryActionDropdown.height + 12;
    this.secondaryLocationSelector = new LocationSelector(
      scene,
      MARGIN + 12,
      secondarySelectorsY,
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
    this.add(this.secondaryLocationSelector);
    this.secondaryPlayerSelector = new PlayerSelector(
      scene,
      MARGIN + 12,
      secondarySelectorsY,
      this.secondaryActionDropdownWidth
    );
    this.secondaryPlayerSelector.setEnabled(false);
    this.secondaryPlayerSelector.setVisible(false);
    this.secondaryPlayerSelector.setActive(false);
    this.secondaryPlayerSelector.on(
      "change",
      this.handleSecondaryPlayerSelection
    );
    this.add(this.secondaryPlayerSelector);
    this.layoutSecondaryActionSelectors();
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
        color: "#ffffff",
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
      this.inventoryGrid,
    ];
    const logControlY = contentTop;
    const baseX = MARGIN + 12;
    const logPrevButton = scene.add
      .text(baseX, logControlY, "◀", {
        fontSize: "18px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const logTurnLabel = scene.add
      .text(baseX + 32, logControlY, "Turn 0 / 0", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    const logNextButton = scene.add
      .text(baseX + 160, logControlY, "▶", {
        fontSize: "18px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const logPlayButton = scene.add
      .text(baseX + 200, logControlY, "Play", {
        fontSize: "16px",
        color: "#4ade80",
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
        color: "#cbd5f5",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    const logEventsText = scene.add
      .text(MARGIN + 16, logBoxY + 16, "", {
        fontSize: "15px",
        color: "#cbd5f5",
        wordWrap: {
          width: boxWidth - 32,
          useAdvancedWrap: true,
        },
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
        eventsText: logEventsText,
      },
      onRequestReplay: (turn) => {
        this.emit("log-turn-request", turn);
      },
      onPlay: (turn) => {
        this.emit("log-play", turn);
      },
      formatActionName: (id) => this.formatActionName(id),
    });
    this.logView.handleVisibilityChange({ visible: false, forceEnsure: false });
    this.logView.setTurnInfo(0);
    this.logView.layout({
      margin: MARGIN,
      tabHeight: TAB_HEIGHT,
      contentTop,
      boxWidth,
      panelHeight: this.panelHeight,
    });
    this.characterElements = [
      this.portrait,
      this.nameText,
      this.healthLabel,
      this.energyLabel,
      this.healthBar,
      this.energyBar,
      this.readyToggle,
      this.mainActionBox,
      this.mainActionLabel,
      this.mainActionDropdown,
      this.locationSelector,
      this.playerSelector,
      this.secondaryActionBox,
      this.secondaryActionLabel,
      this.secondaryActionDropdown,
      this.secondaryLocationSelector,
      this.secondaryPlayerSelector,
    ];
    this.tabsController = new CharacterPanelTabs({
      tabs: this.tabs,
      defaultKey: "character",
      characterElements: this.characterElements,
      itemsElements: this.itemsElements,
      onCharacterTabShow: () => {
        this.mainActionDropdown.setVisible(true);
        this.mainActionDropdown.setActive(true);
        this.refreshLocationSelectorState();
        this.refreshPlayerSelectorState();
        this.secondaryActionDropdown.setVisible(true);
        this.secondaryActionDropdown.setActive(true);
        this.refreshSecondaryLocationSelectorState();
        this.refreshSecondaryPlayerSelectorState();
        this.setReadyEnabled(this.readyEnabled);
      },
      onCharacterTabHide: () => {
        this.mainActionDropdown.setVisible(false);
        this.mainActionDropdown.setActive(false);
        this.locationSelector.setVisible(false);
        this.locationSelector.setActive(false);
        this.playerSelector.hideDropdown();
        this.playerSelector.setVisible(false);
        this.playerSelector.setActive(false);
        this.secondaryActionDropdown.setVisible(false);
        this.secondaryActionDropdown.setActive(false);
        this.secondaryLocationSelector.setVisible(false);
        this.secondaryLocationSelector.setActive(false);
        this.secondaryPlayerSelector.hideDropdown();
        this.secondaryPlayerSelector.setVisible(false);
        this.secondaryPlayerSelector.setActive(false);
        this.readyToggle.disableInteractive();
      },
      onItemsTabShow: () => {
        this.inventoryGrid.setActive(true);
        this.inventoryGrid.refreshLayout();
      },
      onItemsTabHide: () => {
        this.inventoryGrid.setActive(false);
      },
      onLogVisibilityChange: ({ visible, forceEnsure }) => {
        this.logView.handleVisibilityChange({ visible, forceEnsure });
      },
      onTabChange: (key, previous) => {
        this.emit("tab-change", key, previous);
      },
      onLogTabOpened: () => {
        this.emit("log-tab-opened");
      },
      onLogTabClosed: () => {
        this.emit("log-tab-closed");
      },
    });
    this.tabsController.refresh();
    this.bringToTop(this.mainActionDropdown);
    this.bringToTop(this.locationSelector);
    this.bringToTop(this.playerSelector);
    this.bringToTop(this.secondaryActionDropdown);
    this.bringToTop(this.secondaryLocationSelector);
    this.bringToTop(this.secondaryPlayerSelector);
  }

  override destroy(fromScene?: boolean) {
    this.mainActionDropdown.off("change", this.handleMainActionSelection);
    this.locationSelector.off("pick-request", this.handleLocationPickRequest);
    this.locationSelector.off("clear-request", this.handleLocationClear);
    this.playerSelector.off("change", this.handlePlayerSelection);
    this.playerSelector.hideDropdown();
    this.secondaryActionDropdown.off(
      "change",
      this.handleSecondaryActionSelection
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
    this.secondaryPlayerSelector.hideDropdown();
    this.readyToggle?.off("pointerup", this.handleReadyToggle);
    this.logView?.destroy();
    super.destroy(fromScene);
  }

  setPanelSize(width: number, height: number) {
    this.panelWidth = width;
    this.panelHeight = height;
    this.barWidth = width - (PORTRAIT_SIZE + MARGIN * 3);
    this.setSize(width, height);
    this.background.setSize(width, height);
    const boxWidth = width - MARGIN * 2;
    const mainBoxY =
      this.portrait.y + this.portrait.height * this.portrait.scaleY + 12;
    const secondaryBoxY = mainBoxY + BOX_HEIGHT + 16;
    this.mainActionBox.setSize(boxWidth, BOX_HEIGHT);
    this.mainActionBox.setDisplaySize(boxWidth, BOX_HEIGHT);
    this.secondaryActionBox.setSize(boxWidth, BOX_HEIGHT);
    this.secondaryActionBox.setDisplaySize(boxWidth, BOX_HEIGHT);
    this.mainActionDropdownWidth = boxWidth - 24;
    this.secondaryActionDropdownWidth = boxWidth - 24;
    const dropdown = this.mainActionDropdown;
    const dropdownY =
      this.portrait.y + this.portrait.height * this.portrait.scaleY + 12 + 36;
    dropdown.setPosition(MARGIN + 12, dropdownY);
    dropdown.setDisplayWidth(this.mainActionDropdownWidth);
    const selectorsX = MARGIN + 12;
    this.locationSelector.setSelectorWidth(this.mainActionDropdownWidth);
    this.playerSelector.setSelectorWidth(this.mainActionDropdownWidth);
    this.locationSelector.setPosition(
      selectorsX,
      dropdownY + dropdown.height + 12
    );
    this.playerSelector.setPosition(
      selectorsX,
      dropdownY + dropdown.height + 12
    );
    this.layoutMainActionSelectors();
    const secondaryDropdown = this.secondaryActionDropdown;
    const secondaryDropdownY = secondaryBoxY + 48;
    secondaryDropdown.setPosition(MARGIN + 12, secondaryDropdownY);
    secondaryDropdown.setDisplayWidth(this.secondaryActionDropdownWidth);
    this.secondaryLocationSelector.setSelectorWidth(
      this.secondaryActionDropdownWidth
    );
    this.secondaryPlayerSelector.setSelectorWidth(
      this.secondaryActionDropdownWidth
    );
    this.secondaryLocationSelector.setPosition(
      selectorsX,
      secondaryDropdownY + secondaryDropdown.height + 12
    );
    this.secondaryPlayerSelector.setPosition(
      selectorsX,
      secondaryDropdownY + secondaryDropdown.height + 12
    );
    this.layoutSecondaryActionSelectors();
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    const contentTop = TAB_HEIGHT + MARGIN;
    this.healthBar.setPosition(barX, contentTop);
    this.energyBar.setPosition(barX, contentTop + 46);
    this.healthBar.resize(this.barWidth, BAR_HEIGHT);
    this.energyBar.resize(this.barWidth, BAR_HEIGHT);
    if (this.readyToggle) {
      this.readyToggle.setPosition(barX, contentTop + 80);
    }
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
    if (this.logView) {
      this.logView.layout({
        margin: MARGIN,
        tabHeight: TAB_HEIGHT,
        contentTop,
        boxWidth,
        panelHeight: height,
      });
    }
  }

  getPanelWidth() {
    return this.panelWidth;
  }

  updateFromMatch(
    match: MatchRecord | null,
    currentUserId: string | null,
    usernames?: Record<string, string>
  ) {
    const userMap = usernames ? { ...usernames } : {};
    this.logView.setUsernames(userMap);
    this.updatePlayerOptions(match ?? null, userMap, currentUserId);
    if (!match || !currentUserId) {
      this.currentTurn = 0;
      this.applyCharacter(null, null, false);
      this.setLogTurnInfo(0);
      return;
    }
    this.currentTurn = match.current_turn ?? 0;
    const characters = match.playerCharacters ?? {};
    const character = characters[currentUserId] ?? null;
    const name = userMap[currentUserId] ?? null;
    const ready = match.readyStates?.[currentUserId] ?? false;
    this.applyCharacter(character, name, ready);
  }

  private applyCharacter(
    character: PlayerCharacter | null,
    playerName: string | null,
    ready: boolean
  ) {
    if (!character) {
      this.nameText.setText("No character");
      this.useBarValue(this.healthBar, 0);
      this.useBarValue(this.energyBar, 0);
      this.energyLabel.setText("Energy");
      this.applyMainActions([], null, null);
      this.setMainActionTarget(null, false);
      this.setMainActionTargetPlayer(null, false);
      this.setLocationSelectionPending(false);
      this.playerSelector.setPending(false);
      this.playerSelector.setEnabled(false);
      this.playerSelector.hideDropdown();
      this.refreshPlayerSelectorState();
      this.applySecondaryActions([], null, null);
      this.setSecondaryActionTarget(null, false);
      this.setSecondaryActionTargetPlayer(null, false);
      this.setSecondaryLocationSelectionPending(false);
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.setEnabled(false);
      this.secondaryPlayerSelector.hideDropdown();
      this.refreshSecondaryPlayerSelectorState();
      this.setReadyEnabled(false);
      this.setReadyState(false, false);
      this.updateInventoryPanel(null);
      return;
    }
    this.nameText.setText(playerName ?? character.name);
    const health = character.stats.health;
    const energy = character.stats.energy;

    const upcomingTemporary =
      typeof energy.temporary === "number" && energy.temporary > 0
        ? energy.temporary
        : 0;
    let energyLabel = `Energy ${energy.current}/${energy.max}`;
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
    this.useBarValue(
      this.energyBar,
      energy.max === 0 ? 0 : energy.current / energy.max
    );
    const actions = this.collectMainActions(character);
    const mainActionId = character.actionPlan?.main?.actionId ?? null;
    this.applyMainActions(actions, mainActionId, character);
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
    this.setLocationSelectionPending(false);
    this.playerSelector.setPending(false);
    const secondaryActions = this.collectSecondaryActions(character);
    const secondaryId = character.actionPlan?.secondary?.actionId ?? null;
    this.applySecondaryActions(secondaryActions, secondaryId, character);
    const secondaryTargetLocation =
      character.actionPlan?.secondary?.targetLocationId ?? null;
    const normalizedSecondaryTargetLocation = this.normalizeAxial(
      secondaryTargetLocation
    );
    this.setSecondaryActionTarget(normalizedSecondaryTargetLocation, false);
    const secondaryTargetPlayers =
      character.actionPlan?.secondary?.targetPlayerIds ?? null;
    const secondaryServerTargetPlayerId = this.normalizePlayerId(
      Array.isArray(secondaryTargetPlayers) && secondaryTargetPlayers.length > 0
        ? secondaryTargetPlayers[0]
        : null
    );
    this.setSecondaryActionTargetPlayer(secondaryServerTargetPlayerId, false);
    this.setSecondaryLocationSelectionPending(false);
    this.secondaryPlayerSelector.setPending(false);
    this.setReadyEnabled(true);
    this.setReadyState(ready, false);
    this.syncMainActionWithServer(
      mainActionId,
      normalizedTargetLocation,
      serverTargetPlayerId
    );
    this.syncSecondaryActionWithServer(
      secondaryId,
      normalizedSecondaryTargetLocation,
      secondaryServerTargetPlayerId
    );
    this.updateInventoryPanel(character);
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
    const items = this.buildInventoryItems(carried);
    this.inventoryGrid.setItems(items);
    this.inventoryGrid.refreshLayout();
  }

  private buildInventoryItems(
    stacks: Array<{ itemId?: string; quantity?: number; weight?: number }>
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
        frame: textureInfo.frame,
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

  getReadyState(): boolean {
    return this.readyState;
  }

  private setReadyEnabled(enabled: boolean) {
    this.readyEnabled = enabled;
    if (!this.readyToggle) {
      return;
    }
    const showReady =
      enabled && (this.tabsController?.isActive("character") ?? false);
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
    character: PlayerCharacter | null
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
    this.refreshLocationSelectorState();
    this.refreshPlayerSelectorState();
  }

  private applySecondaryActions(
    actions: ActionId[],
    preferredId: string | null,
    character: PlayerCharacter | null
  ) {
    const items = this.buildSecondaryActionItems(
      actions,
      character,
      this.currentTurn
    );
    this.secondaryActionDropdown.setItems(items);
    if (preferredId) {
      this.secondaryActionDropdown.setValue(preferredId, false);
      if (!this.secondaryActionDropdown.getValue() && items[0]) {
        this.secondaryActionDropdown.setValue(items[0].id, false);
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
    this.refreshSecondaryLocationSelectorState();
    this.refreshSecondaryPlayerSelectorState();
  }

  private collectMainActions(character: PlayerCharacter) {
    const set = new Set<ActionId>();
    const plan = character.actionPlan;
    if (plan?.main?.actionId) set.add(plan.main.actionId as ActionId);
    if (plan?.nextMain?.actionId) set.add(plan.nextMain.actionId as ActionId);
    return Array.from(set);
  }

  private collectSecondaryActions(character: PlayerCharacter) {
    const set = new Set<ActionId>();
    const plan = character.actionPlan;
    if (plan?.secondary?.actionId) set.add(plan.secondary.actionId as ActionId);
    return Array.from(set);
  }

  private buildMainActionItems(
    actionIds: ActionId[],
    character: PlayerCharacter | null,
    currentTurn: number
  ): GridSelectItem[] {
    const cooldowns = this.buildActionCooldownMap(character, currentTurn);
    const fallback: (ActionId | string)[] =
      PRIMARY_ACTION_IDS.length > 0
        ? PRIMARY_ACTION_IDS
        : ["move", "punch", "protect"];
    const sourceIds =
      actionIds.length > 0
        ? Array.from(new Set([...actionIds, ...fallback]))
        : fallback;
    const seen = new Set<string>();
    const items: GridSelectItem[] = [];
    for (const id of sourceIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const remaining = cooldowns.get(id) ?? 0;
      items.push(this.resolveActionMetadata(id, remaining));
    }
    return items;
  }

  private buildSecondaryActionItems(
    actionIds: ActionId[],
    character: PlayerCharacter | null,
    currentTurn: number
  ): GridSelectItem[] {
    const cooldowns = this.buildActionCooldownMap(character, currentTurn);
    const fallback: (ActionId | string)[] =
      SECONDARY_ACTION_IDS.length > 0
        ? SECONDARY_ACTION_IDS
        : ["focus", "recover", "drop"];
    const sourceIds =
      actionIds.length > 0
        ? Array.from(new Set([...actionIds, ...fallback]))
        : fallback;
    const seen = new Set<string>();
    const items: GridSelectItem[] = [];
    for (const id of sourceIds) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const remaining = cooldowns.get(id) ?? 0;
      items.push(this.resolveActionMetadata(id, remaining));
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
    cooldownRemaining: number
  ): GridSelectItem {
    const normalizedRemaining = Math.max(0, Math.ceil(cooldownRemaining));
    let isDisabled = normalizedRemaining > 0;
    const definition = ActionLibrary[actionId as ActionId] ?? null;
    if (definition) {
      const { texture, frame } = this.resolveActionTexture(definition);
      const developed = definition.developed === true;
      if (!developed) {
        isDisabled = true;
      }
      const descriptionBase = this.describeAction(definition);
      const description = developed
        ? descriptionBase
        : `${descriptionBase}\n\n(Not available in this build.)`;
      return {
        id: definition.id,
        name: definition.name,
        description,
        texture,
        frame,
        tags: definition.tags,
        energyCost: definition.energyCost,
        cooldownRemaining: normalizedRemaining,
        disabled: isDisabled,
      };
    }
    const fallbackName = this.formatActionName(actionId);
    return {
      id: actionId,
      name: fallbackName,
      description: "Description coming soon.",
      texture: "hex",
      frame: "grass_01.png",
      cooldownRemaining: normalizedRemaining,
      disabled: isDisabled,
    };
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
      this.layoutMainActionSelectors();
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.locationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.locationSelector.setPending(false);
    }
    this.layoutMainActionSelectors();
  }

  private refreshPlayerSelectorState() {
    const supports = this.selectedActionSupportsSingleTarget();
    const hasOptions = this.playerOptions.length > 0;
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
      this.layoutMainActionSelectors();
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.playerSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.playerSelector.setPending(false);
      this.playerSelector.hideDropdown();
    }
    this.layoutMainActionSelectors();
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
      this.layoutSecondaryActionSelectors();
      return;
    }
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryLocationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.secondaryLocationSelector.setPending(false);
    }
    this.layoutSecondaryActionSelectors();
  }

  private refreshSecondaryPlayerSelectorState() {
    const supports = this.selectedSecondaryActionSupportsSingleTarget();
    const hasOptions = this.playerOptions.length > 0;
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
      this.layoutSecondaryActionSelectors();
      return;
    }
    const hasSelection = this.secondaryActionSelection !== null;
    this.secondaryPlayerSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.secondaryPlayerSelector.setPending(false);
      this.secondaryPlayerSelector.hideDropdown();
    }
    this.layoutSecondaryActionSelectors();
  }

  private layoutMainActionSelectors() {
    const dropdown = this.mainActionDropdown;
    const baseX = dropdown.x;
    const baseY = dropdown.y + dropdown.height + 12;
    let cursorY = baseY;
    if (this.locationSelector.visible) {
      this.locationSelector.setPosition(baseX, cursorY);
      cursorY += this.locationSelector.height + 8;
    } else {
      this.locationSelector.setPosition(baseX, baseY);
    }
    if (this.playerSelector.visible) {
      this.playerSelector.setPosition(baseX, cursorY);
      cursorY += this.playerSelector.height + 8;
    } else {
      this.playerSelector.setPosition(baseX, cursorY);
    }
  }

  private layoutSecondaryActionSelectors() {
    const dropdown = this.secondaryActionDropdown;
    const baseX = dropdown.x;
    const baseY = dropdown.y + dropdown.height + 12;
    let cursorY = baseY;
    if (this.secondaryLocationSelector.visible) {
      this.secondaryLocationSelector.setPosition(baseX, cursorY);
      cursorY += this.secondaryLocationSelector.height + 8;
    } else {
      this.secondaryLocationSelector.setPosition(baseX, baseY);
    }
    if (this.secondaryPlayerSelector.visible) {
      this.secondaryPlayerSelector.setPosition(baseX, cursorY);
      cursorY += this.secondaryPlayerSelector.height + 8;
    } else {
      this.secondaryPlayerSelector.setPosition(baseX, cursorY);
    }
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
      this.playerOptions.some((option) => option.id === targetId)
    ) {
      normalized = targetId;
    }
    const changed = this.mainActionTargetPlayerId !== normalized;
    if (!changed) {
      return false;
    }
    this.mainActionTargetPlayerId = normalized;
    this.playerSelector.setValue(normalized);
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
      this.playerOptions.some((option) => option.id === targetId)
    ) {
      normalized = targetId;
    }
    const changed = this.secondaryActionTargetPlayerId !== normalized;
    if (!changed) {
      return false;
    }
    this.secondaryActionTargetPlayerId = normalized;
    this.secondaryPlayerSelector.setValue(normalized);
    if (emit) {
      this.emitSecondaryActionChange();
    }
    return true;
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
        const baseName = usernames[id] ?? character?.name ?? id;
        const displayName = baseName && baseName.length > 0 ? baseName : id;
        const label =
          currentUserId && id === currentUserId
            ? `${displayName} (You)`
            : displayName;
        const sprite = this.resolvePlayerSpriteInfo(id, character, 1);
        options.push({
          id,
          label,
          texture: sprite.texture,
          frame: sprite.frame,
          iconScale: sprite.iconScale,
        });
      };
      if (Array.isArray(match.players)) {
        match.players.forEach((id) => pushOption(id));
      }
      if (match.playerCharacters) {
        Object.keys(match.playerCharacters).forEach((id) => pushOption(id));
      }
    }
    this.playerOptions = options;
    if (
      this.mainActionTargetPlayerId &&
      !options.some((option) => option.id === this.mainActionTargetPlayerId)
    ) {
      this.mainActionTargetPlayerId = null;
    }
    if (
      this.secondaryActionTargetPlayerId &&
      !options.some(
        (option) => option.id === this.secondaryActionTargetPlayerId
      )
    ) {
      this.secondaryActionTargetPlayerId = null;
    }
    this.playerSelector.setOptions(options);
    this.secondaryPlayerSelector.setOptions(options);
    if (this.mainActionTargetPlayerId) {
      this.playerSelector.setValue(this.mainActionTargetPlayerId);
    } else {
      this.playerSelector.setValue(null);
    }
    if (this.secondaryActionTargetPlayerId) {
      this.secondaryPlayerSelector.setValue(this.secondaryActionTargetPlayerId);
    } else {
      this.secondaryPlayerSelector.setValue(null);
    }
    this.refreshPlayerSelectorState();
    this.refreshSecondaryPlayerSelectorState();
  }

  private resolvePlayerSpriteInfo(
    playerId: string,
    character: PlayerCharacter | null,
    scale: number
  ) {
    const appearance = (
      character as unknown as {
        appearance?: { texture?: string; frame?: string; body?: string };
      } | null
    )?.appearance;
    let texture =
      typeof appearance?.texture === "string" ? appearance.texture : "char";
    let frame =
      typeof appearance?.frame === "string"
        ? appearance.frame
        : typeof appearance?.body === "string"
        ? appearance.body
        : undefined;
    const textures = this.scene.textures;
    if (
      !frame ||
      !textures.exists(texture) ||
      !textures.get(texture).has(frame)
    ) {
      texture = "char";
      const index =
        PLAYER_SPRITE_FRAMES.length > 0
          ? this.hashString(playerId) % PLAYER_SPRITE_FRAMES.length
          : 0;
      frame = PLAYER_SPRITE_FRAMES[index] ?? "body_human_tan_01.png";
    }
    const resolvedFrame = frame ?? "body_human_tan_01.png";
    return { texture, frame: resolvedFrame, iconScale: scale };
  }

  private hashString(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
  }

  private selectedActionSupportsLocation() {
    return this.lastMainActionItem?.tags?.includes("Ranged") ?? false;
  }

  private selectedActionSupportsSingleTarget() {
    return this.lastMainActionItem?.tags?.includes("SingleTarget") ?? false;
  }

  private selectedSecondaryActionSupportsLocation() {
    return this.lastSecondaryActionItem?.tags?.includes("Ranged") ?? false;
  }

  private selectedSecondaryActionSupportsSingleTarget() {
    return (
      this.lastSecondaryActionItem?.tags?.includes("SingleTarget") ?? false
    );
  }

  private emitMainActionChange() {
    const supportsLocation = this.selectedActionSupportsLocation();
    const supportsPlayer = this.selectedActionSupportsSingleTarget();
    const payload: MainActionSelection = {
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
    };
    this.emit("main-action-change", payload);
  }

  private emitSecondaryActionChange() {
    const supportsLocation = this.selectedSecondaryActionSupportsLocation();
    const supportsPlayer = this.selectedSecondaryActionSupportsSingleTarget();
    const payload: SecondaryActionSelection = {
      actionId: this.secondaryActionSelection,
      targetLocation:
        supportsLocation && this.secondaryActionTarget
          ? {
              q: this.secondaryActionTarget.q,
              r: this.secondaryActionTarget.r,
            }
          : null,
      targetPlayerIds: supportsPlayer
        ? this.secondaryActionTargetPlayerId
          ? [this.secondaryActionTargetPlayerId]
          : []
        : undefined,
    };
    this.emit("secondary-action-change", payload);
  }

  private syncMainActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverTargetPlayerId: string | null
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
    if (!matchesSelection || !matchesLocation || !matchesPlayer) {
      this.emitMainActionChange();
    }
  }

  private syncSecondaryActionWithServer(
    serverActionId: string | null,
    serverTargetLocation: Axial | null,
    serverTargetPlayerId: string | null
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
    if (!matchesSelection || !matchesLocation || !matchesPlayer) {
      this.emitSecondaryActionChange();
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

  getMainActionSelection(): MainActionSelection {
    const supportsLocation = this.selectedActionSupportsLocation();
    const supportsPlayer = this.selectedActionSupportsSingleTarget();
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
    };
  }

  getSecondaryActionSelection(): SecondaryActionSelection {
    const supportsLocation = this.selectedSecondaryActionSupportsLocation();
    const supportsPlayer = this.selectedSecondaryActionSupportsSingleTarget();
    return {
      actionId: this.secondaryActionSelection,
      targetLocation:
        supportsLocation && this.secondaryActionTarget
          ? {
              q: this.secondaryActionTarget.q,
              r: this.secondaryActionTarget.r,
            }
          : null,
      targetPlayerIds: supportsPlayer
        ? this.secondaryActionTargetPlayerId
          ? [this.secondaryActionTargetPlayerId]
          : []
        : undefined,
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

  private formatActionName(id: string) {
    const spaced = id.replace(/[_-]+/g, " ");
    return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
  }

  private describeAction(definition: ActionDefinition) {
    if (definition.effects?.length) {
      return definition.effects[0].description;
    }
    if (definition.notes?.length) {
      return definition.notes[0];
    }
    if (definition.requirements?.length) {
      return definition.requirements[0].description;
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
}
