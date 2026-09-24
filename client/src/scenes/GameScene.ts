import Phaser from "phaser";
import type { RpcResponse } from "@heroiclabs/nakama-js";
import { makeButton, type UIButton } from "../ui/button";
import {
  CharacterPanel,
  type MainActionSelection,
  type SecondaryActionSelection,
  type ChatMessageViewModel
} from "../ui/CharacterPanel";
import { GameBoardRenderer } from "./GameBoardRenderer";
import { ActionPlanSynchronizer } from "./ActionPlanSynchronizer";
import { TutorialProgressController } from "../tutorial/TutorialProgressController";
import {
  clearActiveTutorialMatchId,
  getBrowserTutorialMatchStorage
} from "../tutorial/ActiveTutorialMatch";
import { getTutorialUiPolicy } from "../tutorial/TutorialUiPolicy";
import type { TurnService } from "../services/turnService";
import { MatchChatService } from "../services/chatService";
import {
  ActionLibrary,
  ExtraExecutionEffect,
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  HexTile,
  type ActionId,
  type Axial,
  type GameMap,
  generateGameMap,
  type GetStatePayload,
  type MatchRecord,
  type TrapRecord,
  type UpdateReadyStatePayload,
  type TurnAdvancedMessagePayload,
  type ReadyStateUpdateMessagePayload,
  type ReplayEvent,
  type ReplaySnapshot,
  type GetReplayPayload,
  type MatchChatMessage,
  axialDistance,
  normalizeAxial,
  ItemLibrary,
  TUTORIAL_BOT_ID,
  TUTORIAL_BOT_MESSAGES,
  TUTORIAL_CELL_COORDS,
  TUTORIAL_MATCH_METADATA_KEY,
  TUTORIAL_STEP_IDS,
  type SkillId,
  type TutorialStepId,
  type UpgradeSkillPayload,
  type UpdateTestamentPayload,
  type BuyShopItemPayload,
  type ShopId
} from "@shared";
import { buildBoardIconUrl, deriveBoardIconKey } from "../ui/actionIcons";
import {
  playReplayEvents,
  type MoveReplayContext
} from "../animation/moveReplay";
import { collectItemSpriteInfos } from "../ui/itemIcons";
import { ItemTooltipManager } from "../ui/ItemTooltip";
import { CellContentsPanel } from "../ui/CellContentsPanel";
import { HoverTooltip } from "../ui/HoverTooltip";
import { TopBanner, type TopBannerPayload } from "../ui/TopBanner";
import {
  preloadReplaySounds,
  applyStoredVolume
} from "../animation/soundPlayer";
import { assetPath } from "../utils/assetPath";
import { AccountService } from "../services/AccountService";
import { VictoryOverlay } from "../ui/VictoryOverlay";
import { TutorialInstructionView } from "../ui/TutorialInstructionView";
import { isAdminViewEnabled } from "../services/adminView";
import { t } from "../services/i18n";
import { THEME } from "../ui/ColorPalette";
import { ReplayControls } from "../ui/ReplayControls";

type PlayerEliminationBannerEvent = {
  playerId: string;
  playerName: string;
  texture: string;
  frame: string;
  turn: number;
};

type MobileViewMode = "map" | "sidebar";
type LocationSelectionTarget =
  | "primary"
  | "second"
  | "secondary"
  | "extraSecondary";

type CachedReplay = {
  events: ReplayEvent[];
  snapshot?: ReplaySnapshot;
};

const MOBILE_LAYOUT_BREAKPOINT = 760;

export class GameScene extends Phaser.Scene {
  private cam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private currentMatch: MatchRecord | null = null;
  private boardRenderer: GameBoardRenderer | null = null;
  private playerNameMap: Record<string, string> = {};
  private characterPanel: CharacterPanel | null = null;
  private characterPanelDesktopWidth = 0;
  private menuButton: UIButton | null = null;
  private viewModeButton: UIButton | null = null;
  private replayControls: ReplayControls | null = null;
  private replayPaused = false;
  private replayModeActive = false;
  private replayResumeWaiters: Array<() => void> = [];
  private mobileLayout = false;
  private mobileViewMode: MobileViewMode = "sidebar";
  private currentUserId: string | null = null;
  private currentPlayerName: string | null = null;
  private turnService: TurnService | null = null;
  private pointerDownInUI = false;
  private actionPlanSynchronizer: ActionPlanSynchronizer | null = null;
  private readyUpdateRunning = false;
  private pendingReadyState: boolean | undefined;
  private locationSelectionActive = false;
  private locationSelectionTarget: LocationSelectionTarget = "primary";
  private locationSelectionPointerId: number | null = null;
  private locationSelectionActionId: ActionId | null = null;
  private locationSelectionHoveredTileId: string | null = null;
  private replayQueue: ReplayEvent[][] = [];
  private replayPlaying = false;
  private logReplayCache = new Map<number, CachedReplay>();
  private replayView: {
    turn: number;
    snapshot: ReplaySnapshot;
    match: MatchRecord;
  } | null = null;
  private logTabActive = false;
  private logFetchRunning = false;
  private logPendingTurn: number | null = null;
  private manualReplayPlaying = false;
  private replayPlaybackCancelled = false;
  private gridModalActive = false;
  private browserHistoryGuardInstalled = false;
  private browserHistoryGuardUrl: string | null = null;
  private itemTooltip: ItemTooltipManager | null = null;
  private cellContentsPanel: CellContentsPanel | null = null;
  private hoverTooltip: HoverTooltip | null = null;
  private topBanner: TopBanner | null = null;
  private autoAdvanceText: Phaser.GameObjects.Text | null = null;
  private autoAdvanceTimer: Phaser.Time.TimerEvent | null = null;
  private autoAdvanceEnabled = false;
  private autoAdvanceRoundTime: string | null = null;
  private autoAdvanceLastAt: number | undefined = undefined;
  private chatService: MatchChatService | null = null;
  private chatMessages: MatchChatMessage[] = [];
  private chatUnsubscribe: (() => void) | null = null;
  private chatHistoryRefreshRunning = false;
  private chatTabActive = false;
  private tutorialPanDistance = 0;
  private tutorialController: TutorialProgressController | null = null;
  private currentPlayerSkin: import("@shared").Skin | null = null;
  private playerSkinMap = new Map<string, import("@shared").Skin>();
  private accountService: AccountService | null = null;
  private victoryOverlay: VictoryOverlay | null = null;
  private tutorialInstructionView: TutorialInstructionView | null = null;
  private reportTransitionStarted = false;
  private loadingOverlay: Phaser.GameObjects.Container | null = null;
  private loadingTrack: Phaser.GameObjects.Rectangle | null = null;
  private loadingFill: Phaser.GameObjects.Rectangle | null = null;
  private loadingLabel: Phaser.GameObjects.Text | null = null;
  private loadingPercent: Phaser.GameObjects.Text | null = null;
  private loadingProgress = 0;
  private pendingMatchEndPayload:
    | import("@shared").MatchEndedMessagePayload
    | null = null;
  private adminViewEnabled = false;
  private pinchActive = false;
  private pinchGestureInProgress = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchWorldAnchorX = 0;
  private pinchWorldAnchorY = 0;
  private pinchStartCenterX = 0;
  private pinchStartCenterY = 0;
  private mapTouchPointerIds = new Set<number>();

