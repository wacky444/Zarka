import Phaser from "phaser";
import {
  type ActionId,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  type ReplayEvent,
  DEFAULT_SKIN,
  type Skin,
  type ShopId,
  type TutorialStepId,
  type UserAccount
} from "@shared";
import {
  CharacterPanelTabs,
  type CharacterPanelTabEntry,
  type TabKey
} from "../CharacterPanelTabs";
import { CharacterPanelLogView } from "../CharacterPanelLogView";
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
  isTutorialReadyActionAllowed
} from "../../tutorial/TutorialUiPolicy";
import { buildCharacterPanelItemOptions } from "./CharacterPanelItemOptions";
import { buildPlayerOptions } from "./CharacterPanelPlayerOptions";
import { PlayerOptionSkinCache } from "./PlayerOptionSkinCache";
import { CharacterPanelInventoryView } from "./CharacterPanelInventoryView";
import { CharacterPanelStatusView } from "./CharacterPanelStatusView";
import { CharacterPanelTabLayout } from "./CharacterPanelTabLayout";
import { CharacterPanelReadyView } from "./CharacterPanelReadyView";
import { formatActionName as formatActionLabel } from "./CharacterPanelActionOptions";
import {
  CharacterPanelActionPlanView,
  type MainActionSelection,
  type SecondaryActionSelection
} from "./CharacterPanelActionPlanView";
import type { PlayerOption } from "../PlayerSelector";
import type { ItemPriorityOption } from "../ItemPrioritySelector";

export type { MainActionSelection, SecondaryActionSelection };

export type CharacterSubTabKey = "status" | "skills";

