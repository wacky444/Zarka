import Phaser from "phaser";
import type { RpcResponse } from "@heroiclabs/nakama-js";
import { makeButton } from "../ui/button";
import type { TurnService } from "../services/turnService";
import {
  CellLibrary,
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  HexTile,
  type GameMap,
  generateGameMap,
  type GetStatePayload,
  type MatchRecord,
} from "@shared";

export class GameScene extends Phaser.Scene {
  private static readonly TILE_WIDTH = 128;
  private static readonly TILE_HEIGHT = 118;

  private cam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private currentMatch: MatchRecord | null = null;
  private tilePositions: Record<string, { x: number; y: number }> = {};
  private playerSprites: Phaser.GameObjects.Image[] = [];

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
  }

  async create() {
    this.cam = this.cameras.main;
    this.uiCam = this.cameras.add(0, 0, this.cam.width, this.cam.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);

    const match = await this.fetchMatchFromServer();
    this.currentMatch = match;

    const map = this.resolveMap(match);

    this.renderMap(map);
    if (match) {
      this.renderPlayerCharacters(match);
    }

    this.enableDragPan();
    this.enableWheelZoom();

    // Hamburger menu button to show InMatchView
    const menuBtn = makeButton(this, 0, 0, "☰", () => {
      this.scene.stop("GameScene");
      this.scene.wake("MainScene");
    }).setScrollFactor(0);

    this.cam.ignore(menuBtn);

    // Position in bottom right corner
    const uiCam = this.uiCam;
    menuBtn.setPosition(
      uiCam.width - menuBtn.width - 10,
      uiCam.height - menuBtn.height - 10
    );
  }

  private async fetchMatchFromServer(): Promise<MatchRecord | null> {
    const service = this.registry.get("turnService") as TurnService | null;
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
      console.warn("fetchMapFromServer failed", error);
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
      if (!p.isDown) return;

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
}