  private readonly turnAdvancedHandler = (
    payload: TurnAdvancedMessagePayload
  ) => {
    this.handleTurnAdvancedUpdate(payload);
  };
  private readonly matchEndedHandler = (
    payload: import("@shared").MatchEndedMessagePayload
  ) => {
    this.handleMatchEnded(payload);
  };
  private readonly readyStateUpdateHandler = (
    payload: ReadyStateUpdateMessagePayload
  ) => {
    this.handleReadyStateUpdate(payload);
  };
  private readonly pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
    this.tutorialPanDistance = 0;
    const overUI = this.isPointerOverUI(pointer);
    this.pointerDownInUI = overUI;
    this.itemTooltip?.hide();
    if (pointer.id > 0) {
      if (overUI) {
        this.mapTouchPointerIds.delete(pointer.id);
      } else {
        this.mapTouchPointerIds.add(pointer.id);
      }
      this.beginPinchIfPossible();
    }
    if (this.locationSelectionActive) {
      this.locationSelectionPointerId = overUI ? null : pointer.id;
    }
  };
  private readonly pointerUpHandler = (pointer: Phaser.Input.Pointer) => {
    if (
      this.locationSelectionActive &&
      this.locationSelectionPointerId !== null &&
      pointer.id === this.locationSelectionPointerId
    ) {
      this.locationSelectionPointerId = null;
    }
    this.mapTouchPointerIds.delete(pointer.id);
    this.endPinchIfNeeded();
    this.pointerDownInUI = false;
    this.tutorialPanDistance = 0;
  };
  private readonly pinchMoveHandler = () => {
    this.updatePinchZoom();
  };
  private readonly gridModalOpenHandler = () => {
    this.gridModalActive = true;
  };
  private readonly gridModalCloseHandler = () => {
    this.gridModalActive = false;
  };
  private readonly escapeKeyHandler = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    this.handleBackNavigation(false);
  };
  private readonly browserBackHandler = () => {
    this.handleBackNavigation(true);
  };
  private readonly replayPrevHandler = () => {
    this.navigateReplayTurn(-1);
  };
  private readonly replayPlayHandler = () => {
    this.toggleReplayPlayback();
  };
  private readonly replayNextHandler = () => {
    this.navigateReplayTurn(1);
  };
  private readonly replayLiveHandler = () => {
    this.exitReplayMode();
  };

  constructor() {
    super("GameScene");
  }

  private installBrowserHistoryGuard(): void {
    if (typeof window === "undefined" || this.browserHistoryGuardInstalled) {
      return;
    }
    this.browserHistoryGuardUrl = window.location.href;
    this.restoreBrowserHistoryGuard();
    window.addEventListener("popstate", this.browserBackHandler);
    this.browserHistoryGuardInstalled = true;
  }

  private removeBrowserHistoryGuard(): void {
    if (typeof window === "undefined" || !this.browserHistoryGuardInstalled) {
      return;
    }
    window.removeEventListener("popstate", this.browserBackHandler);
    this.browserHistoryGuardInstalled = false;
    this.browserHistoryGuardUrl = null;
  }

  private restoreBrowserHistoryGuard(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.history.pushState(
      { zarkaGameHistoryGuard: true },
      "",
      this.browserHistoryGuardUrl ?? window.location.href
    );
  }

  private returnToMainMenu(): void {
    this.removeBrowserHistoryGuard();
    this.scene.stop("GameScene");
    this.scene.wake("MainScene");
  }

  private handleBackNavigation(fromBrowser: boolean): void {
    if (this.cellContentsPanel?.isOpen) {
      this.cellContentsPanel.close();
    } else if (this.gridModalActive) {
      this.characterPanel?.closeCurrentGridSelect();
      this.gridModalActive = false;
    } else if (this.mobileLayout && this.mobileViewMode === "sidebar") {
      this.mobileViewMode = "map";
      this.layoutUI();
    } else {
      if (fromBrowser && this.browserHistoryGuardInstalled) {
        this.restoreBrowserHistoryGuard();
      }
      this.returnToMainMenu();
      return;
    }

    if (fromBrowser && this.browserHistoryGuardInstalled) {
      this.restoreBrowserHistoryGuard();
    }
  }

  private createLoadingOverlay() {
    const width = this.scale.width;
    const height = this.scale.height;
    const barWidth = Math.min(420, Math.max(220, width - 64));
    const barHeight = 18;
    const barX = (width - barWidth) / 2;
    const barY = height / 2 + 14;

    this.loadingOverlay = this.add.container(0, 0).setDepth(10000);
    const background = this.add
      .rectangle(
        width / 2,
        height / 2,
        width,
        height,
        THEME.colors.loadingBackground,
        1,
      )
      .setScrollFactor(0);
    const title = this.add
      .text(width / 2, height / 2 - 42, "Zarka", {
        color: THEME.colors.textPrimary,
        fontFamily: "Arial",
        fontSize: "30px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.loadingLabel = this.add
      .text(width / 2, height / 2 - 8, t("Loading game..."), {
        color: THEME.colors.loadingText,
        fontFamily: "Arial",
        fontSize: "16px",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.loadingTrack = this.add
      .rectangle(
        width / 2,
        barY,
        barWidth,
        barHeight,
        THEME.colors.loadingTrack,
        1,
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.loadingFill = this.add
      .rectangle(barX, barY, 1, barHeight, THEME.colors.loadingFill, 1)
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.loadingPercent = this.add
      .text(width / 2, barY + 32, "0%", {
        color: THEME.colors.loadingPercent,
        fontFamily: "Arial",
        fontSize: "14px",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.loadingOverlay.add([
      background,
      title,
      this.loadingLabel,
      this.loadingTrack,
      this.loadingFill,
      this.loadingPercent,
    ]);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeLoadingOverlay, this);
    this.resizeLoadingOverlay();
  }

  private updateLoadingProgress(value: number) {
    this.loadingProgress = Phaser.Math.Clamp(value, 0, 1);
    this.resizeLoadingOverlay();
    if (this.loadingPercent) {
      this.loadingPercent.setText(`${Math.round(this.loadingProgress * 100)}%`);
    }
  }

  private completeLoadingAssets() {
    this.loadingProgress = 1;
    this.resizeLoadingOverlay();
    this.loadingPercent?.setText("100%");
  }

  private resizeLoadingOverlay() {
    if (!this.loadingOverlay || !this.loadingTrack || !this.loadingFill) {
      return;
    }
    const width = this.scale.width;
    const height = this.scale.height;
    const barWidth = Math.min(420, Math.max(220, width - 64));
    const barHeight = 18;
    const barY = height / 2 + 14;
    const barX = (width - barWidth) / 2;
    const children = this.loadingOverlay.list;
    const background = children[0] as Phaser.GameObjects.Rectangle;
    const title = children[1] as Phaser.GameObjects.Text;
    background.setPosition(width / 2, height / 2).setSize(width, height);
    title.setPosition(width / 2, height / 2 - 42);
    this.loadingLabel?.setPosition(width / 2, height / 2 - 8);
    this.loadingTrack.setPosition(width / 2, barY).setSize(barWidth, barHeight);
    this.loadingFill
      .setPosition(barX, barY)
      .setSize(Math.max(1, barWidth * this.loadingProgress), barHeight);
    this.loadingPercent?.setPosition(width / 2, barY + 32);
  }

  private hideLoadingOverlay() {
    this.load.off("progress", this.updateLoadingProgress, this);
    this.load.off("complete", this.completeLoadingAssets, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeLoadingOverlay, this);
    this.loadingOverlay?.destroy(true);
    this.loadingOverlay = null;
    this.loadingTrack = null;
    this.loadingFill = null;
    this.loadingLabel = null;
    this.loadingPercent = null;
  }

  preload() {
    this.createLoadingOverlay();
    this.load.on("progress", this.updateLoadingProgress, this);
    this.load.once("complete", this.completeLoadingAssets, this);

    // Load the texture atlas (PNG + XML) from the public assets folder
    this.load.atlasXML(
      "hex",
      assetPath("assets/spritesheets/hexagonAll_sheet.png"),
      assetPath("assets/spritesheets/hexagonAll_sheet.xml")
    );
    this.load.atlasXML(
      "char",
      assetPath("assets/spritesheets/roguelikeChar_transparent.png"),
      assetPath("assets/spritesheets/roguelikeChar_transparent.xml")
    );

    const boardIconFrames = new Set<string>();
    for (const definition of Object.values(ActionLibrary)) {
      if (definition.texture === "Board Game Icons" && definition.frame) {
        boardIconFrames.add(definition.frame);
      }
    }
    const itemSpriteInfos = collectItemSpriteInfos(Object.values(ItemLibrary));
    for (const info of itemSpriteInfos) {
      if (info.type === "board" && info.frame) {
        boardIconFrames.add(info.frame);
        continue;
      }
      if (!this.textures.exists(info.key)) {
        this.load.image(info.key, info.url);
      }
    }
    for (const frame of boardIconFrames) {
      const key = deriveBoardIconKey(frame);
      if (!this.textures.exists(key)) {
        this.load.image(key, buildBoardIconUrl(frame));
      }
    }
    preloadReplaySounds(this);
  }

  async create() {
    applyStoredVolume(this);
    this.cam = this.cameras.main;
    this.uiCam = this.cameras.add(0, 0, this.cam.width, this.cam.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);
    this.itemTooltip = new ItemTooltipManager(this);
    this.cellContentsPanel = new CellContentsPanel(this);
    this.hoverTooltip = new HoverTooltip(this);
    this.turnService = this.registry.get("turnService") as TurnService | null;
    this.currentUserId = this.registry.get("currentUserId") as string | null;
    if (this.turnService) {
      this.turnService.setOnTurnAdvanced(this.turnAdvancedHandler);
      this.turnService.setOnMatchEnded(this.matchEndedHandler);
      this.turnService.setOnReadyStateUpdate(this.readyStateUpdateHandler);
      this.accountService = this.registry.get(
        "accountService"
      ) as AccountService | null;
    }

    this.boardRenderer = new GameBoardRenderer(
      this,
      this.cam,
      this.uiCam,
      this.itemTooltip,
      this.cellContentsPanel,
      this.hoverTooltip,
      {
        getCurrentMatch: () => this.currentMatch,
        getReplayView: () => this.replayView,
        getCurrentUserId: () => this.currentUserId,
        getPlayerSkin: (playerId) =>
          this.playerSkinMap.get(playerId) ??
          (playerId === this.currentUserId
            ? (this.currentPlayerSkin ?? undefined)
            : undefined),
        getPlayerName: (playerId) => this.playerNameMap[playerId] ?? playerId,
        getLocationSelection: () => ({
          active: this.locationSelectionActive &&
            this.locationSelectionActionId !== null,
          actionId: this.locationSelectionActionId,
          hoveredTileId: this.locationSelectionHoveredTileId,
          pointerId: this.locationSelectionPointerId,
          extraExecutions:
            this.getLocationPickSelection(this.locationSelectionTarget)
              ?.extraExecutions ?? 0,
        }),
        isPinchGestureInProgress: () => this.pinchGestureInProgress,
        isLocationInRange: (actionId, coord, extraExecutions) =>
          this.isLocationInRange(actionId, coord, extraExecutions),
        onTileHover: (tileId) => this.setLocationSelectionHoveredTile(tileId),
        onTilePick: (tile) => this.completeMainActionLocationPick(tile),
        onCellInfoOpened: (coord) => this.handleTutorialCellInfoOpened(coord),
        onPlayerCardClick: (playerId) => this.openPlayerCard(playerId),
      },
    );

    this.characterPanel = new CharacterPanel(this, 0, 0);
    this.characterPanelDesktopWidth = this.characterPanel.getPanelWidth();
    this.actionPlanSynchronizer = new ActionPlanSynchronizer({
      getTurnService: () => this.turnService,
      getCurrentUserId: () => this.currentUserId,
      getCurrentMatchId: () =>
        this.registry.get("currentMatchId") as string | null,
      getCurrentMatch: () => this.currentMatch,
      isReplayViewActive: () => this.replayView !== null,
      cancelMainActionLocationPick: () => this.cancelMainActionLocationPick(),
      parseRpcPayload: <T>(response: RpcResponse) =>
        this.parseRpcPayload<T>(response),
      updateCharacterPanel: (match) => this.updateCharacterPanel(match),
    });
    this.cam.ignore(this.characterPanel);
    this.characterPanel.on(
      "main-action-change",
      this.scheduleMainActionSelection,
      this
    );
    this.characterPanel.on(
      "secondary-action-change",
      this.scheduleSecondaryActionSelection,
      this
    );
    this.characterPanel.on(
      "extra-secondary-action-change",
      this.scheduleExtraSecondaryActionSelection,
      this
    );
    this.characterPanel.on(
      "main-action-location-request",
      this.beginMainActionLocationPick,
      this
    );
    this.characterPanel.on(
      "main-action-second-location-request",
      this.beginSecondMainActionLocationPick,
      this
    );
    this.characterPanel.on(
      "secondary-action-location-request",
      this.beginSecondaryActionLocationPick,
      this
    );
    this.characterPanel.on(
      "extra-secondary-action-location-request",
      this.beginExtraSecondaryActionLocationPick,
      this
    );
    this.characterPanel.on("ready-change", this.handleReadyStateChange, this);
    this.characterPanel.on("tab-change", this.handleTabChange, this);
    this.characterPanel.on("log-tab-opened", this.handleLogTabOpened, this);
    this.characterPanel.on("log-tab-closed", this.handleLogTabClosed, this);
    this.characterPanel.on("log-turn-request", this.handleLogTurnRequest, this);
    this.characterPanel.on(
      "log-play-manual",
      this.handleLogPlayRequestManual,
      this
    );
    this.characterPanel.on("grid-modal-open", this.gridModalOpenHandler);
    this.characterPanel.on("grid-modal-close", this.gridModalCloseHandler);
    this.characterPanel.on(
      "player-eliminated",
      this.handlePlayerEliminated,
      this
    );
    this.characterPanel.on("chat-send", this.handleChatSend, this);
    this.characterPanel.on("chat-tab-opened", this.handleChatTabOpened, this);
    this.characterPanel.on("apply-skills", this.handleApplySkills, this);
    this.characterPanel.on(
      "testament-change",
      this.handleTestamentChange,
      this
    );
    this.characterPanel.on("shop-purchase", this.handleShopPurchase, this);
    this.input.keyboard?.on("keydown", this.escapeKeyHandler);
    this.installBrowserHistoryGuard();

    if (this.turnService) {
      const skin = await this.turnService.getUserSkin();
      if (skin) {
        this.currentPlayerSkin = skin;
        if (this.currentUserId) {
          this.playerSkinMap.set(this.currentUserId, skin);
        }
        this.characterPanel.setCurrentPlayerSkin(skin);
      }
    }

    this.menuButton = makeButton(this, 0, 0, "☰", () => {
      this.returnToMainMenu();
    })
      .setScrollFactor(0)
      .setDepth(1100);
    this.cam.ignore(this.menuButton);
    this.viewModeButton = makeButton(this, 0, 0, "Map", () => {
      this.toggleMobileViewMode();
    })
      .setScrollFactor(0)
      .setDepth(1101);
    this.cam.ignore(this.viewModeButton);
    this.topBanner = new TopBanner(this, {
      camera: this.cam
    });
    this.replayControls = new ReplayControls(this, this.cam, {
      onPrevious: this.replayPrevHandler,
      onPlayPause: this.replayPlayHandler,
      onNext: this.replayNextHandler,
      onLive: this.replayLiveHandler,
    });
    this.victoryOverlay = new VictoryOverlay(this, {
      onTransitionComplete: () => this.openEndGameReport(),
    });
    this.tutorialInstructionView = new TutorialInstructionView(this);
    this.cam.ignore(this.tutorialInstructionView.getContainer());
    if (this.uiCam) {
      this.victoryOverlay.ignoreCamera(this.cam);
    }

    this.autoAdvanceText = this.add
      .text(10, 10, "", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#cbd5f5",
        resolution: 3
      })
      .setScrollFactor(0)
      .setVisible(false);
    this.cam.ignore(this.autoAdvanceText);

    this.adminViewEnabled = isAdminViewEnabled();
    const adminMatchId = this.registry.get("currentMatchId") as string | null;
    if (this.turnService && adminMatchId) {
      try {
        await this.turnService.setAdminView(
          adminMatchId,
          this.adminViewEnabled
        );
      } catch {
        // Non-admin users and stale runtime matches can ignore this sync.
      }
    }

    const match = await this.fetchMatchFromServer();
    this.currentMatch = match;
    this.initializeTutorialController(match);
    this.logReplayCache.clear();
    if (this.characterPanel) {
      this.characterPanel.setLogTurnInfo(match?.current_turn ?? 0);
    }

    const map = this.resolveMap(match);

    await this.resolvePlayerNames(match);
    const fallbackMatchId = this.registry.get("currentMatchId") as
      | string
      | null;
    await this.initMatchChat(match?.match_id ?? fallbackMatchId ?? null);
    await this.restoreTutorialProgressFromHistory(match);
    this.renderMap(map);
    if (match) {
      this.renderPlayerCharacters(match);
    }
    this.updateCharacterPanel(match);
    this.configureAutoAdvanceTimer(match);

    if (match) {
      const isEnded = match.started === false || match.removed !== 0;
      if (isEnded && this.currentUserId) {
        const dead = match.deadCharacters ?? {};
        const characters = match.playerCharacters ?? {};
        const players = Object.keys(characters);
        const alive = players.filter((id) => {
          const character = characters[id];
          const currentHealth = character?.stats?.health?.current;
          return (
            dead[id] !== true &&
            !character?.statuses?.conditions?.includes("dead") &&
            !(typeof currentHealth === "number" && currentHealth <= 0)
          );
        });
        const winnerId = alive.length > 0 ? alive[0] : undefined;
        const winningCharacter = winnerId ? characters[winnerId] : undefined;
        const winningTeamId =
          winningCharacter?.secretTeamId || winningCharacter?.teamId;
        const winnerIds = winningTeamId
          ? alive.filter((id) => {
              const character = characters[id];
              return (
                (character?.secretTeamId || character?.teamId) ===
                winningTeamId
              );
            })
          : alive;
        this.triggerVictoryOverlay({
          match_id: match.match_id,
          winnerId,
          winnerIds,
          reason: alive.length === 0 ? "all_dead" : "last_alive"
        });
      }
    }

    this.enableDragPan();
    this.enableWheelZoom();
    this.enablePinchZoom();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
    this.input.on(
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
      this.pointerUpHandler
    );

    this.layoutUI();
    this.updateTutorialGuidance();
    this.hideLoadingOverlay();
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.actionPlanSynchronizer?.destroy();
      this.actionPlanSynchronizer = null;
      this.tutorialController = null;
      this.scale.off("resize", this.handleResize, this);
      this.hideLoadingOverlay();
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
      this.input.off(
        Phaser.Input.Events.POINTER_UP_OUTSIDE,
        this.pointerUpHandler
      );
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pinchMoveHandler);
      this.characterPanel?.off(
        "main-action-change",
        this.scheduleMainActionSelection,
        this
      );
      this.characterPanel?.off(
        "secondary-action-change",
        this.scheduleSecondaryActionSelection,
        this
      );
      this.characterPanel?.off(
        "extra-secondary-action-change",
        this.scheduleExtraSecondaryActionSelection,
        this
      );
      this.characterPanel?.off(
        "main-action-location-request",
        this.beginMainActionLocationPick,
        this
      );
      this.characterPanel?.off(
        "main-action-second-location-request",
        this.beginSecondMainActionLocationPick,
        this
      );
      this.characterPanel?.off(
        "secondary-action-location-request",
        this.beginSecondaryActionLocationPick,
        this
      );
      this.characterPanel?.off(
        "extra-secondary-action-location-request",
        this.beginExtraSecondaryActionLocationPick,
        this
      );
      this.characterPanel?.off(
        "ready-change",
        this.handleReadyStateChange,
        this
      );
      this.characterPanel?.off("tab-change", this.handleTabChange, this);
      this.characterPanel?.off("log-tab-opened", this.handleLogTabOpened, this);
      this.characterPanel?.off("log-tab-closed", this.handleLogTabClosed, this);
      this.characterPanel?.off(
        "log-turn-request",
        this.handleLogTurnRequest,
        this
      );
      this.characterPanel?.off(
        "log-play-manual",
        this.handleLogPlayRequestManual,
        this
      );
      this.characterPanel?.off("grid-modal-open", this.gridModalOpenHandler);
      this.characterPanel?.off("grid-modal-close", this.gridModalCloseHandler);
      this.characterPanel?.off(
        "player-eliminated",
        this.handlePlayerEliminated,
        this
      );
      this.characterPanel?.off("chat-send", this.handleChatSend, this);
      this.characterPanel?.off(
        "chat-tab-opened",
        this.handleChatTabOpened,
        this
      );
      this.characterPanel?.off("shop-purchase", this.handleShopPurchase, this);
      this.gridModalActive = false;
      this.cancelMainActionLocationPick();
      this.itemTooltip?.hide();
      this.cellContentsPanel?.destroy();
      this.cellContentsPanel = null;
      this.stopAutoAdvanceTimer();
      this.boardRenderer?.destroy();
      this.boardRenderer = null;
      this.itemTooltip?.destroy();
      this.itemTooltip = null;
      this.hoverTooltip?.destroy();
      this.hoverTooltip = null;
      this.input.keyboard?.off("keydown", this.escapeKeyHandler);
      this.removeBrowserHistoryGuard();
      if (this.turnService) {
        this.turnService.setOnTurnAdvanced();
        this.turnService.setOnMatchEnded();
        this.turnService.setOnReadyStateUpdate();
      }
      this.topBanner?.destroy();
      this.topBanner = null;
      this.victoryOverlay?.destroy();
      this.victoryOverlay = null;
      this.tutorialInstructionView?.destroy();
      this.tutorialInstructionView = null;

      if (this.autoAdvanceTimer) {
        this.autoAdvanceTimer.remove(false);
        this.autoAdvanceTimer = null;
      }
      this.autoAdvanceText?.destroy();
      this.autoAdvanceText = null;
      this.viewModeButton?.destroy();
      this.viewModeButton = null;
      this.replayControls?.destroy();
      this.replayControls = null;
      this.resolveReplayResumeWaiters();
      if (this.chatUnsubscribe) {
        this.chatUnsubscribe();
        this.chatUnsubscribe = null;
      }
      if (this.chatService) {
        this.chatService
          .disconnect()
          .catch((error) => console.warn("Chat disconnect failed", error));
        this.chatService = null;
      }
    });
  }

  private async restoreTutorialProgressFromHistory(
    match: MatchRecord | null
  ): Promise<void> {
    if (!match || !this.tutorialController || !this.turnService) {
      return;
    }
    const maxTurn = Math.max(0, Math.floor(match.current_turn ?? 0));
    for (let turn = 1; turn <= maxTurn; turn += 1) {
      try {
        const response = await this.turnService.getReplay(match.match_id, turn);
        const payload = this.parseRpcPayload<GetReplayPayload>(response);
        if (payload.error) {
          throw new Error(payload.error);
        }
        const events = Array.isArray(payload.events) ? payload.events : [];
        const replayMatch: MatchRecord = {
          ...match,
          current_turn: payload.turn ?? turn,
          playerCharacters:
            payload.snapshot?.playerCharacters ?? match.playerCharacters,
          deadCharacters:
            payload.snapshot?.deadCharacters ?? match.deadCharacters,
          map: payload.snapshot?.map ?? match.map,
          items: payload.snapshot?.items ?? match.items
        };
        this.handleTutorialTurn(replayMatch, events);
        this.observeTutorialMatchState(replayMatch);
      } catch (error) {
        console.warn(`Failed to restore tutorial replay for turn ${turn}`, error);
        break;
      }
    }
    this.observeTutorialMatchState(match);
    this.observeTutorialChatHistory(this.chatMessages);
  }

  private async fetchMatchFromServer(): Promise<MatchRecord | null> {
    const service = this.turnService;
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!service || !matchId) {
      return null;
    }
    try {
      const res = await service.getState(matchId, this.adminViewEnabled);
      const payload = this.parseRpcPayload<GetStatePayload>(res);
      if (payload && payload.match) {
        return payload.match;
      }
    } catch (error) {
      console.warn("fetchMatchFromServer failed", error);
    }
    return null;
  }

  private parseRpcPayload<T>(res: RpcResponse): T {
    const raw: unknown = (res as RpcResponse).payload as unknown;
    if (typeof raw === "string") {
      return JSON.parse(raw) as T;
    }
    if (raw && typeof raw === "object") {
      return raw as T;
    }
    throw new Error("Unsupported payload type: " + typeof raw);
  }

  private resolveMap(match: MatchRecord | null): GameMap {
    if (
      match &&
      match.map &&
      Array.isArray(match.map.tiles) &&
      match.map.cols &&
      match.map.rows &&
      match.map.tiles.length === match.map.cols * match.map.rows
    ) {
      return match.map;
    }

    const cols = match?.cols && match.cols > 0 ? match.cols : DEFAULT_MAP_COLS;
    const rows = match?.rows && match.rows > 0 ? match.rows : DEFAULT_MAP_ROWS;
    const seed = match?.map?.seed;
    const generated = generateGameMap(cols, rows, CellLibrary, seed);
    return generated.map;
  }

  private renderMap(map: GameMap): void {
    this.boardRenderer?.renderMap(map);
  }

  private renderPlayerCharacters(match: MatchRecord): void {
    this.boardRenderer?.renderPlayerCharacters(match);
  }

  private renderItems(map: GameMap): void {
    this.boardRenderer?.renderItems(map);
  }

  private renderTraps(traps: TrapRecord[] | undefined): void {
    this.boardRenderer?.renderTraps(traps);
  }

  private renderFireTileAnimations(map: GameMap): void {
    this.boardRenderer?.renderFireTileAnimations(map);
  }

  private enableDragPan() {
    // let isDragging = false;
    const cam = this.cam;
    // const dragStart = new Phaser.Math.Vector2();
    // const camStart = new Phaser.Math.Vector2();

    // No-op handlers removed

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (
        !p.isDown ||
        this.pointerDownInUI ||
        this.gridModalActive ||
        this.cellContentsPanel?.isOpen ||
        this.pinchActive
      ) {
        return;
      }

      // const { x, y } = p.velocity; // camStart.x - dx
      const diffX = p.position.x - p.prevPosition.x;
      const diffY = p.position.y - p.prevPosition.y;

      cam.scrollX -= diffX / cam.zoom;
      cam.scrollY -= diffY / cam.zoom;
      this.tutorialPanDistance += Math.sqrt(diffX * diffX + diffY * diffY);
      if (this.tutorialPanDistance >= 16) {
        this.recordTutorialPresentation("map_pan");
      }
    });
  }

  private enablePinchZoom() {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pinchMoveHandler);
  }

  private getMapTouchPointers(): Phaser.Input.Pointer[] {
    return [this.input.pointer1, this.input.pointer2].filter(
      (pointer) => pointer.isDown && this.mapTouchPointerIds.has(pointer.id)
    );
  }

  private beginPinchIfPossible(): void {
    if (
      this.pinchActive ||
      this.gridModalActive ||
      this.cellContentsPanel?.isOpen
    ) {
      return;
    }
    const pointers = this.getMapTouchPointers();
    if (pointers.length < 2) {
      return;
    }
    const [first, second] = pointers;
    const distance = Phaser.Math.Distance.Between(
      first.x,
      first.y,
      second.x,
      second.y
    );
    if (distance <= 0) {
      return;
    }
    this.pinchActive = true;
    this.pinchGestureInProgress = true;
    this.pinchStartDistance = distance;
    this.pinchStartZoom = this.cam.zoom;
    this.pinchStartCenterX = (first.x + second.x) / 2;
    this.pinchStartCenterY = (first.y + second.y) / 2;
    const worldAnchor = this.cam.getWorldPoint(
      this.pinchStartCenterX,
      this.pinchStartCenterY
    );
    this.pinchWorldAnchorX = worldAnchor.x;
    this.pinchWorldAnchorY = worldAnchor.y;
  }

  private endPinchIfNeeded(): void {
    const activePointers = this.getMapTouchPointers().length;
    if (activePointers < 2) {
      this.pinchActive = false;
      this.pinchStartDistance = 0;
      if (activePointers === 0) {
        this.pinchGestureInProgress = false;
      }
    }
  }

  private updatePinchZoom(): void {
    if (this.cellContentsPanel?.isOpen) {
      return;
    }
    if (!this.pinchActive) {
      this.beginPinchIfPossible();
      return;
    }
    const pointers = this.getMapTouchPointers();
    if (pointers.length < 2) {
      this.endPinchIfNeeded();
      return;
    }
    const [first, second] = pointers;
    const distance = Phaser.Math.Distance.Between(
      first.x,
      first.y,
      second.x,
      second.y
    );
    if (distance <= 0 || this.pinchStartDistance <= 0) {
      return;
    }
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const nextZoom = Phaser.Math.Clamp(
      this.pinchStartZoom * (distance / this.pinchStartDistance),
      0.5,
      3
    );
    this.cam.setZoom(nextZoom);
    const worldPointAfter = this.cam.getWorldPoint(centerX, centerY);
    this.cam.scrollX += this.pinchWorldAnchorX - worldPointAfter.x;
    this.cam.scrollY += this.pinchWorldAnchorY - worldPointAfter.y;
  }

  private enableWheelZoom() {
    const minZoom = 0.5;
    const maxZoom = 3;
    const cam = this.cam;

    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        _over: unknown[],
        _dx: number,
        dy: number
      ) => {
        if (this.gridModalActive || this.isPointerOverUI(pointer)) {
          return;
        }
        const oldZoom = cam.zoom;
        const zoomFactor = dy > 0 ? 0.9 : 1.1;
        const nextZoom = Phaser.Math.Clamp(
          oldZoom * zoomFactor,
          minZoom,
          maxZoom
        );
        if (nextZoom === oldZoom) {
          return;
        }

        const originX = cam.width * cam.originX;
        const originY = cam.height * cam.originY;
        const relX = pointer.x - cam.x - originX;
        const relY = pointer.y - cam.y - originY;

        cam.setZoom(nextZoom);
        cam.scrollX += relX * (1 / oldZoom - 1 / nextZoom);
        cam.scrollY += relY * (1 / oldZoom - 1 / nextZoom);
        if (cam.useBounds) {
          cam.scrollX = cam.clampX(cam.scrollX);
          cam.scrollY = cam.clampY(cam.scrollY);
        }
      }
    );
  }

  private handlePlayerEliminated(payload: PlayerEliminationBannerEvent) {
    const bannerPayload: TopBannerPayload = {
      text: `${payload.playerName} ${t("was eliminated")}`,
      texture: payload.texture,
      frame: payload.frame
    };
    this.topBanner?.show(bannerPayload);
    if (this.currentMatch && payload.playerId) {
      this.currentMatch.deadCharacters = this.currentMatch.deadCharacters ?? {};
      this.currentMatch.deadCharacters[payload.playerId] = true;
      this.updateCharacterPanel(this.currentMatch);
    }
  }

  private handleMatchEnded(
    payload: import("@shared").MatchEndedMessagePayload
  ) {
    if (!payload || typeof payload.match_id !== "string") {
      return;
    }
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!matchId || payload.match_id !== matchId) {
      return;
    }
    if (!this.currentUserId) {
      return;
    }
    this.recordTutorialGameplay("victory_recap");
    if (this.replayPlaying) {
      this.pendingMatchEndPayload = payload;
    } else {
      this.triggerVictoryOverlay(payload);
    }
  }

  private triggerVictoryOverlay(
    payload: import("@shared").MatchEndedMessagePayload
  ) {
    if (
      !this.victoryOverlay ||
      !this.currentUserId ||
      this.reportTransitionStarted ||
      this.victoryOverlay.isShowing()
    ) {
      return;
    }
    const winnerIds = Array.isArray(payload.winnerIds)
      ? payload.winnerIds
      : payload.winnerId
        ? [payload.winnerId]
        : [];
    const isWinner =
      !!this.currentUserId && winnerIds.indexOf(this.currentUserId) !== -1;
    const isDraw = winnerIds.length === 0 || payload.reason === "all_dead";
    const result: import("../ui/VictoryOverlay").MatchEndResultType = isWinner
      ? "win"
      : isDraw
        ? "draw"
        : "loss";

    let winnerName: string | undefined = undefined;
    if (payload.winnerId) {
      winnerName = this.playerNameMap[payload.winnerId] ?? payload.winnerId;
    }

    const turns = this.currentMatch?.current_turn ?? 0;
    this.victoryOverlay.show({
      result,
      winnerName,
      winnerId: payload.winnerId,
      turns,
      tutorial: !!this.currentMatch?.metadata?.[TUTORIAL_MATCH_METADATA_KEY],
    });
    this.animateEndGameCamera(payload.winnerId);
  }

  private animateEndGameCamera(winnerId?: string) {
    const winner = winnerId
      ? this.boardRenderer?.getPlayerSprite(winnerId)
      : undefined;
    const targetZoom = Math.max(this.cam.zoom, 1.25);
    const config: Phaser.Types.Tweens.TweenBuilderConfig = {
      targets: this.cam,
      zoom: targetZoom,
      duration: 1800,
      ease: "Cubic.out",
    };
    if (winner) {
      config.scrollX = winner.x - this.cam.width / (2 * targetZoom);
      config.scrollY = winner.y - this.cam.height / (2 * targetZoom);
    }
    this.tweens.add(config);
  }

  private openEndGameReport() {
    if (this.reportTransitionStarted) {
      return;
    }
    this.reportTransitionStarted = true;
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (matchId && this.currentMatch?.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
      clearActiveTutorialMatchId(
        getBrowserTutorialMatchStorage(),
        this.currentUserId,
        matchId
      );
    }
    const runtimeMatchId = this.currentMatch?.runtime_match_id ?? matchId;
    if (runtimeMatchId && this.turnService) {
      this.turnService
        .leaveRealtimeMatch(runtimeMatchId)
        .catch((error) => console.warn("Failed to leave finished match", error));
    }
    this.scene.stop("GameScene");
    if (matchId) {
      this.scene.run("EndGameReportScene", { matchId });
    } else if (this.scene.isSleeping("MainScene")) {
      this.scene.wake("MainScene");
    }
  }

  isVictoryOverlayActive(): boolean {
    return this.victoryOverlay?.isShowing() ?? false;
  }

  private configureAutoAdvanceTimer(match: MatchRecord | null) {
    const roundTime =
      match && typeof match.roundTime === "string" ? match.roundTime : null;
    const autoSkip = match?.autoSkip === true;
    this.autoAdvanceEnabled = autoSkip && !!roundTime;
    this.autoAdvanceRoundTime = this.autoAdvanceEnabled ? roundTime : null;
    this.autoAdvanceLastAt = match?.lastAutoAdvanceAt;

    if (!this.autoAdvanceText) {
      return;
    }

    if (!this.autoAdvanceEnabled || !this.autoAdvanceRoundTime) {
      this.autoAdvanceText.setVisible(false);
      this.stopAutoAdvanceTimer();
      return;
    }

    this.autoAdvanceText.setVisible(true);
    this.refreshAutoAdvanceTimer();
    this.startAutoAdvanceTimer();
  }

  private startAutoAdvanceTimer() {
    if (this.autoAdvanceTimer) {
      return;
    }
    const nowMs = Date.now();
    const delay = 60_000 - (nowMs % 60_000);
    this.autoAdvanceTimer = this.time.addEvent({
      delay,
      loop: true,
      callback: this.refreshAutoAdvanceTimer,
      callbackScope: this
    });
  }

  private stopAutoAdvanceTimer() {
    if (!this.autoAdvanceTimer) {
      return;
    }
    this.autoAdvanceTimer.remove(false);
    this.autoAdvanceTimer = null;
  }

  private refreshAutoAdvanceTimer() {
    if (!this.autoAdvanceText || !this.autoAdvanceRoundTime) {
      return;
    }
    const parsed = this.parseRoundTime(this.autoAdvanceRoundTime);
    if (!parsed) {
      this.autoAdvanceText.setText("Auto-advance time unavailable");
      return;
    }
    const targetMinutes = parsed.hours * 60 + parsed.minutes;
    const nowMs = Date.now();
    const nowLocal = new Date(nowMs);
    const localMidnightMs = new Date(
      nowLocal.getFullYear(),
      nowLocal.getMonth(),
      nowLocal.getDate()
    ).getTime();
    const targetTodayMs = localMidnightMs + targetMinutes * 60_000;

    const lastAt = this.autoAdvanceLastAt;
    const alreadyAdvancedToday =
      lastAt !== undefined && this.isInSameLocalDay(lastAt * 1000, nowMs);

    const nextTargetMs =
      alreadyAdvancedToday || nowMs >= targetTodayMs
        ? targetTodayMs + 24 * 60 * 60_000
        : targetTodayMs;

    const diffMs = nextTargetMs - nowMs;
    const totalMinutes = Math.max(0, Math.ceil(diffMs / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    this.autoAdvanceText.setText(`Auto-advance in ${hours}h ${minutes}m`);
    const urgent = diffMs < 3 * 60 * 60_000;
    this.autoAdvanceText.setColor(urgent ? "#ff6666" : "#cbd5f5");
  }

  private isInSameLocalDay(msA: number, msB: number): boolean {
    const dateA = new Date(msA);
    const dateB = new Date(msB);
    return (
      dateA.getFullYear() === dateB.getFullYear() &&
      dateA.getMonth() === dateB.getMonth() &&
      dateA.getDate() === dateB.getDate()
    );
  }

  private parseRoundTime(
    value: string
  ): { hours: number; minutes: number } | null {
    const parts = value.split(":");
    if (parts.length !== 2) return null;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    return { hours, minutes };
  }

  private updateReplayControls(): void {
    const visible = this.replayModeActive && this.replayView !== null;
    if (!visible) {
      this.replayControls?.setState({
        visible: false,
        canPrevious: false,
        canPlayPause: false,
        canNext: false,
        canLive: false,
      });
      return;
    }
    const turn = this.replayView?.turn ?? 0;
    const maxTurn = this.currentMatch?.current_turn ?? turn;
    const navigationEnabled = !this.logFetchRunning && !this.manualReplayPlaying;
    const cachedReplay = this.logReplayCache.get(turn);
    this.replayControls?.setState({
      visible: true,
      canPrevious: navigationEnabled && turn > 0,
      canPlayPause:
        !this.logFetchRunning &&
        (this.manualReplayPlaying ||
          (cachedReplay !== undefined && cachedReplay.events.length > 0)),
      canNext: navigationEnabled && turn < maxTurn,
      canLive: true,
    });
  }

  private layoutUI() {
    const width = this.uiCam ? this.uiCam.width : this.scale.width;
    const height = this.uiCam ? this.uiCam.height : this.scale.height;
    const isMobile = this.isMobileViewport(width);

    if (isMobile !== this.mobileLayout) {
      this.mobileLayout = isMobile;
      if (isMobile) {
        this.mobileViewMode = "sidebar";
      }
    }

    if (this.characterPanel) {
      this.characterPanel.setMobileTabNavigation(isMobile);
      if (isMobile) {
        const showSidebar = this.mobileViewMode === "sidebar";
        this.characterPanel.setPosition(0, 0);
        this.characterPanel.setPanelSize(width, height);
        this.characterPanel.setVisible(showSidebar);
        this.characterPanel.setActive(showSidebar);
      } else {
        this.characterPanel.setVisible(true);
        this.characterPanel.setActive(true);
        this.characterPanel.setPosition(
          width - this.characterPanelDesktopWidth,
          0
        );
        this.characterPanel.setPanelSize(
          this.characterPanelDesktopWidth,
          height
        );
      }
    }

    if (this.menuButton) {
      this.menuButton.setPosition(10, height - this.menuButton.height - 10);
    }
    if (this.viewModeButton) {
      const showModeButton = isMobile;
      this.viewModeButton.setVisible(showModeButton);
      this.viewModeButton.setActive(showModeButton);
      if (showModeButton) {
        this.viewModeButton.setText(
          this.mobileViewMode === "sidebar" ? "[ Map ]" : "[ Panel ]"
        );
        this.viewModeButton.setPosition(
          width - this.viewModeButton.width - 12,
          height - this.viewModeButton.height - 10
        );
      }
    }
    if (this.autoAdvanceText) {
      this.autoAdvanceText.setPosition(10, 10);
    }
    this.topBanner?.layout(width);
    this.replayControls?.layout(
      width,
      height,
      this.menuButton?.height ?? 32
    );
    this.victoryOverlay?.layout(width, height);
    this.tutorialInstructionView?.layout(width, height);
  }

  private isMobileViewport(width: number): boolean {
    if (width <= MOBILE_LAYOUT_BREAKPOINT) {
      return true;
    }
    if (typeof navigator === "undefined") {
      return false;
    }
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  private toggleMobileViewMode(): void {
    if (!this.mobileLayout) {
      return;
    }
    if (this.mobileViewMode === "map") {
      this.cancelMainActionLocationPick();
      this.mobileViewMode = "sidebar";
    } else {
      this.mobileViewMode = "map";
    }
    this.layoutUI();
  }

  private showMobileSidebar(): void {
    if (!this.mobileLayout) {
      return;
    }
    this.mobileViewMode = "sidebar";
    this.layoutUI();
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width ?? this.scale.width;
    const height = gameSize.height ?? this.scale.height;
    this.cam.setSize(width, height);
    this.uiCam.setSize(width, height);
    this.layoutUI();
    this.updateTutorialGuidance();
  }

  private updateCharacterPanel(match: MatchRecord | null) {
    if (!this.characterPanel) {
      return;
    }
    const nameMap =
      Object.keys(this.playerNameMap).length > 0
        ? this.playerNameMap
        : undefined;
    this.characterPanel.updateFromMatch(match, this.currentUserId, nameMap);
    const turns = match?.current_turn ?? 0;
    this.characterPanel.setLogTurnInfo(turns);
    if (!match) {
      this.logReplayCache.clear();
      return;
    }
    this.observeTutorialMatchState(match);
  }

  private initializeTutorialController(match: MatchRecord | null): void {
    this.tutorialController = match?.metadata?.[TUTORIAL_MATCH_METADATA_KEY]
      ? new TutorialProgressController(TUTORIAL_STEP_IDS)
      : null;
    this.updateTutorialGuidance();
  }

  private updateTutorialGuidance(): void {
    const isTutorial = this.tutorialController !== null;
    const currentStep = this.tutorialController?.currentStep ?? null;
    if (isTutorial && this.mobileLayout) {
      const policy = getTutorialUiPolicy(currentStep);
      const targetView = policy.mapRequired
        ? "map"
        : policy.highlightedTab
          ? "sidebar"
          : null;
      if (targetView && this.mobileViewMode !== targetView) {
        this.mobileViewMode = targetView;
        this.layoutUI();
      }
    }
    this.tutorialInstructionView?.setStep(currentStep);
    this.characterPanel?.setTutorialStep(currentStep, isTutorial);
  }

  private recordTutorialPresentation(stepId: TutorialStepId): void {
    this.tutorialController?.recordPresentation(stepId);
    this.completeVisibleTutorialSteps();
  }

  private recordTutorialGameplay(stepId: TutorialStepId): void {
    this.tutorialController?.recordGameplay(stepId);
    this.completeVisibleTutorialSteps();
  }

  private completeVisibleTutorialSteps(): void {
    const controller = this.tutorialController;
    if (!controller) {
      return;
    }
    let currentStep = controller.currentStep;
    while (currentStep) {
      if (
        currentStep === "open_chat" &&
        this.chatTabActive &&
        this.characterPanel?.visible === true &&
        controller.hasObservedGameplayStep("bot_chat")
      ) {
        controller.recordPresentation(currentStep);
        currentStep = controller.currentStep;
        continue;
      }
      if (
        currentStep === "read_detective_result" &&
        this.logTabActive &&
        this.characterPanel?.visible === true &&
        this.hasTutorialDetectiveResult()
      ) {
        controller.recordPresentation(currentStep);
        currentStep = controller.currentStep;
        continue;
      }
      this.updateTutorialGuidance();
      return;
    }
    this.updateTutorialGuidance();
  }

  private hasTutorialDetectiveReveal(): boolean {
    const player =
      this.currentUserId && this.currentMatch?.playerCharacters
        ? this.currentMatch.playerCharacters[this.currentUserId]
        : undefined;
    const revealedTeam =
      this.currentMatch?.revealedTeamsByPlayerId?.[TUTORIAL_BOT_ID] ??
      player?.revealedTeamIdsByPlayerId?.[TUTORIAL_BOT_ID];
    return typeof revealedTeam === "string" && revealedTeam.length > 0;
  }

  private hasTutorialDetectiveResult(): boolean {
    if (!this.currentUserId || !this.hasTutorialDetectiveReveal()) {
      return false;
    }
    for (const replay of this.logReplayCache.values()) {
      if (
        replay.events.some(
          (event) =>
            event.kind === "player" &&
            event.actorId === this.currentUserId &&
            event.action.actionId === "buy_detective"
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private observeTutorialMatchState(match: MatchRecord): void {
    if (!this.tutorialController || !this.currentUserId) {
      return;
    }
    const player = match.playerCharacters?.[this.currentUserId];
    const bot = match.playerCharacters?.[TUTORIAL_BOT_ID];
    if (!player) {
      return;
    }

    const abilities = player.abilities ?? [];
    if (
      abilities.indexOf("vitality") !== -1 &&
      abilities.indexOf("strength2") !== -1 &&
      player.stats.health.max > 12
    ) {
      this.recordTutorialGameplay("choose_skills");
    }
    if ((player.discoveredItemIds?.length ?? 0) > 0) {
      this.recordTutorialGameplay("search");
    }
    const hasItem = (itemId: string): boolean =>
      player.inventory.carriedItems.some(
        (item) => item.itemId === itemId && item.quantity > 0
      );
    if (hasItem("bandage") && hasItem("axe") && hasItem("food")) {
      this.recordTutorialGameplay("pickup_items");
    }
    if (this.hasTutorialDetectiveReveal()) {
      this.recordTutorialGameplay("buy_detective");
    }

    const mainPlan = player.actionPlan?.main;
    if (
      mainPlan?.actionId === "axe_attack" &&
      mainPlan.targetPlayerIds?.indexOf(TUTORIAL_BOT_ID) !== -1
    ) {
      this.recordTutorialGameplay("plan_axe_attack");
    }
    if (
      mainPlan?.actionId === "scare" &&
      mainPlan.extraExecutions === 1 &&
      mainPlan.targetPlayerIds?.indexOf(TUTORIAL_BOT_ID) !== -1 &&
      mainPlan.targetLocationId?.q === TUTORIAL_CELL_COORDS.doomed.q &&
      mainPlan.targetLocationId?.r === TUTORIAL_CELL_COORDS.doomed.r
    ) {
      this.recordTutorialGameplay("scare_bot_to_doomed_cell");
    }

    const currentTurn = match.current_turn ?? 0;
    const doomedTile = match.map?.tiles.find(
      (tile) =>
        tile.coord.q === TUTORIAL_CELL_COORDS.doomed.q &&
        tile.coord.r === TUTORIAL_CELL_COORDS.doomed.r
    );
    const warningTurn = doomedTile?.meta?.warningTurn;
    const destructionTurn = doomedTile?.meta?.destructionTurn;
    if (
      typeof warningTurn === "number" &&
      typeof destructionTurn === "number" &&
      currentTurn >= warningTurn &&
      currentTurn < destructionTurn &&
      doomedTile?.meta?.destroyed !== true
    ) {
      this.recordTutorialGameplay("observe_destruction_warning");
    }

    const botDead =
      match.deadCharacters?.[TUTORIAL_BOT_ID] === true ||
      bot?.statuses?.conditions?.indexOf("dead") !== -1 ||
      (typeof bot?.stats.health.current === "number" &&
        bot.stats.health.current <= 0);
    if (doomedTile?.meta?.destroyed === true && botDead) {
      this.recordTutorialGameplay("resolve_destruction");
    }
    if ((match.started === false || match.removed !== 0) && botDead) {
      this.recordTutorialGameplay("victory_recap");
    }
  }

  private handleTutorialCellInfoOpened(coord: Axial): void {
    const currentStep = this.tutorialController?.currentStep;
    const currentCoord = this.getCurrentPlayerCoord();
    if (!currentStep || !currentCoord) {
      return;
    }
    if (
      currentStep === "inspect_current_cell" &&
      coord.q === currentCoord.q &&
      coord.r === currentCoord.r
    ) {
      this.recordTutorialPresentation("inspect_current_cell");
    } else if (
      currentStep === "inspect_nearby_cell" &&
      axialDistance(currentCoord, coord) === 1
    ) {
      this.recordTutorialPresentation("inspect_nearby_cell");
    }
  }

  private handleTutorialTurn(
    match: MatchRecord,
    events: ReplayEvent[]
  ): void {
    if (!this.tutorialController || !this.currentUserId) {
      return;
    }
    const userId = this.currentUserId;
    const player = match.playerCharacters?.[userId];
    const bot = match.playerCharacters?.[TUTORIAL_BOT_ID];
    if (!player || !bot) {
      return;
    }

    if (
      events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === userId &&
          event.action.actionId === "search"
      )
    ) {
      this.recordTutorialGameplay("search");
    }
    if (
      events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === userId &&
          event.action.actionId === "pick_up" &&
          Number(event.action.metadata?.pickedCount) > 0
      )
    ) {
      this.recordTutorialGameplay("pickup_items");
    }
    if (
      events.some(
        (event) =>
          event.kind === "player" &&
          event.actorId === userId &&
          event.action.actionId === "buy_detective"
      )
    ) {
      this.recordTutorialGameplay("buy_detective");
    }

    const feedResolved = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === userId &&
        event.action.actionId === "feed"
    );
    const botMovedIntoPlayerCell = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === TUTORIAL_BOT_ID &&
        event.action.actionId === "move"
    );
    if (
      feedResolved &&
      botMovedIntoPlayerCell &&
      bot.position?.tileId === player.position?.tileId
    ) {
      this.recordTutorialGameplay("feed_bot");
    }

    const scareResolved = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === TUTORIAL_BOT_ID &&
        event.action.actionId === "scare" &&
        event.targets?.some((target) => target.targetId === userId)
    );
    const axeHitEvent = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === userId &&
        event.action.actionId === "axe_attack"
    );
    if (
      scareResolved &&
      !axeHitEvent &&
      player.position?.coord.q === TUTORIAL_CELL_COORDS.doomed.q &&
      player.position?.coord.r === TUTORIAL_CELL_COORDS.doomed.r
    ) {
      this.recordTutorialGameplay("resolve_bot_scare");
    }

    const playerMovedToBot = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === userId &&
        event.action.actionId === "move"
    );
    if (
      playerMovedToBot &&
      bot.position?.tileId === player.position?.tileId
    ) {
      this.recordTutorialGameplay("return_to_bot");
    }

    const finalScareResolved = events.some(
      (event) =>
        event.kind === "player" &&
        event.actorId === userId &&
        event.action.actionId === "scare" &&
        event.targets?.some(
          (target) =>
            target.targetId === TUTORIAL_BOT_ID &&
            target.metadata?.movedTo !== undefined &&
            typeof target.metadata.movedTo === "object" &&
            target.metadata.movedTo !== null &&
            "q" in target.metadata.movedTo &&
            "r" in target.metadata.movedTo &&
            target.metadata.movedTo.q === TUTORIAL_CELL_COORDS.doomed.q &&
            target.metadata.movedTo.r === TUTORIAL_CELL_COORDS.doomed.r
        )
    );
    if (finalScareResolved) {
      this.recordTutorialGameplay("scare_bot_to_doomed_cell");
    }

    const doomedCellDestroyed = events.some(
      (event) =>
        event.kind === "map" &&
        event.action === "destroyed" &&
        event.cell.q === TUTORIAL_CELL_COORDS.doomed.q &&
        event.cell.r === TUTORIAL_CELL_COORDS.doomed.r
    );
    if (doomedCellDestroyed) {
      this.observeTutorialMatchState(match);
    }
  }

  private async resolvePlayerNames(match: MatchRecord | null) {
    this.playerNameMap = {};
    this.currentPlayerName = null;
    this.playerSkinMap.clear();
    if (this.currentUserId && this.currentPlayerSkin) {
      this.playerSkinMap.set(this.currentUserId, this.currentPlayerSkin);
    }
    if (!match || !this.turnService) {
      return;
    }
    const ids = new Set<string>();
    if (Array.isArray(match.players)) {
      for (const id of match.players) {
        if (typeof id === "string" && id.trim().length > 0) {
          ids.add(id);
        }
      }
    }
    if (match.playerCharacters) {
      for (const id of Object.keys(match.playerCharacters)) {
        if (typeof id === "string" && id.trim().length > 0) {
          ids.add(id);
        }
      }
    }
    if (this.currentUserId) {
      ids.add(this.currentUserId);
    }
    if (ids.size === 0) {
      return;
    }
    const list = Array.from(ids);
    try {
      const map = await this.turnService.resolveUsernames(list);
      this.playerNameMap = map;
    } catch (error) {
      console.warn("resolvePlayerNames failed", error);
      const fallback: Record<string, string> = {};
      for (const id of list) {
        fallback[id] = id;
      }
      this.playerNameMap = fallback;
    }
    if (this.currentUserId) {
      this.currentPlayerName = this.playerNameMap[this.currentUserId] ?? null;
    }
    await this.resolvePlayerAccounts(match);
    this.syncChatMessagesToPanel();
  }

  private async resolvePlayerAccounts(match: MatchRecord | null) {
    if (!match || !this.accountService || !this.characterPanel) return;
    const ids = new Set<string>();
    if (Array.isArray(match.players)) {
      for (const id of match.players) {
        if (typeof id === "string" && id.trim().length > 0) ids.add(id);
      }
    }
    if (match.playerCharacters) {
      for (const id of Object.keys(match.playerCharacters)) {
        if (typeof id === "string" && id.trim().length > 0) ids.add(id);
      }
    }
    if (this.currentUserId) {
      ids.add(this.currentUserId);
    }
    if (ids.size === 0) return;
    const accounts = await this.accountService.getAccounts(Array.from(ids));
    const panel = this.characterPanel;
    let hasNameChange = false;
    for (const [userId, account] of accounts) {
      panel.setPlayerAccount(userId, account);
      const accountSkin = account?.cosmetics?.selectedSkinId;
      if (accountSkin) {
        this.playerSkinMap.set(userId, accountSkin);
      }
      if (account?.displayName && account.displayName.trim().length > 0) {
        const trimmed = account.displayName.trim();
        if (this.playerNameMap[userId] !== trimmed) {
          this.playerNameMap[userId] = trimmed;
          hasNameChange = true;
        }
      }
    }
    if (this.currentUserId) {
      this.currentPlayerName = this.playerNameMap[this.currentUserId] ?? null;
    }
    if (hasNameChange) {
      this.renderPlayerCharacters(match);
      this.characterPanel.updateFromMatch(
        match,
        this.currentUserId,
        Object.keys(this.playerNameMap).length > 0
          ? this.playerNameMap
          : undefined
      );
      this.syncChatMessagesToPanel();
    }
  }

  private async initMatchChat(matchId: string | null) {
    const panel = this.characterPanel;
    if (!panel) {
      return;
    }
    if (this.chatUnsubscribe) {
      this.chatUnsubscribe();
      this.chatUnsubscribe = null;
    }
    this.chatMessages = [];
    panel.setChatMessages([]);
    if (!matchId || !this.turnService) {
      panel.setChatConnectionState("idle", "Chat unavailable");
      panel.setChatInputEnabled(false);
      if (this.chatService) {
        await this.chatService.disconnect();
        this.chatService = null;
      }
      return;
    }
    if (!this.chatService) {
      this.chatService = new MatchChatService(this.turnService);
    }
    panel.setChatConnectionState("connecting", "Connecting...");
    panel.setChatInputEnabled(false);
    try {
      const history = await this.chatService.connect(matchId);
      this.chatMessages = Array.isArray(history) ? history : [];
      this.syncChatMessagesToPanel();
      this.observeTutorialChatHistory(this.chatMessages);
      panel.setChatConnectionState("ready", "Connected");
      panel.setChatInputEnabled(true);
      this.chatUnsubscribe = this.chatService.onMessage((payload) => {
        this.handleIncomingChatMessage(payload);
      });
    } catch (error) {
      console.warn("initMatchChat failed", error);
      panel.setChatConnectionState("error", "Chat unavailable");
      panel.setChatInputEnabled(false);
    }
  }

  private handleIncomingChatMessage(message: MatchChatMessage) {
    if (
      message.senderId === TUTORIAL_BOT_ID &&
      this.chatMessages.some((entry) => entry.messageId === message.messageId)
    ) {
      return;
    }
    this.chatMessages = [...this.chatMessages, message].slice(-100);
    if (this.characterPanel) {
      this.characterPanel.appendChatMessage(this.toChatViewModel(message));
      this.characterPanel.markChatUnread(true);
    }
    if (
      message.senderId === TUTORIAL_BOT_ID &&
      message.content === TUTORIAL_BOT_MESSAGES.bot_claim
    ) {
      this.recordTutorialGameplay("bot_chat");
    }
    if (!this.characterPanel) {
      return;
    }
    if (
      message.senderId &&
      message.senderId !== TUTORIAL_BOT_ID &&
      !this.playerNameMap[message.senderId] &&
      this.turnService
    ) {
      this.resolveSinglePlayerName(message.senderId);
    }
  }

  private observeTutorialChatHistory(messages: MatchChatMessage[]): void {
    if (messages.some((message) => message.senderId === TUTORIAL_BOT_ID)) {
      if (!this.chatTabActive) {
        this.characterPanel?.markChatUnread(true);
      }
    }
    if (
      messages.some(
        (message) =>
          message.senderId === TUTORIAL_BOT_ID &&
          message.content === TUTORIAL_BOT_MESSAGES.bot_claim
      )
    ) {
      this.recordTutorialGameplay("bot_chat");
    }
    if (
      messages.some(
        (message) =>
          message.senderId === TUTORIAL_BOT_ID &&
          message.content === TUTORIAL_BOT_MESSAGES.axe_ordering
      )
    ) {
      this.recordTutorialGameplay("plan_axe_attack");
    }
  }

  private async resolveSinglePlayerName(userId: string) {
    if (!userId || !this.turnService) return;
    try {
      const map = await this.turnService.resolveUsernames([userId]);
      if (map[userId]) {
        this.playerNameMap[userId] = map[userId];
      }
      if (this.accountService) {
        const accounts = await this.accountService.getAccounts([userId]);
        const account = accounts.get(userId);
        if (account?.displayName && account.displayName.trim().length > 0) {
          this.playerNameMap[userId] = account.displayName.trim();
        }
      }
      this.syncChatMessagesToPanel();
    } catch (e) {
      console.warn("resolveSinglePlayerName failed", e);
    }
  }

  private syncChatMessagesToPanel() {
    if (!this.characterPanel) {
      return;
    }
    const list = this.chatMessages.map((entry) => this.toChatViewModel(entry));
    this.characterPanel.setChatMessages(list);
  }

  private toChatViewModel(message: MatchChatMessage): ChatMessageViewModel {
    if (
      message.senderId &&
      message.displayName &&
      !this.playerNameMap[message.senderId]
    ) {
      this.playerNameMap[message.senderId] = message.displayName.trim();
    }
    const resolvedName =
      (message.senderId && this.playerNameMap[message.senderId]) ||
      (message.displayName && message.displayName.trim().length > 0
        ? message.displayName.trim()
        : undefined) ||
      message.username ||
      message.senderId ||
      "Unknown";
    return {
      id:
        message.messageId?.trim().length > 0
          ? message.messageId
          : `${message.createdAt}:${message.senderId}`,
      senderLabel: message.system ? "System" : resolvedName,
      content:
        message.senderId === TUTORIAL_BOT_ID
          ? t(message.content)
          : message.content,
      timestamp: message.createdAt,
      isSelf: !!this.currentUserId && message.senderId === this.currentUserId,
      isSystem: message.system === true
    };
  }

  private async handleChatSend(message: string) {
    if (!this.chatService) {
      return;
    }
    this.characterPanel?.setChatSendCooldown(750);
    try {
      const displayName =
        this.currentPlayerName ??
        (this.currentUserId
          ? this.playerNameMap[this.currentUserId]
          : undefined);
      await this.chatService.send(message, displayName ?? undefined);
    } catch (error) {
      console.warn("chat send failed", error);
      this.characterPanel?.setChatConnectionState("error", "Send failed");
      setTimeout(() => {
        this.characterPanel?.setChatConnectionState("ready", "Connected");
      }, 2000);
    }
  }

  private async handleChatTabOpened() {
    this.chatTabActive = true;
    this.recordTutorialPresentation("open_chat");
    if (this.chatService) {
      await this.refreshChatHistory();
      return;
    }
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (matchId) {
      await this.initMatchChat(matchId);
    }
  }

  private async refreshChatHistory() {
    if (!this.chatService || this.chatHistoryRefreshRunning) {
      return;
    }
    this.chatHistoryRefreshRunning = true;
    try {
      const history = await this.chatService.refreshHistory();
      this.chatMessages = Array.isArray(history) ? history : [];
      this.syncChatMessagesToPanel();
      this.observeTutorialChatHistory(this.chatMessages);
    } catch (error) {
      console.warn("chat history refresh failed", error);
    } finally {
      this.chatHistoryRefreshRunning = false;
    }
  }

  private scheduleMainActionSelection = (
    selection: MainActionSelection | null | undefined,
  ): void => {
    this.actionPlanSynchronizer?.scheduleMainActionSelection(selection);
  };

  private scheduleSecondaryActionSelection = (
    selection: SecondaryActionSelection | null | undefined,
  ): void => {
    this.actionPlanSynchronizer?.scheduleSecondaryActionSelection(selection);
  };

  private scheduleExtraSecondaryActionSelection = (
    selection: SecondaryActionSelection | null | undefined,
  ): void => {
    this.actionPlanSynchronizer?.scheduleExtraSecondaryActionSelection(
      selection,
    );
  };

  private async handleReadyStateChange(ready: boolean) {
    if (this.replayView) {
      return;
    }
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!this.turnService || !this.currentUserId || !matchId) {
      return;
    }
    if (this.readyUpdateRunning) {
      this.pendingReadyState = ready;
      return;
    }
    this.readyUpdateRunning = true;
    this.pendingReadyState = undefined;
    const previous =
      this.currentMatch?.readyStates?.[this.currentUserId] ?? false;
    const previousTurn = this.currentMatch?.current_turn;
    try {
      const res = await this.turnService.updateReadyState(
        matchId,
        ready,
        this.adminViewEnabled
      );
      const payload = this.parseRpcPayload<UpdateReadyStatePayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const turnAdvanced =
        payload.advanced === true ||
        (typeof payload.turn === "number" && payload.turn !== previousTurn);
      const nextStates = payload.readyStates ?? null;
      if (this.currentMatch) {
        if (nextStates) {
          this.currentMatch.readyStates = nextStates;
        } else {
          this.currentMatch.readyStates = this.currentMatch.readyStates ?? {};
          if (typeof payload.ready === "boolean") {
            this.currentMatch.readyStates[this.currentUserId] = payload.ready;
          }
        }
        if (typeof payload.turn === "number") {
          this.currentMatch.current_turn = payload.turn;
        }
        if (typeof payload.lastAutoAdvanceAt === "number") {
          this.currentMatch.lastAutoAdvanceAt = payload.lastAutoAdvanceAt;
          this.autoAdvanceLastAt = payload.lastAutoAdvanceAt;
        }
        if (payload.playerCharacters) {
          this.currentMatch.playerCharacters = payload.playerCharacters;
          if (!turnAdvanced && !this.replayView) {
            this.renderPlayerCharacters(this.currentMatch);
          }
        }
        if (Array.isArray(payload.items)) {
          this.currentMatch.items = payload.items;
        }
        if (Array.isArray(payload.traps)) {
          this.currentMatch.traps = payload.traps;
          if (!this.replayView) {
            this.renderTraps(payload.traps);
          }
        }
        if (!this.replayView && payload.map) {
          this.currentMatch.map = payload.map;
          this.renderItems(payload.map);
        } else if (!this.replayView && this.currentMatch.map) {
          this.renderItems(this.currentMatch.map);
        } else if (payload.map) {
          this.currentMatch.map = payload.map;
        }
      }
      const appliedReady =
        (nextStates && this.currentUserId
          ? nextStates[this.currentUserId]
          : undefined) ??
        payload.ready ??
        ready;
      this.characterPanel?.setReadyState(appliedReady, false);
      if (this.currentMatch) {
        if (turnAdvanced) {
          // An advanced turn changes character state. Reapply the complete
          // panel only in that case; a plain ready toggle must not rebuild
          // the skills view or reset its scroll position.
          this.updateCharacterPanel(this.currentMatch);
        } else {
          this.characterPanel?.updateReadyStates(
            this.currentMatch.readyStates
          );
        }
        this.refreshAutoAdvanceTimer();
      }
    } catch (error) {
      console.warn("update_ready_state failed", error);
      this.characterPanel?.setReadyState(previous, false);
      if (this.currentMatch) {
        this.currentMatch.readyStates = this.currentMatch.readyStates ?? {};
        this.currentMatch.readyStates[this.currentUserId] = previous;
      }
    } finally {
      this.readyUpdateRunning = false;
      if (this.pendingReadyState !== undefined) {
        const next = this.pendingReadyState;
        this.pendingReadyState = undefined;
        this.characterPanel?.setReadyState(next, false);
        void this.handleReadyStateChange(next);
      }
    }
  }

  private isUpgradingSkill = false;
  private isBuyingShopItem = false;
  private isUpdatingTestament = false;
  private pendingTestamentRecipient: string | null | undefined;

  private async handleShopPurchase(payload: {
    shopId: ShopId;
    targetPlayerId?: string;
    targetLocation?: Axial;
  }) {
    if (
      this.isBuyingShopItem ||
      !this.turnService ||
      !this.currentUserId ||
      (payload.shopId === "detective" && !payload.targetPlayerId) ||
      ((payload.shopId === "spy_drone" ||
        payload.shopId === "pyromaniac" ||
        payload.shopId === "bomber") &&
        !payload.targetLocation)
    ) {
      return;
    }
    const currentUserId = this.currentUserId;
    const matchId =
      (this.registry.get("currentMatchId") as string | null) ??
      this.currentMatch?.match_id;
    if (!matchId || !currentUserId) {
      return;
    }
    this.isBuyingShopItem = true;
    try {
      const response = await this.turnService.buyShopItem(
        matchId,
        payload.shopId,
        payload.targetPlayerId,
        payload.targetLocation
      );
      const result = this.parseRpcPayload<BuyShopItemPayload>(response);
      if (result.error) {
        throw new Error(result.error);
      }
      if (this.currentMatch && result.character) {
        if (result.playerCharacters) {
          this.currentMatch.playerCharacters = result.playerCharacters;
        } else {
          this.currentMatch.playerCharacters =
            this.currentMatch.playerCharacters ?? {};
          this.currentMatch.playerCharacters[currentUserId] = result.character;
        }
        if (result.target_player_id && result.target_team_id) {
          this.currentMatch.revealedTeamsByPlayerId = {
            ...(this.currentMatch.revealedTeamsByPlayerId ?? {}),
            [result.target_player_id]: result.target_team_id
          };
        }
        const map = this.currentMatch.map;
        if (result.fire && map && !this.replayView) {
          const tile = map.tiles.find(
            (candidate) =>
              candidate.coord.q === result.fire?.coord.q &&
              candidate.coord.r === result.fire?.coord.r
          );
          if (tile) {
            tile.meta = {
              ...(tile.meta ?? {}),
              fireStartTurn: result.fire.startTurn,
              fireEndTurn: result.fire.endTurn
            };
            this.renderFireTileAnimations(map);
          }
        }
        this.updateCharacterPanel(this.currentMatch);
        const turn = this.currentMatch.current_turn ?? 0;
        if (result.event) {
          const cached = this.logReplayCache.get(turn);
          const events = [...(cached?.events ?? []), result.event];
          this.logReplayCache.set(turn, {
            ...(cached ?? {}),
            events
          });
          this.characterPanel?.appendLogReplay(turn, turn, events);
          this.completeVisibleTutorialSteps();
          if (
            result.event.kind === "player" &&
            result.event.action.actionId === "buy_bomber"
          ) {
            this.enqueueReplay([result.event]);
          }
        }
      }
      this.characterPanel?.finishShopPurchase();
    } catch (error) {
      console.warn("buy_shop_item failed", error);
      if (payload.shopId === "detective") {
        this.characterPanel?.beginDetectivePurchase();
      } else if (payload.shopId === "spy_drone") {
        this.characterPanel?.beginSpyDronePurchase();
      } else if (payload.shopId === "pyromaniac") {
        this.characterPanel?.beginPyromaniacPurchase();
      } else if (payload.shopId === "bomber") {
        this.characterPanel?.beginBomberPurchase();
      }
    } finally {
      this.isBuyingShopItem = false;
    }
  }

  private async handleTestamentChange(recipientId: string | null) {
    this.pendingTestamentRecipient = recipientId;
    if (this.isUpdatingTestament) {
      return;
    }
    this.isUpdatingTestament = true;
    try {
      while (this.pendingTestamentRecipient !== undefined) {
        const nextRecipient = this.pendingTestamentRecipient;
        this.pendingTestamentRecipient = undefined;
        const matchId =
          (this.registry.get("currentMatchId") as string | null) ??
          this.currentMatch?.match_id;
        if (!this.turnService || !this.currentUserId || !matchId) {
          continue;
        }
        const res = await this.turnService.updateTestament(
          matchId,
          nextRecipient
        );
        const payload = this.parseRpcPayload<UpdateTestamentPayload>(res);
        if (payload.error) {
          throw new Error(payload.error);
        }
        if (payload.character && this.currentMatch) {
          this.currentMatch.playerCharacters =
            this.currentMatch.playerCharacters ?? {};
          this.currentMatch.playerCharacters[this.currentUserId] =
            payload.character;
          this.updateCharacterPanel(this.currentMatch);
        }
      }
    } catch (error) {
      console.warn("update_testament failed", error);
      if (this.currentMatch) {
        this.updateCharacterPanel(this.currentMatch);
      }
    } finally {
      this.isUpdatingTestament = false;
    }
  }

  private async handleApplySkills(skillIds: SkillId[]) {
    const matchId =
      (this.registry.get("currentMatchId") as string | null) ??
      this.currentMatch?.match_id;
    if (
      this.isUpgradingSkill ||
      !this.turnService ||
      !this.currentUserId ||
      !matchId ||
      skillIds.length === 0
    ) {
      return;
    }
    this.isUpgradingSkill = true;
    try {
      const res = await this.turnService.upgradeSkills(matchId, skillIds);
      const payload = this.parseRpcPayload<UpgradeSkillPayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (payload.character && this.currentMatch) {
        this.currentMatch.playerCharacters =
          this.currentMatch.playerCharacters ?? {};
        this.currentMatch.playerCharacters[this.currentUserId] =
          payload.character;
        this.updateCharacterPanel(this.currentMatch);
      }
    } catch (error) {
      console.warn("upgrade_skills failed", error);
    } finally {
      this.isUpgradingSkill = false;
    }
  }

  private handleReadyStateUpdate(payload: ReadyStateUpdateMessagePayload) {
    if (!payload || typeof payload.match_id !== "string") {
      return;
    }
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!matchId || payload.match_id !== matchId) {
      return;
    }
    const match = this.currentMatch;
    if (!match) {
      return;
    }
    match.readyStates = payload.readyStates;
    if (payload.deadCharacters) {
      match.deadCharacters = payload.deadCharacters;
    }
    if (Array.isArray(payload.traps)) {
      match.traps = payload.traps;
      if (match.map) {
        this.renderTraps(match.traps);
      }
    }
    // Ready-state broadcasts affect the readiness indicators only. Avoid a
    // full character-panel update because it rebuilds the skills state.
    this.characterPanel?.updateReadyStates(match.readyStates);
  }

  private handleTurnAdvancedUpdate(payload: TurnAdvancedMessagePayload) {
    if (!payload || typeof payload.match_id !== "string") {
      return;
    }
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!matchId || payload.match_id !== matchId) {
      return;
    }
    const match = this.currentMatch;
    if (!match) {
      return;
    }
    if (typeof payload.turn === "number") {
      match.current_turn = payload.turn;
    }
    if (payload.readyStates) {
      match.readyStates = payload.readyStates;
    }
    if (typeof payload.lastAutoAdvanceAt === "number") {
      match.lastAutoAdvanceAt = payload.lastAutoAdvanceAt;
      this.autoAdvanceLastAt = payload.lastAutoAdvanceAt;
    }
    if (payload.deadCharacters) {
      match.deadCharacters = payload.deadCharacters;
    }
    if (payload.playerCharacters) {
      match.playerCharacters = payload.playerCharacters;
    }
    if (Array.isArray(payload.items)) {
      match.items = payload.items;
    }
    if (Array.isArray(payload.traps)) {
      match.traps = payload.traps;
    }
    if (payload.map) {
      match.map = payload.map;
      if (!this.replayView) {
        this.renderMap(payload.map);
      }
    } else if (match.map && !this.replayView) {
      this.renderMap(match.map);
    }

    const eventsFromField = Array.isArray(payload.replay)
      ? (payload.replay as ReplayEvent[])
      : [];
    const alternateEvents = Array.isArray(
      (payload as { events?: unknown }).events
    )
      ? ((payload as { events?: ReplayEvent[] }).events ?? [])
      : [];
    const replayEvents =
      eventsFromField.length > 0 ? eventsFromField : alternateEvents;
    this.handleTutorialTurn(match, replayEvents);
    const turnNumber =
      typeof payload.turn === "number"
        ? payload.turn
        : (match.current_turn ?? 0);
    this.topBanner?.show({ text: `Turn ${turnNumber}` });
    if (replayEvents.length > 0) {
      this.logReplayCache.set(turnNumber, { events: replayEvents });
      this.enqueueReplay(replayEvents);
    } else if (payload.playerCharacters) {
      if (!this.replayView) {
        this.renderPlayerCharacters(match);
      }
      this.logReplayCache.set(turnNumber, { events: [] });
    }

    this.updateCharacterPanel(match);
    this.configureAutoAdvanceTimer(match);
    if (this.characterPanel) {
      this.characterPanel.setLogTurnInfo(match.current_turn ?? 0);
    }
  }

  private enqueueReplay(events: ReplayEvent[]) {
    if (!Array.isArray(events) || events.length === 0) {
      if (this.currentMatch && !this.replayView) {
        this.renderPlayerCharacters(this.currentMatch);
      }
      return;
    }
    this.replayQueue.push(events);
    if (
      !this.replayView &&
      !this.replayPlaying &&
      !this.manualReplayPlaying
    ) {
      void this.flushReplayQueue();
    }
  }

  private async flushReplayQueue(): Promise<void> {
    this.replayPlaying = true;
    while (this.replayQueue.length > 0) {
      const events = this.replayQueue.shift();
      if (!events || events.length === 0) {
        continue;
      }
      await playReplayEvents(this.createMoveReplayContext(), events);
      if (this.currentMatch && !this.replayView) {
        this.renderPlayerCharacters(this.currentMatch);
      }
    }
    this.replayPlaying = false;
    if (this.pendingMatchEndPayload) {
      const payload = this.pendingMatchEndPayload;
      this.pendingMatchEndPayload = null;
      this.triggerVictoryOverlay(payload);
    }
  }

  private createMoveReplayContext(): MoveReplayContext {
    return {
      tweens: this.tweens,
      axialToWorld: (coord) => this.boardRenderer!.axialToWorld(coord),
      getSprite: (playerId) =>
        this.boardRenderer?.getPlayerSprite(playerId),
      getLabel: (playerId) =>
        this.boardRenderer?.getPlayerLabel(playerId),
      positionLabel: (label, sprite) =>
        this.boardRenderer?.positionLabel(label, sprite),
      showDizzyStars: (playerId) => {
        const sprite = this.boardRenderer?.getPlayerSprite(playerId);
        if (sprite) {
          this.boardRenderer?.ensureDizzyStars(playerId, sprite);
        }
      },
      currentMatch: this.replayView?.match ?? this.currentMatch,
      scene: this,
      showTileDestroyedBanner: (cell) => this.showTileDestroyedBanner(cell),
      waitForPlaybackResume: () => this.waitForReplayResume(),
      shouldStopPlayback: () => this.replayPlaybackCancelled,
      ignoreUI: (object) => {
        if (this.uiCam) {
          this.uiCam.ignore(object);
        }
      }
    };
  }

  private getLocationPickSelection(
    target: LocationSelectionTarget
  ): MainActionSelection | SecondaryActionSelection | null {
    if (!this.characterPanel) {
      return null;
    }
    if (target === "primary" || target === "second") {
      return this.characterPanel.getMainActionSelection();
    }
    if (target === "secondary") {
      return this.characterPanel.getSecondaryActionSelection();
    }
    return this.characterPanel.getExtraSecondaryActionSelection();
  }

  private beginMainActionLocationPick() {
    this.beginLocationPick("primary");
  }

  private beginSecondMainActionLocationPick() {
    this.beginLocationPick("second");
  }

  private beginSecondaryActionLocationPick() {
    this.beginLocationPick("secondary");
  }

  private beginExtraSecondaryActionLocationPick() {
    this.beginLocationPick("extraSecondary");
  }

  private beginLocationPick(target: LocationSelectionTarget): void {
    if (this.replayView || this.locationSelectionActive) {
      return;
    }
    const selection = this.getLocationPickSelection(target);
    if (
      !selection?.actionId ||
      (target === "second" &&
        (selection.actionId !== "shoot_pistol" ||
          (selection.extraExecutions ?? 0) <= 0))
    ) {
      return;
    }
    this.locationSelectionActive = true;
    this.locationSelectionTarget = target;
    this.locationSelectionActionId = selection.actionId as ActionId;
    this.locationSelectionHoveredTileId = null;
    this.locationSelectionPointerId = null;
    this.setLocationSelectionPendingForTarget(target, true);
    if (this.mobileLayout) {
      this.mobileViewMode = "map";
      this.layoutUI();
    }
    this.refreshLocationSelectionVisuals();
    this.input.setDefaultCursor("crosshair");
  }

  private setLocationSelectionPendingForTarget(
    target: LocationSelectionTarget,
    pending: boolean
  ): void {
    if (target === "primary") {
      this.characterPanel?.setLocationSelectionPending(pending);
    } else if (target === "second") {
      this.characterPanel?.setSecondLocationSelectionPending(pending);
    } else if (target === "secondary") {
      this.characterPanel?.setSecondaryLocationSelectionPending(pending);
    } else {
      this.characterPanel?.setExtraSecondaryLocationSelectionPending(pending);
    }
  }

  private cancelMainActionLocationPick() {
    if (this.locationSelectionActive) {
      this.locationSelectionActive = false;
      this.locationSelectionActionId = null;
      this.locationSelectionHoveredTileId = null;
      this.refreshLocationSelectionVisuals();
      this.input.setDefaultCursor("default");
    }
    this.locationSelectionPointerId = null;
    this.locationSelectionTarget = "primary";
    this.characterPanel?.setLocationSelectionPending(false);
    this.characterPanel?.setSecondLocationSelectionPending(false);
    this.characterPanel?.setSecondaryLocationSelectionPending(false);
    this.characterPanel?.setExtraSecondaryLocationSelectionPending(false);
  }

  private completeMainActionLocationPick(tile: HexTile) {
    if (this.replayView) {
      this.cancelMainActionLocationPick();
      return;
    }
    const locationTarget = this.locationSelectionTarget;
    const selection = this.getLocationPickSelection(locationTarget);
    if (!selection?.actionId) {
      this.cancelMainActionLocationPick();
      this.showMobileSidebar();
      return;
    }
    const coord = normalizeAxial(tile.coord);
    if (!coord) {
      this.locationSelectionPointerId = null;
      this.cancelMainActionLocationPick();
      this.showMobileSidebar();
      return;
    }
    const actionId = selection.actionId as ActionId;
    const inRange = this.isLocationInRange(
      actionId,
      coord,
      selection.extraExecutions
    );
    this.locationSelectionPointerId = null;
    this.cancelMainActionLocationPick();
    this.showMobileSidebar();
    if (!inRange) {
      return;
    }
    if (locationTarget === "second") {
      this.characterPanel?.setMainActionSecondTarget(coord, true);
    } else if (locationTarget === "secondary") {
      this.characterPanel?.setSecondaryActionTarget(coord, true);
    } else if (locationTarget === "extraSecondary") {
      this.characterPanel?.setExtraSecondaryActionTarget(coord, true);
    } else {
      this.characterPanel?.setMainActionTarget(coord, true);
    }
  }

  private isPointerOverUI(pointer: Phaser.Input.Pointer) {
    if (
      this.tutorialInstructionView?.containsPoint(pointer.x, pointer.y) ||
      this.cellContentsPanel?.isOpen
    ) {
      return true;
    }
    if (this.viewModeButton?.visible) {
      const bounds = this.viewModeButton.getBounds();
      if (bounds.contains(pointer.x, pointer.y)) {
        return true;
      }
    }
    if (this.menuButton?.visible) {
      const bounds = this.menuButton.getBounds();
      if (bounds.contains(pointer.x, pointer.y)) {
        return true;
      }
    }
    if (!this.characterPanel || !this.uiCam || !this.characterPanel.visible) {
      return false;
    }
    const panelX = this.characterPanel.x;
    const panelY = this.characterPanel.y;
    const width = this.characterPanel.getPanelWidth();
    const height = this.uiCam.height;
    return (
      pointer.x >= panelX &&
      pointer.x <= panelX + width &&
      pointer.y >= panelY &&
      pointer.y <= panelY + height
    );
  }

  private handleTabChange(key: string) {
    this.chatTabActive = key === "chat";
    this.logTabActive = key === "log";
    this.completeVisibleTutorialSteps();
  }

  private openPlayerCard(playerId: string): void {
    if (!this.characterPanel) {
      return;
    }
    this.characterPanel.openPlayerCard(playerId);
  }

  private getCurrentPlayerCoord(): Axial | null {
    return this.boardRenderer?.getCurrentPlayerCoord() ?? null;
  }

  showTileDestroyedBanner(cell: Axial): void {
    const bannerPayload: TopBannerPayload = {
      text: `Tile destroyed at (${cell.q}, ${cell.r})`,
      texture: "board_icon_skull"
    };
    this.topBanner?.show(bannerPayload);
    const displayedMap = this.replayView?.match.map ?? this.currentMatch?.map;
    if (displayedMap) {
      const tile = displayedMap.tiles.find(
        (t) => t.coord.q === cell.q && t.coord.r === cell.r
      );
      if (tile) {
        tile.meta = tile.meta ?? {};
        tile.meta.destroyed = true;
        tile.walkable = false;
      }
    }
    this.refreshTileVisuals();
  }

  private refreshTileVisuals(): void {
    this.boardRenderer?.refreshTileVisuals();
  }

  private isLocationInRange(
    actionId: ActionId,
    target: Axial,
    extraExecutions = 0
  ): boolean {
    const targetTile = this.currentMatch?.map?.tiles.find(
      (t) => t.coord.q === target.q && t.coord.r === target.r
    );
    const currentTurn = this.currentMatch?.current_turn ?? 0;
    const destructionTurn =
      typeof targetTile?.meta?.destructionTurn === "number"
        ? targetTile.meta.destructionTurn
        : undefined;
    const isDestroyed =
      targetTile?.meta?.destroyed === true ||
      (typeof destructionTurn === "number" && currentTurn >= destructionTurn);
    if (isDestroyed) {
      return false;
    }

    const definition = ActionLibrary[actionId];
    let allowed =
      definition?.range && definition.range.length > 0
        ? [...definition.range]
        : [0];
    if (actionId === "use_binoculars") {
      allowed = allowed.filter((distance) => distance <= 1);
      if (extraExecutions > 0) {
        allowed.push(2);
      }
    } else if (
      definition?.extraExecution &&
      definition.extraExecution.effectType ===
        ExtraExecutionEffect.IncreaseRange &&
      extraExecutions > 0
    ) {
      const maxRange = Math.max(...allowed) + extraExecutions;
      const minRange = Math.min(...allowed);
      const newAllowed: number[] = [];
      for (let r = minRange; r <= maxRange; r++) {
        newAllowed.push(r);
      }
      allowed = newAllowed;
    }
    const origin = this.getCurrentPlayerCoord();
    if (!origin) {
      return false;
    }
    const distance = axialDistance(origin, target);
    if (allowed.indexOf(distance) === -1) {
      return false;
    }
    if (actionId === "create_fire") {
      const character = this.currentUserId
        ? this.currentMatch?.playerCharacters?.[this.currentUserId]
        : null;
      const fuelQuantity = (character?.inventory?.carriedItems ?? []).reduce(
        (total, stack) =>
          stack.itemId === "fuel" &&
          typeof stack.quantity === "number" &&
          Number.isFinite(stack.quantity)
            ? total + Math.max(0, Math.floor(stack.quantity))
            : total,
        0
      );
      const requiredFuel = distance === 0 ? 2 : 5;
      if (fuelQuantity < requiredFuel) {
        return false;
      }
    }
    return true;
  }

  private setLocationSelectionHoveredTile(tileId: string | null) {
    if (this.locationSelectionHoveredTileId === tileId) {
      return;
    }
    this.locationSelectionHoveredTileId = tileId;
    this.refreshLocationSelectionVisuals();
  }

  private refreshLocationSelectionVisuals(): void {
    this.boardRenderer?.refreshLocationSelectionVisuals();
  }

  private refreshAllTileTints(): void {
    this.boardRenderer?.refreshAllTileTints();
  }

  private enterReplayMode(): void {
    this.replayModeActive = true;
    this.replayPlaybackCancelled = false;
    this.replayPaused = false;
    if (this.mobileLayout) {
      this.mobileViewMode = "map";
    }
    this.layoutUI();
    this.updateReplayControls();
  }

  private navigateReplayTurn(delta: number): void {
    if (!this.replayView || this.manualReplayPlaying || this.logFetchRunning) {
      return;
    }
    const maxTurn = this.currentMatch?.current_turn ?? this.replayView.turn;
    const targetTurn = Phaser.Math.Clamp(
      this.replayView.turn + delta,
      0,
      maxTurn
    );
    if (targetTurn === this.replayView.turn) {
      return;
    }
    this.handleLogTurnRequest(targetTurn);
  }

  private toggleReplayPlayback(): void {
    if (!this.replayView || this.logFetchRunning) {
      return;
    }
    if (this.manualReplayPlaying) {
      this.replayPaused = !this.replayPaused;
      if (!this.replayPaused) {
        this.resolveReplayResumeWaiters();
      }
      this.updateReplayControls();
      return;
    }
    void this.handleLogPlayRequestManual(this.replayView.turn);
  }

  private waitForReplayResume(): Promise<void> {
    if (!this.replayPaused || this.replayPlaybackCancelled) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.replayResumeWaiters.push(resolve);
    });
  }

  private resolveReplayResumeWaiters(): void {
    const waiters = this.replayResumeWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  private exitReplayMode(): void {
    this.replayModeActive = false;
    this.replayPlaybackCancelled = true;
    this.replayPaused = false;
    this.resolveReplayResumeWaiters();
    this.manualReplayPlaying = false;
    this.characterPanel?.setLogPlaybackState(false);
    this.clearReplaySnapshot();
    this.updateReplayControls();
    if (this.replayQueue.length > 0 && !this.replayPlaying) {
      void this.flushReplayQueue();
    }
  }

  private applyReplaySnapshot(
    turn: number,
    snapshot: ReplaySnapshot | undefined,
  ): void {
    if (!this.currentMatch) {
      return;
    }
    if (!snapshot) {
      if (!this.replayModeActive) {
        this.clearReplaySnapshot();
        return;
      }
      const fallbackMatch: MatchRecord = {
        ...this.currentMatch,
        current_turn: turn,
      };
      this.replayView = {
        turn,
        snapshot: {},
        match: fallbackMatch,
      };
      this.updateReplayControls();
      return;
    }
    const replayMatch: MatchRecord = {
      ...this.currentMatch,
      current_turn: turn,
      map: snapshot.map ?? this.currentMatch.map,
      items: snapshot.items ?? this.currentMatch.items,
      traps: snapshot.traps ?? this.currentMatch.traps,
      playerCharacters:
        snapshot.playerCharacters ?? this.currentMatch.playerCharacters,
      deadCharacters:
        snapshot.deadCharacters ?? this.currentMatch.deadCharacters,
    };
    this.replayView = { turn, snapshot, match: replayMatch };
    if (replayMatch.map) {
      this.renderMap(replayMatch.map);
    }
    this.renderPlayerCharacters(replayMatch);
  }

  private clearReplaySnapshot(): void {
    if (!this.replayView) {
      return;
    }
    this.replayView = null;
    this.updateReplayControls();
    if (this.currentMatch?.map) {
      this.renderMap(this.currentMatch.map);
      this.renderPlayerCharacters(this.currentMatch);
    }
  }

  private handleLogTabOpened() {
    this.logTabActive = true;
    this.completeVisibleTutorialSteps();
    const turns = this.currentMatch?.current_turn ?? 0;
    if (turns === 0) {
      this.characterPanel?.setLogTurnInfo(0);
    }
  }

  private handleLogTabClosed() {
    this.logTabActive = false;
    this.exitReplayMode();
  }

  private handleLogTurnRequest(turn: number) {
    const maxTurn = this.currentMatch?.current_turn ?? 0;
    if (!this.characterPanel) {
      return;
    }
    let targetTurn = turn;
    if (targetTurn < 0) {
      targetTurn = maxTurn;
    }
    const cached = this.logReplayCache.get(targetTurn);
    if (cached !== undefined) {
      this.characterPanel.setLogReplay(targetTurn, maxTurn, cached.events);
      this.applyReplaySnapshot(targetTurn, cached.snapshot);
      return;
    }
    void this.fetchReplayForTurn(targetTurn);
  }

  private async fetchReplayForTurn(turn: number) {
    const panel = this.characterPanel;
    const service = this.turnService;
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!panel || !service || !matchId) {
      panel?.setLogError("Replay not available.");
      return;
    }
    if (this.logFetchRunning) {
      this.logPendingTurn = turn;
      return;
    }
    this.logFetchRunning = true;
    this.logPendingTurn = null;
    panel.setLogLoading(true);
    this.updateReplayControls();
    try {
      const res = await service.getReplay(matchId, turn, this.adminViewEnabled);
      const payload = this.parseRpcPayload<GetReplayPayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const resolvedTurn = payload.turn ?? turn;
      const maxTurn =
        payload.max_turn ?? this.currentMatch?.current_turn ?? resolvedTurn;
      const events = Array.isArray(payload.events) ? payload.events : [];
      const replay: CachedReplay = {
        events,
        snapshot: payload.snapshot,
      };
      this.logReplayCache.set(resolvedTurn, replay);
      panel.setLogReplay(resolvedTurn, maxTurn, events);
      this.completeVisibleTutorialSteps();
      this.applyReplaySnapshot(resolvedTurn, payload.snapshot);
    } catch (error) {
      console.warn("get_replay failed", error);
      panel.setLogError("Replay not available.");
    } finally {
      this.logFetchRunning = false;
      panel.setLogLoading(false);
      this.updateReplayControls();
      if (this.logPendingTurn !== null) {
        const next = this.logPendingTurn;
        this.logPendingTurn = null;
        this.handleLogTurnRequest(next);
      }
    }
  }

  private async handleLogPlayRequestManual(turn: number) {
    if (!this.logTabActive) {
      return;
    }
    if (this.replayPlaying) {
      return;
    }
    const replay = this.logReplayCache.get(turn);
    if (!replay || replay.events.length === 0) {
      return;
    }
    this.replayPlaybackCancelled = false;
    this.enterReplayMode();
    this.applyReplaySnapshot(turn, replay.snapshot);
    this.manualReplayPlaying = true;
    this.replayPaused = false;
    this.characterPanel?.setLogPlaybackState(true);
    this.updateReplayControls();
    try {
      await playReplayEvents(this.createMoveReplayContext(), replay.events);
    } catch (error) {
      console.warn("log replay failed", error);
    } finally {
      this.manualReplayPlaying = false;
      this.replayPaused = false;
      this.replayPlaybackCancelled = false;
      this.resolveReplayResumeWaiters();
      this.characterPanel?.setLogPlaybackState(false);
      this.updateReplayControls();
      if (this.replayView) {
        if (this.replayView.match.map) {
          this.renderMap(this.replayView.match.map);
        }
        this.renderPlayerCharacters(this.replayView.match);
      } else if (this.currentMatch) {
        this.renderPlayerCharacters(this.currentMatch);
      }
      if (this.replayQueue.length > 0 && !this.replayPlaying) {
        void this.flushReplayQueue();
      }
    }
  }
}
