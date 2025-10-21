import Phaser from "phaser";
import type { RpcResponse } from "@heroiclabs/nakama-js";
import { makeButton, type UIButton } from "../ui/button";
import { CharacterPanel, type MainActionSelection } from "../ui/CharacterPanel";
import type { TurnService } from "../services/turnService";
import {
  ActionLibrary,
  ActionCategory,
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  HexTile,
  type ActionId,
  type ActionSubmission,
  type Axial,
  type PlayerPlannedAction,
  type GameMap,
  generateGameMap,
  type GetStatePayload,
  type MatchRecord,
  type UpdateMainActionPayload,
  type UpdateReadyStatePayload,
  type TurnAdvancedMessagePayload,
  type ReplayEvent,
  type GetReplayPayload,
  getHexTileOffsets,
  ItemLibrary,
} from "@shared";
import { buildBoardIconUrl, deriveBoardIconKey } from "../ui/actionIcons";
import {
  playReplayEvents,
  type MoveReplayContext,
} from "../animation/moveReplay";
import { collectItemSpriteInfos } from "../ui/itemIcons";

export class GameScene extends Phaser.Scene {
  private static readonly TILE_WIDTH = 128;
  private static readonly TILE_HEIGHT = 118;

  private cam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private currentMatch: MatchRecord | null = null;
  private tilePositions: Record<string, { x: number; y: number }> = {};
  private playerSprites = new Map<string, Phaser.GameObjects.Image>();
  private playerNameLabels = new Map<string, Phaser.GameObjects.Text>();
  private playerNameMap: Record<string, string> = {};
  private characterPanel: CharacterPanel | null = null;
  private menuButton: UIButton | null = null;
  private currentUserId: string | null = null;
  private currentPlayerName: string | null = null;
  private turnService: TurnService | null = null;
  private pointerDownInUI = false;
  private mainActionUpdateRunning = false;
  private pendingMainActionSelection: MainActionSelection | undefined;
  private readyUpdateRunning = false;
  private pendingReadyState: boolean | undefined;
  private locationSelectionActive = false;
  private locationSelectionPointerId: number | null = null;
  private replayQueue: ReplayEvent[][] = [];
  private replayPlaying = false;
  private logReplayCache = new Map<number, ReplayEvent[]>();
  private logTabActive = false;
  private logFetchRunning = false;
  private logPendingTurn: number | null = null;
  private manualReplayPlaying = false;
  private readonly turnAdvancedHandler = (
    payload: TurnAdvancedMessagePayload
  ) => {
    this.handleTurnAdvancedUpdate(payload);
  };
  private readonly pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
    const overUI = this.isPointerOverUI(pointer);
    this.pointerDownInUI = overUI;
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
    this.pointerDownInUI = false;
  };

  constructor() {
    super("GameScene");
  }

  preload() {
    // Load the texture atlas (PNG + XML) from the public assets folder
    this.load.atlasXML(
      "hex",
      "/assets/spritesheets/hexagonAll_sheet.png",
      "/assets/spritesheets/hexagonAll_sheet.xml"
    );
    this.load.atlasXML(
      "char",
      "/assets/spritesheets/roguelikeChar_transparent.png",
      "/assets/spritesheets/roguelikeChar_transparent.xml"
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
  }

  async create() {
    this.cam = this.cameras.main;
    this.uiCam = this.cameras.add(0, 0, this.cam.width, this.cam.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);
    this.turnService = this.registry.get("turnService") as TurnService | null;
    this.currentUserId = this.registry.get("currentUserId") as string | null;
    if (this.turnService) {
      this.turnService.setOnTurnAdvanced(this.turnAdvancedHandler);
    }

    this.characterPanel = new CharacterPanel(this, 0, 0);
    this.cam.ignore(this.characterPanel);
    this.characterPanel.on(
      "main-action-change",
      this.handleMainActionSelection,
      this
    );
    this.characterPanel.on(
      "main-action-location-request",
      this.beginMainActionLocationPick,
      this
    );
    this.characterPanel.on("ready-change", this.handleReadyStateChange, this);
    this.characterPanel.on("tab-change", this.handleTabChange, this);
    this.characterPanel.on("log-tab-opened", this.handleLogTabOpened, this);
    this.characterPanel.on("log-tab-closed", this.handleLogTabClosed, this);
    this.characterPanel.on("log-turn-request", this.handleLogTurnRequest, this);
    this.characterPanel.on("log-play", this.handleLogPlayRequest, this);

    this.menuButton = makeButton(this, 0, 0, "☰", () => {
      this.scene.stop("GameScene");
      this.scene.wake("MainScene");
    }).setScrollFactor(0);
    this.cam.ignore(this.menuButton);

    const match = await this.fetchMatchFromServer();
    this.currentMatch = match;
    this.logReplayCache.clear();
    if (this.characterPanel) {
      this.characterPanel.setLogTurnInfo(match?.current_turn ?? 0);
    }

    const map = this.resolveMap(match);

    await this.resolvePlayerNames(match);
    this.renderMap(map);
    if (match) {
      this.renderPlayerCharacters(match);
    }
    this.updateCharacterPanel(match);

    this.enableDragPan();
    this.enableWheelZoom();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);

    this.layoutUI();
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler);
      this.characterPanel?.off(
        "main-action-change",
        this.handleMainActionSelection,
        this
      );
      this.characterPanel?.off(
        "main-action-location-request",
        this.beginMainActionLocationPick,
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
      this.characterPanel?.off("log-play", this.handleLogPlayRequest, this);
      this.cancelMainActionLocationPick();
      if (this.turnService) {
        this.turnService.setOnTurnAdvanced();
      }
    });
  }

  private async fetchMatchFromServer(): Promise<MatchRecord | null> {
    const service = this.turnService;
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!service || !matchId) {
      return null;
    }
    try {
      const res = await service.getState(matchId);
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
    return generateGameMap(cols, rows, CellLibrary, seed);
  }

  private renderMap(map: GameMap) {
    const tileW = GameScene.TILE_WIDTH;
    const tileH = GameScene.TILE_HEIGHT;
    const dx = tileW;
    const dy = tileH;
    const texture = this.textures.get("hex");
    const sprites: Phaser.GameObjects.Image[] = [];
    this.tilePositions = {};

    for (const snapshot of map.tiles) {
      let tile: HexTile;
      try {
        tile = HexTile.fromSnapshot(snapshot, CellLibrary);
      } catch (error) {
        console.warn("Invalid tile snapshot", error);
        continue;
      }
      const frame = tile.frame ?? tile.cellType.sprite;
      if (!texture.has(frame)) {
        continue;
      }
      const col = tile.coord.q;
      const row = tile.coord.r;
      const rowOffset = row % 2 !== 0 ? dx / 2 : 0; // Hexagons are offset every other row
      const x = col * dx + tileW + rowOffset;
      const y = row * dy + tileH;
      const img = this.add.image(x, y, "hex", frame);
      img.setData("tile", tile);
      img.setInteractive({ useHandCursor: false });
      img.on(
        Phaser.Input.Events.POINTER_UP,
        (pointer: Phaser.Input.Pointer) => {
          if (!this.locationSelectionActive) {
            return;
          }
          if (pointer.button !== 0) {
            return;
          }
          if (
            this.locationSelectionPointerId === null ||
            pointer.id !== this.locationSelectionPointerId
          ) {
            return;
          }
          const tileData = img.getData("tile") as HexTile | undefined;
          if (!tileData) {
            return;
          }
          this.completeMainActionLocationPick(tileData);
        }
      );
      sprites.push(img);
      this.tilePositions[tile.id] = { x, y };
    }

    this.uiCam.ignore(sprites);

    const gridWidth = map.cols * dx + tileW * 2 + dx / 2;
    const gridHeight = map.rows * dy + tileH * 2 + dy / 2;
    this.cam.setBounds(
      -gridWidth / 2,
      -gridHeight / 2,
      gridWidth * 2,
      gridHeight * 2
    );
    this.cam.centerOn(gridWidth / 2, gridHeight / 2);
    this.registry.set("currentMatchMap", map);
    1;
  }

  private getTileWorldPosition(
    tileId: string,
    coord: { q: number; r: number }
  ): { x: number; y: number } {
    const existing = this.tilePositions[tileId];
    if (existing) {
      return existing;
    }
    return this.axialToWorld(coord);
  }

  private axialToWorld(coord: { q: number; r: number }): {
    x: number;
    y: number;
  } {
    const tileW = GameScene.TILE_WIDTH;
    const tileH = GameScene.TILE_HEIGHT;
    const dx = tileW;
    const dy = tileH;
    const col = coord.q;
    const row = coord.r;
    const rowOffset = row % 2 !== 0 ? dx / 2 : 0;
    const x = col * dx + tileW + rowOffset;
    const y = row * dy + tileH;
    return { x, y };
  }

  private renderPlayerCharacters(match: MatchRecord) {
    if (!this.textures.exists("char")) {
      return;
    }

    const characters = match.playerCharacters ?? {};
    const tileGroups = new Map<
      string,
      { world: { x: number; y: number }; members: string[] }
    >();
    for (const [playerId, character] of Object.entries(characters)) {
      if (!character || !character.position) {
        continue;
      }
      const { tileId, coord } = character.position;
      const world = this.getTileWorldPosition(tileId, coord);
      const key = tileId ?? `${coord.q}:${coord.r}`;
      const group = tileGroups.get(key);
      if (group) {
        group.members.push(playerId);
      } else {
        tileGroups.set(key, { world, members: [playerId] });
      }
    }

    const seen = new Set<string>();
    for (const { world, members } of tileGroups.values()) {
      const sorted = [...members].sort();
      const offsets = getHexTileOffsets(
        sorted.length,
        GameScene.TILE_WIDTH / 4
      );
      for (let index = 0; index < sorted.length; index += 1) {
        const playerId = sorted[index];
        const offset = offsets[index] ?? { x: 0, y: 0 };
        const x = world.x + offset.x;
        const y = world.y + offset.y;
        let sprite = this.playerSprites.get(playerId);
        if (!sprite || !sprite.active || sprite.scene !== this) {
          sprite = this.add.image(x, y, "char", "body_human_tan_01.png");
          sprite.setScale(2);
          sprite.setData("playerId", playerId);
          this.uiCam.ignore(sprite);
          this.playerSprites.set(playerId, sprite);
        }
        sprite.setPosition(x, y);
        sprite.setVisible(true);
        sprite.setDepth(5 + y / 1000);

        const name = this.playerNameMap[playerId] ?? playerId;
        let label = this.playerNameLabels.get(playerId);
        if (!label || !label.active || label.scene !== this) {
          label = this.add.text(x, y, name, {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4,
          });
          label.setOrigin(0.5, 0.5);
          label.setDepth(6);
          this.uiCam.ignore(label);
          this.playerNameLabels.set(playerId, label);
        }
        label.setText(name);
        label.setPosition(x, y);
        label.setVisible(true);
        this.positionNameLabel(label, sprite);
        seen.add(playerId);
      }
    }

    for (const [playerId, sprite] of this.playerSprites) {
      if (!seen.has(playerId)) {
        sprite.destroy();
        this.playerSprites.delete(playerId);
      }
    }
    for (const [playerId, label] of this.playerNameLabels) {
      if (!seen.has(playerId)) {
        label.destroy();
        this.playerNameLabels.delete(playerId);
      }
    }
  }

  private positionNameLabel(
    label: Phaser.GameObjects.Text,
    sprite: Phaser.GameObjects.Image
  ) {
    const offset = sprite.displayHeight / 2 + 12;
    label.setPosition(sprite.x, sprite.y - offset);
  }

  private enableDragPan() {
    // let isDragging = false;
    const cam = this.cam;
    // const dragStart = new Phaser.Math.Vector2();
    // const camStart = new Phaser.Math.Vector2();

    // No-op handlers removed

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.pointerDownInUI) return;

      // const { x, y } = p.velocity; // camStart.x - dx
      const diffX = p.position.x - p.prevPosition.x;
      const diffY = p.position.y - p.prevPosition.y;

      cam.scrollX -= diffX / cam.zoom;
      cam.scrollY -= diffY / cam.zoom;
    });
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
        const worldPointBefore = cam.getWorldPoint(pointer.x, pointer.y);
        const zoomFactor = dy > 0 ? 0.9 : 1.1;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * zoomFactor, minZoom, maxZoom));
        const worldPointAfter = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += worldPointBefore.x - worldPointAfter.x;
        cam.scrollY += worldPointBefore.y - worldPointAfter.y;
      }
    );
  }

  private layoutUI() {
    const width = this.uiCam ? this.uiCam.width : this.scale.width;
    const height = this.uiCam ? this.uiCam.height : this.scale.height;
    if (this.characterPanel) {
      const panelWidth = this.characterPanel.getPanelWidth();
      this.characterPanel.setPosition(width - panelWidth, 0);
      this.characterPanel.setPanelSize(panelWidth, height);
    }
    if (this.menuButton) {
      this.menuButton.setPosition(
        width - this.menuButton.width - 10,
        height - this.menuButton.height - 10
      );
    }
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const width = gameSize.width ?? this.scale.width;
    const height = gameSize.height ?? this.scale.height;
    this.cam.setSize(width, height);
    this.uiCam.setSize(width, height);
    this.layoutUI();
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
    }
  }

  private async resolvePlayerNames(match: MatchRecord | null) {
    this.playerNameMap = {};
    this.currentPlayerName = null;
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
  }

  private async handleMainActionSelection(
    selection: MainActionSelection | null | undefined
  ) {
    this.cancelMainActionLocationPick();
    const matchId = this.registry.get("currentMatchId") as string | null;
    if (!this.turnService || !this.currentUserId || !matchId) {
      return;
    }
    const normalizedPlayers = this.normalizeTargetPlayers(
      selection?.targetPlayerIds ?? undefined
    );
    const normalizedSelection: MainActionSelection = {
      actionId: selection?.actionId ?? null,
      targetLocation: this.normalizeAxial(selection?.targetLocation),
      targetPlayerIds: normalizedPlayers,
    };
    const character =
      this.currentMatch?.playerCharacters?.[this.currentUserId] ?? null;
    const previousPlan = character?.actionPlan?.main ?? null;
    const previousActionId = previousPlan?.actionId ?? null;
    const previousTarget = this.normalizeAxial(previousPlan?.targetLocationId);
    const previousPlayers = this.normalizeTargetPlayers(
      previousPlan?.targetPlayerIds ?? undefined
    );
    if (
      normalizedSelection.actionId === previousActionId &&
      this.isSameAxial(normalizedSelection.targetLocation, previousTarget) &&
      this.isSameTargetPlayers(
        normalizedSelection.targetPlayerIds,
        previousPlayers
      )
    ) {
      return;
    }
    if (this.mainActionUpdateRunning) {
      this.pendingMainActionSelection = normalizedSelection;
      return;
    }
    this.mainActionUpdateRunning = true;
    this.pendingMainActionSelection = undefined;
    try {
      const submission = normalizedSelection.actionId
        ? this.buildMainActionSubmission(
            normalizedSelection.actionId,
            normalizedSelection.targetLocation,
            normalizedSelection.targetPlayerIds
          )
        : null;
      const res = await this.turnService.updateMainAction(matchId, submission);
      const payload = this.parseRpcPayload<UpdateMainActionPayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      if (!this.currentMatch) {
        return;
      }
      const target =
        this.currentMatch.playerCharacters?.[this.currentUserId] ?? null;
      if (!target) {
        return;
      }
      target.actionPlan = target.actionPlan ?? {};
      if (!submission) {
        if (target.actionPlan.main) {
          delete target.actionPlan.main;
        }
        if (
          target.actionPlan.secondary === undefined &&
          target.actionPlan.nextMain === undefined &&
          target.actionPlan.main === undefined
        ) {
          delete target.actionPlan;
        }
      } else {
        const nextPlan: PlayerPlannedAction = {
          ...(target.actionPlan.main ?? {}),
          actionId: submission.actionId,
        };
        if (payload.targetLocationId) {
          nextPlan.targetLocationId = payload.targetLocationId;
        } else if (nextPlan.targetLocationId) {
          delete nextPlan.targetLocationId;
        }
        if (payload.targetPlayerIds && payload.targetPlayerIds.length > 0) {
          nextPlan.targetPlayerIds = [...payload.targetPlayerIds];
        } else if (nextPlan.targetPlayerIds) {
          delete nextPlan.targetPlayerIds;
        }
        target.actionPlan.main = nextPlan;
      }
      this.updateCharacterPanel(this.currentMatch);
    } catch (error) {
      console.warn("update_main_action failed", error);
      this.updateCharacterPanel(this.currentMatch);
    } finally {
      this.mainActionUpdateRunning = false;
      if (this.pendingMainActionSelection) {
        const nextSelection = this.pendingMainActionSelection;
        this.pendingMainActionSelection = undefined;
        void this.handleMainActionSelection(nextSelection);
      }
    }
  }

  private async handleReadyStateChange(ready: boolean) {
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
    try {
      const res = await this.turnService.updateReadyState(matchId, ready);
      const payload = this.parseRpcPayload<UpdateReadyStatePayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
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
        if (payload.playerCharacters) {
          this.currentMatch.playerCharacters = payload.playerCharacters;
          this.renderPlayerCharacters(this.currentMatch);
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
        this.updateCharacterPanel(this.currentMatch);
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
    if (payload.playerCharacters) {
      match.playerCharacters = payload.playerCharacters;
    }

    const eventsFromField = Array.isArray(payload.replay)
      ? (payload.replay as ReplayEvent[])
      : [];
    const alternateEvents = Array.isArray(
      (payload as { events?: unknown }).events
    )
      ? (payload as { events?: ReplayEvent[] }).events ?? []
      : [];
    const replayEvents =
      eventsFromField.length > 0 ? eventsFromField : alternateEvents;
    const turnNumber =
      typeof payload.turn === "number" ? payload.turn : match.current_turn ?? 0;
    if (replayEvents.length > 0) {
      this.logReplayCache.set(turnNumber, replayEvents);
      this.enqueueReplay(replayEvents);
    } else if (payload.playerCharacters) {
      this.renderPlayerCharacters(match);
      this.logReplayCache.set(turnNumber, []);
    }

    this.updateCharacterPanel(match);
    if (this.characterPanel) {
      this.characterPanel.setLogTurnInfo(match.current_turn ?? 0);
    }
  }

  private enqueueReplay(events: ReplayEvent[]) {
    if (!Array.isArray(events) || events.length === 0) {
      if (this.currentMatch) {
        this.renderPlayerCharacters(this.currentMatch);
      }
      return;
    }
    this.replayQueue.push(events);
    if (!this.replayPlaying && !this.manualReplayPlaying) {
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
      if (this.currentMatch) {
        this.renderPlayerCharacters(this.currentMatch);
      }
    }
    this.replayPlaying = false;
  }

  private createMoveReplayContext(): MoveReplayContext {
    return {
      tweens: this.tweens,
      axialToWorld: (coord) => this.axialToWorld(coord),
      getSprite: (playerId) => this.playerSprites.get(playerId),
      getLabel: (playerId) => this.playerNameLabels.get(playerId),
      positionLabel: (label, sprite) => this.positionNameLabel(label, sprite),
      currentMatch: this.currentMatch,
      scene: this,
      ignoreUI: (object) => {
        if (this.uiCam) {
          this.uiCam.ignore(object);
        }
      },
    };
  }

  private beginMainActionLocationPick() {
    if (this.locationSelectionActive) {
      return;
    }
    const selection = this.characterPanel?.getMainActionSelection();
    if (!selection || !selection.actionId) {
      return;
    }
    this.locationSelectionActive = true;
    this.locationSelectionPointerId = null;
    this.characterPanel?.setLocationSelectionPending(true);
    this.input.setDefaultCursor("crosshair");
  }

  private cancelMainActionLocationPick() {
    if (this.locationSelectionActive) {
      this.locationSelectionActive = false;
      this.input.setDefaultCursor("default");
    }
    this.locationSelectionPointerId = null;
    this.characterPanel?.setLocationSelectionPending(false);
  }

  private completeMainActionLocationPick(tile: HexTile) {
    const selection = this.characterPanel?.getMainActionSelection();
    if (!selection || !selection.actionId) {
      this.cancelMainActionLocationPick();
      return;
    }
    const coord = this.normalizeAxial(tile.coord);
    this.locationSelectionPointerId = null;
    this.cancelMainActionLocationPick();
    if (!coord) {
      return;
    }
    this.characterPanel?.setMainActionTarget(coord, true);
  }

  private buildMainActionSubmission(
    actionId: string,
    target: Axial | null,
    targetPlayerIds: string[] | undefined
  ): ActionSubmission {
    const typedId = actionId as ActionId;
    const definition = ActionLibrary[typedId] ?? null;
    const category = definition?.category ?? ActionCategory.Primary;
    const submission: ActionSubmission = {
      playerId: this.currentUserId!,
      actionId: definition ? definition.id : typedId,
      category,
    };
    if (target) {
      submission.targetLocationId = { q: target.q, r: target.r };
    }
    if (targetPlayerIds !== undefined) {
      submission.targetPlayerIds =
        targetPlayerIds.length > 0 ? [...targetPlayerIds] : [];
    }
    return submission;
  }

  private normalizeAxial(value: Axial | null | undefined): Axial | null {
    if (!value) {
      return null;
    }
    const q = typeof value.q === "number" ? value.q : Number(value.q);
    const r = typeof value.r === "number" ? value.r : Number(value.r);
    if (Number.isNaN(q) || Number.isNaN(r)) {
      return null;
    }
    return { q, r };
  }

  private normalizeTargetPlayers(
    value: string[] | undefined | null
  ): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
    }
    return normalized;
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

  private isSameTargetPlayers(
    a: string[] | undefined | null,
    b: string[] | undefined | null
  ): boolean {
    const normalize = (input: string[] | undefined | null) => {
      if (!input || input.length === 0) {
        return [] as string[];
      }
      return input
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .sort();
    };
    const aNorm = normalize(a);
    const bNorm = normalize(b);
    if (aNorm.length !== bNorm.length) {
      return false;
    }
    for (let i = 0; i < aNorm.length; i += 1) {
      if (aNorm[i] !== bNorm[i]) {
        return false;
      }
    }
    return true;
  }

  private isPointerOverUI(pointer: Phaser.Input.Pointer) {
    if (!this.characterPanel || !this.uiCam) {
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
    this.logTabActive = key === "log";
  }

  private handleLogTabOpened() {
    this.logTabActive = true;
    const turns = this.currentMatch?.current_turn ?? 0;
    if (turns === 0) {
      this.characterPanel?.setLogTurnInfo(0);
    }
  }

  private handleLogTabClosed() {
    this.logTabActive = false;
    this.manualReplayPlaying = false;
    this.characterPanel?.setLogPlaybackState(false);
    if (this.currentMatch) {
      this.renderPlayerCharacters(this.currentMatch);
    }
    if (this.replayQueue.length > 0 && !this.replayPlaying) {
      void this.flushReplayQueue();
    }
  }

  private handleLogTurnRequest(turn: number) {
    const maxTurn = this.currentMatch?.current_turn ?? 0;
    if (!this.characterPanel) {
      return;
    }
    if (maxTurn === 0) {
      this.characterPanel.setLogTurnInfo(0);
      this.characterPanel.setLogError("No replays yet.");
      return;
    }
    let targetTurn = turn;
    if (targetTurn <= 0) {
      targetTurn = maxTurn;
    }
    const cached = this.logReplayCache.get(targetTurn);
    if (cached !== undefined) {
      this.characterPanel.setLogReplay(targetTurn, maxTurn, cached);
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
    try {
      const res = await service.getReplay(matchId, turn);
      const payload = this.parseRpcPayload<GetReplayPayload>(res);
      if (payload.error) {
        throw new Error(payload.error);
      }
      const resolvedTurn = payload.turn ?? turn;
      const maxTurn =
        payload.max_turn ?? this.currentMatch?.current_turn ?? resolvedTurn;
      const events = Array.isArray(payload.events) ? payload.events : [];
      this.logReplayCache.set(resolvedTurn, events);
      panel.setLogReplay(resolvedTurn, maxTurn, events);
    } catch (error) {
      console.warn("get_replay failed", error);
      panel.setLogError("Replay not available.");
    } finally {
      this.logFetchRunning = false;
      panel.setLogLoading(false);
      if (this.logPendingTurn !== null) {
        const next = this.logPendingTurn;
        this.logPendingTurn = null;
        this.handleLogTurnRequest(next);
      }
    }
  }

  private async handleLogPlayRequest(turn: number) {
    if (!this.logTabActive) {
      return;
    }
    if (this.replayPlaying || this.manualReplayPlaying) {
      return;
    }
    const events = this.logReplayCache.get(turn);
    if (!events || events.length === 0) {
      return;
    }
    this.manualReplayPlaying = true;
    this.characterPanel?.setLogPlaybackState(true);
    try {
      await playReplayEvents(this.createMoveReplayContext(), events);
    } catch (error) {
      console.warn("log replay failed", error);
    } finally {
      this.manualReplayPlaying = false;
      this.characterPanel?.setLogPlaybackState(false);
      if (this.currentMatch) {
        this.renderPlayerCharacters(this.currentMatch);
      }
      if (this.replayQueue.length > 0 && !this.replayPlaying) {
        void this.flushReplayQueue();
      }
    }
  }
}
