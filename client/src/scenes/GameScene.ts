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
} from "@shared";
import { buildBoardIconUrl, deriveBoardIconKey } from "../ui/actionIcons";

export class GameScene extends Phaser.Scene {
  private static readonly TILE_WIDTH = 128;
  private static readonly TILE_HEIGHT = 118;

  private cam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private currentMatch: MatchRecord | null = null;
  private tilePositions: Record<string, { x: number; y: number }> = {};
  private playerSprites: Phaser.GameObjects.Image[] = [];
  private characterPanel: CharacterPanel | null = null;
  private menuButton: UIButton | null = null;
  private currentUserId: string | null = null;
  private currentPlayerName: string | null = null;
  private turnService: TurnService | null = null;
  private pointerDownInUI = false;
  private mainActionUpdateRunning = false;
  private pendingMainActionSelection: MainActionSelection | undefined;
  private locationSelectionActive = false;
  private locationSelectionPointerId: number | null = null;
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

    this.menuButton = makeButton(this, 0, 0, "☰", () => {
      this.scene.stop("GameScene");
      this.scene.wake("MainScene");
    }).setScrollFactor(0);
    this.cam.ignore(this.menuButton);

    const match = await this.fetchMatchFromServer();
    this.currentMatch = match;

    const map = this.resolveMap(match);

    this.renderMap(map);
    if (match) {
      this.renderPlayerCharacters(match);
    }

    await this.resolveCurrentPlayerName(match);
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
      this.cancelMainActionLocationPick();
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
    this.cam.setBounds(0, 0, gridWidth, gridHeight);
    this.cam.centerOn(gridWidth / 2, gridHeight / 2);
    this.registry.set("currentMatchMap", map);
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
    if (!match.playerCharacters || !this.textures.exists("char")) {
      return;
    }

    for (const sprite of this.playerSprites) {
      sprite.destroy();
    }
    this.playerSprites = [];

    for (const playerId in match.playerCharacters) {
      if (
        !Object.prototype.hasOwnProperty.call(match.playerCharacters, playerId)
      ) {
        continue;
      }
      const character = match.playerCharacters[playerId];
      if (!character || !character.position) {
        continue;
      }
      const { tileId, coord } = character.position;
      const world = this.getTileWorldPosition(tileId, coord);
      const sprite = this.add.image(world.x, world.y, "char", "body_02.png");
      sprite.setDepth(5);
      sprite.setScale(4);
      sprite.setData("playerId", playerId);
      this.uiCam.ignore(sprite);
      this.playerSprites.push(sprite);
    }
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
      this.currentUserId && this.currentPlayerName
        ? { [this.currentUserId]: this.currentPlayerName }
        : undefined;
    this.characterPanel.updateFromMatch(match, this.currentUserId, nameMap);
  }

  private async resolveCurrentPlayerName(match: MatchRecord | null) {
    if (!match || !this.currentUserId || !this.turnService) {
      this.currentPlayerName = null;
      return;
    }
    try {
      const map = await this.turnService.resolveUsernames([this.currentUserId]);
      this.currentPlayerName = map[this.currentUserId] ?? null;
    } catch (error) {
      console.warn("resolveCurrentPlayerName failed", error);
      this.currentPlayerName = null;
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
    const normalizedSelection: MainActionSelection = {
      actionId: selection?.actionId ?? null,
      targetLocation: this.normalizeAxial(selection?.targetLocation),
    };
    const character =
      this.currentMatch?.playerCharacters?.[this.currentUserId] ?? null;
    const previousPlan = character?.actionPlan?.main ?? null;
    const previousActionId = previousPlan?.actionId ?? null;
    const previousTarget = this.normalizeAxial(previousPlan?.targetLocationId);
    if (
      normalizedSelection.actionId === previousActionId &&
      this.isSameAxial(normalizedSelection.targetLocation, previousTarget)
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
            normalizedSelection.targetLocation
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
    target: Axial | null
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

  private isSameAxial(a: Axial | null, b: Axial | null) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.q === b.q && a.r === b.r;
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
}