export type {
  ChatMessageViewModel,
  ChatConnectionState
} from "../CharacterPanelChatView";

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
  private readyView!: CharacterPanelReadyView;
  private actionPlanView!: CharacterPanelActionPlanView;
  private gridModalOpenCount = 0;
  private panelWidth: number;
  private panelHeight: number;
  private currentTurn = 0;
  private readyEnabled = false;
  private playerOptions: PlayerOption[] = [];
  private playersTabView!: CharacterPanelPlayerListView;
  private itemOptions: ItemPriorityOption[] = [];
  private stealItemOptions: ItemPriorityOption[] = [];
  private inventoryItemOptions: ItemPriorityOption[] = [];
  private currentMatch: MatchRecord | null = null;
  private currentUserId: string | null = null;
  private currentCharacter: PlayerCharacter | null = null;
  private currentPlayerSkin: Skin | null = null;
  private playerAccounts = new Map<string, UserAccount>();
  private lastUserMap: Record<string, string> = {};

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
  private readonly handleActionModalOpen = () => {
    this.gridModalOpenCount += 1;
    if (this.gridModalOpenCount === 1) {
      this.actionPlanView?.setScrollerEnable(false);
      this.skillsView?.setScrollerEnable?.(false);
      this.shopView?.setScrollerEnable(false);
      this.playersTabView?.setScrollerEnable?.(false);
      this.emit("grid-modal-open");
    }
  };
  private readonly handleActionModalClose = () => {
    this.gridModalOpenCount = Math.max(0, this.gridModalOpenCount - 1);
    if (this.gridModalOpenCount === 0) {
      this.actionPlanView?.setScrollerEnable(true);
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
    this.readyView = new CharacterPanelReadyView({
      scene,
      parent: this,
      x: barX,
      y: readyY,
      onReadyChange: (ready) => this.emit("ready-change", ready)
    });
    this.setReadyEnabled(false);

    const readyHeight = this.readyView.height;
    const estimatedScrollTop = readyY + readyHeight + 24;
    const initialScrollWidth = Math.max(120, width - MARGIN * 2);
    const estimatedScrollHeight = Math.max(
      200,
      height - estimatedScrollTop - MARGIN
    );
    const matrix = this.getWorldTransformMatrix();

    this.actionPlanView = new CharacterPanelActionPlanView(scene, this, {
      margin: MARGIN,
      scrollTop: estimatedScrollTop,
      width: initialScrollWidth,
      height: estimatedScrollHeight,
      worldTransform: { tx: matrix.tx, ty: matrix.ty }
    });

    this.actionPlanView.on("main-action-change", (payload: MainActionSelection) => {
      this.emit("main-action-change", payload);
    });
    this.actionPlanView.on("secondary-action-change", (payload: SecondaryActionSelection) => {
      this.emit("secondary-action-change", payload);
    });
    this.actionPlanView.on("extra-secondary-action-change", (payload: SecondaryActionSelection) => {
      this.emit("extra-secondary-action-change", payload);
    });
    this.actionPlanView.on("main-action-location-request", () => {
      this.emit("main-action-location-request");
    });
    this.actionPlanView.on("main-action-second-location-request", () => {
      this.emit("main-action-second-location-request");
    });
    this.actionPlanView.on("secondary-action-location-request", () => {
      this.emit("secondary-action-location-request");
    });
    this.actionPlanView.on("extra-secondary-action-location-request", () => {
      this.emit("extra-secondary-action-location-request");
    });
    this.actionPlanView.on("modal-open", this.handleActionModalOpen);
    this.actionPlanView.on("modal-close", this.handleActionModalClose);
    this.actionPlanView.on("ready-refresh-request", () => {
      this.setReadyEnabled(this.readyEnabled);
    });

    const boxWidth = width - MARGIN * 2;
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
      ...this.readyView.getElements()
    ];
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
    this.bringElementsToTop();
  }

  bringElementsToTop(): void {
    this.actionPlanView?.bringElementsToTop();
    for (const elem of this.readyView.getElements()) {
      this.bringToTop(elem);
    }
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
    this.gridModalOpenCount = 0;
    this.actionPlanView?.destroy();
    this.readyView?.destroy();
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
    this.playerOptionSkinCache?.dispose();
    this.statusView?.destroy();
    this.inventoryView?.destroy();
    super.destroy(fromScene);
  }

  private updateCharacterSubtabVisibility(): void {
    const isCharacterTabActive =
      this.tabsController.getActiveTab() === "character";
    if (!isCharacterTabActive) {
      this.characterSubtabs.setVisible(false);
      this.skillsView.setVisible(false);
      this.hideStatusElements();
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
    this.actionPlanView?.setVisible(true);
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
    this.readyView.disableInteractive();
    this.actionPlanView?.setVisible(false);
  }

  private hideCharacterTabContents(): void {
    this.characterSubtabs.setVisible(false);
    this.hideStatusElements();
    this.skillsView.setVisible(false);
  }

  setTutorialStep(stepId: TutorialStepId | null, active = true): void {
    if (this.tutorialStepId === stepId && this.tutorialActive === active) {
      return;
    }
    this.tutorialStepId = stepId;
    this.tutorialActive = active;
    if (!stepId) {
      this.tutorialAllowedMainActionIds = null;
      this.tutorialAllowedSecondaryActionIds = null;
      this.tutorialActionEditingEnabled = true;
      this.tutorialReadyEnabled = true;
      this.actionPlanView?.setTutorialHighlight(null, false);
      this.skillsView.setAllowedSkillIds(null);
      this.shopView.setTutorialShopPolicy(null, null);
      this.updateFromMatch(this.currentMatch, this.currentUserId, this.lastUserMap);
      return;
    }

    const policy = getTutorialUiPolicy(stepId);
    this.tutorialAllowedMainActionIds = new Set(policy.primaryActionIds);
    this.tutorialAllowedSecondaryActionIds = new Set(
      policy.secondaryActionIds
    );
    this.tutorialActionEditingEnabled = !active || policy.actionEditingEnabled;
    this.tutorialReadyEnabled = !active || policy.readyEnabled;

    if (active && policy.highlightedTab) {
      this.tabsController.setActiveTab(policy.highlightedTab);
      this.tabLayout.reveal(policy.highlightedTab);
    }
    if (
      active &&
      policy.highlightedCharacterSubtab &&
      this.characterSubtabs.getActiveKey() !== policy.highlightedCharacterSubtab
    ) {
      this.characterSubtabs.setActiveKey(
        policy.highlightedCharacterSubtab,
        false
      );
      this.updateCharacterSubtabVisibility();
    }
    this.actionPlanView?.setTutorialHighlight(stepId, active);
    this.skillsView.setAllowedSkillIds(active ? policy.skillIds : null);
    this.shopView.setTutorialShopPolicy(
      active ? policy.shopIds : null,
      policy.highlightedControls.includes("detective") ? "detective" : null
    );
    this.updateFromMatch(this.currentMatch, this.currentUserId, this.lastUserMap);
    if (active && policy.actionEditingEnabled) {
      this.actionPlanView?.syncTutorialActionSelection(
        policy,
        this.currentUserId,
        this.currentMatch
      );
    }
    this.setReadyEnabled(this.readyEnabled);
  }

  setMobileTabNavigation(enabled: boolean): void {
    this.tabLayout.setMobileNavigation(enabled);
    const activeKey = enabled ? this.tabsController?.getActiveTab() : null;
    if (activeKey) {
      this.tabLayout.reveal(activeKey);
    }
  }

  private updateScrollMaskPosition(): void {
    const matrix = this.getWorldTransformMatrix();
    this.actionPlanView?.updateScrollMaskPosition({ tx: matrix.tx, ty: matrix.ty });
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
    if (this.readyView) {
      this.readyView.setPosition(barX, statusContentTop + 80);
    }
    const readyHeight = this.readyView ? this.readyView.height : 0;
    const readyBottom = statusContentTop + 80 + readyHeight + 24;
    const scrollTop = readyBottom;
    const scrollWidth = Math.max(120, width - MARGIN * 2);
    const scrollHeight = Math.max(160, height - scrollTop - MARGIN);
    const matrix = this.getWorldTransformMatrix();

    this.actionPlanView.layout({
      margin: MARGIN,
      scrollTop,
      scrollWidth,
      scrollHeight,
      worldTransform: { tx: matrix.tx, ty: matrix.ty }
    });

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
      this.actionPlanView?.applyTutorialActionEditingState();
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
    name: string | null,
    ready: boolean
  ) {
    this.currentCharacter = character;
    this.statusView.update(character, name);
    this.skillsView.update(character);

    this.actionPlanView.update({
      character,
      match: this.currentMatch,
      currentTurn: this.currentTurn,
      currentUserId: this.currentUserId,
      playerOptions: this.playerOptions,
      itemOptions: this.itemOptions,
      stealItemOptions: this.stealItemOptions,
      inventoryItemOptions: this.inventoryItemOptions,
      tutorialStepId: this.tutorialStepId,
      tutorialActive: this.tutorialActive,
      tutorialAllowedMainActionIds: this.tutorialAllowedMainActionIds,
      tutorialAllowedSecondaryActionIds: this.tutorialAllowedSecondaryActionIds,
      tutorialActionEditingEnabled: this.tutorialActionEditingEnabled
    });

    this.setReadyEnabled(true);
    this.setReadyState(ready, false);
    this.inventoryView.update(character);
  }

  setReadyState(ready: boolean, emit = false): boolean {
    return this.readyView?.setReadyState(ready, emit) ?? false;
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
    return this.readyView?.getReadyState() ?? false;
  }

  private isTutorialReadyAllowed(): boolean {
    if (!this.tutorialActive || !this.tutorialStepId) {
      return true;
    }
    return isTutorialReadyActionAllowed(this.tutorialStepId, {
      mainActionId: this.actionPlanView.getMainActionSelectionId(),
      targetLocation: this.actionPlanView.getMainActionTarget(),
      extraExecutions: this.actionPlanView.getMainExtraExecutions()
    });
  }

  private getUnspentSkillPoints(): number {
    return this.currentCharacter?.progression?.availableSkillPoints ?? 0;
  }

  private setReadyEnabled(enabled: boolean) {
    this.readyEnabled = enabled;
    if (!this.readyView) {
      return;
    }
    const isCharacterActive =
      this.tabsController?.isActive("character") ?? false;
    const isStatusActive =
      !this.characterSubtabs ||
      this.characterSubtabs.getActiveKey() === "status";
    const tutorialReadyAllowed = this.isTutorialReadyAllowed();
    const unspentPoints = this.getUnspentSkillPoints();

    this.readyView.refresh({
      enabled,
      isCharacterActive,
      isStatusActive,
      unspentSkillPoints: unspentPoints,
      plannedEnergyCost:
        this.actionPlanView?.getTotalPlannedEnergyCost() ?? 0,
      availableEnergy: this.actionPlanView?.getAvailableEnergy() ?? 0,
      tutorialActive: this.tutorialActive,
      tutorialStepId: this.tutorialStepId,
      tutorialReadyEnabled: this.tutorialReadyEnabled,
      tutorialReadyAllowed
    });
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
    this.actionPlanView?.updatePlayerOptions(this.playerOptions);
  }

  openPlayerCard(playerId: string): boolean {
    const opened = this.playersTabView.openPlayerCard(playerId);
    if (!opened) {
      return false;
    }
    this.tabsController.setActiveTab("players");
    return true;
  }

  private updateItemOptions(
    match: MatchRecord | null,
    currentUserId: string | null
  ) {
    const { groundItems, stealItems, inventoryItems } =
      buildCharacterPanelItemOptions(match, currentUserId);
    this.itemOptions = groundItems;
    this.stealItemOptions = stealItems;
    this.inventoryItemOptions = inventoryItems;
    this.actionPlanView?.updateItemOptions(
      this.itemOptions,
      this.stealItemOptions,
      this.inventoryItemOptions
    );
  }

  getMainActionSelection(): MainActionSelection {
    return this.actionPlanView.getMainActionSelection();
  }

  getSecondaryActionSelection(): SecondaryActionSelection {
    return this.actionPlanView.getSecondaryActionSelection();
  }

  getExtraSecondaryActionSelection(): SecondaryActionSelection {
    return this.actionPlanView.getExtraSecondaryActionSelection();
  }

  setMainActionTarget(target: Axial | null, emit = false): boolean {
    const changed = this.actionPlanView.setMainActionTarget(target, emit);
    this.setReadyEnabled(this.readyEnabled);
    return changed;
  }

  setMainActionSecondTarget(target: Axial | null, emit = false): boolean {
    return this.actionPlanView.setMainActionSecondTarget(target, emit);
  }

  setSecondaryActionTarget(target: Axial | null, emit = false): boolean {
    return this.actionPlanView.setSecondaryActionTarget(target, emit);
  }

  setExtraSecondaryActionTarget(target: Axial | null, emit = false): boolean {
    return this.actionPlanView.setExtraSecondaryActionTarget(target, emit);
  }

  setMainActionLocationSelectionPending(active: boolean): void {
    this.actionPlanView.setMainActionLocationSelectionPending(active);
  }

  setLocationSelectionPending(active: boolean): void {
    this.actionPlanView.setMainActionLocationSelectionPending(active);
  }

  setSecondLocationSelectionPending(active: boolean): void {
    this.actionPlanView.setSecondLocationSelectionPending(active);
  }

  setSecondaryLocationSelectionPending(active: boolean): void {
    this.actionPlanView.setSecondaryLocationSelectionPending(active);
  }

  setExtraSecondaryLocationSelectionPending(active: boolean): void {
    this.actionPlanView.setExtraSecondaryLocationSelectionPending(active);
  }

  closeCurrentGridSelect(): void {
    this.actionPlanView?.closeCurrentGridSelect();
    this.shopView?.closeModal();
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

  notifyEliminationEvents(turn: number, events: ReplayEvent[]) {
    this.logView.notifyEliminationEvents(turn, events);
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
}
