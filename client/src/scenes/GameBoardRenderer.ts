import Phaser from "phaser";
import {
  CellLibrary,
  DEFAULT_SKIN,
  type ActionId,
  type Axial,
  type GameMap,
  HexTile,
  ItemLibrary,
  type ItemId,
  type MatchRecord,
  type ReplaySnapshot,
  type Skin,
  type TrapRecord,
  TUTORIAL_MATCH_METADATA_KEY,
  axialDistance,
  getHexTileOffsets,
} from "@shared";
import {
  createFireTileAnimation,
  type FireTileAnimation,
} from "../animation/FireTileAnimation";
import { resolveItemTexture } from "../ui/itemIcons";
import {
  ItemTooltipManager,
  composeItemDescription,
} from "../ui/ItemTooltip";
import {
  CellContentsPanel,
  type CellContentsEntry
} from "../ui/CellContentsPanel";
import { HoverTooltip } from "../ui/HoverTooltip";
import {
  createSkinContainer,
  type SkinContainer,
} from "../ui/PlayerSkinRenderer";

const TILE_WIDTH = 128;
const TILE_HEIGHT = 118;

export type BoardReplayView = {
  turn: number;
  snapshot: ReplaySnapshot;
  match: MatchRecord;
};

export type BoardLocationSelection = {
  active: boolean;
  actionId: ActionId | null;
  hoveredTileId: string | null;
  pointerId: number | null;
  extraExecutions: number;
};

export interface GameBoardRendererCallbacks {
  getCurrentMatch(): MatchRecord | null;
  getReplayView(): BoardReplayView | null;
  getCurrentUserId(): string | null;
  getPlayerSkin(playerId: string): Skin | undefined;
  getPlayerName(playerId: string): string;
  getLocationSelection(): BoardLocationSelection;
  isPinchGestureInProgress(): boolean;
  isLocationInRange(
    actionId: ActionId,
    coord: Axial,
    extraExecutions: number,
  ): boolean;
  onTileHover(tileId: string | null): void;
  onTilePick(tile: HexTile): void;
  onCellInfoOpened(coord: Axial): void;
  onPlayerCardClick(playerId: string): void;
}

export class GameBoardRenderer {
  private readonly scene: Phaser.Scene;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly uiCamera: Phaser.Cameras.Scene2D.Camera;
  private readonly itemTooltip: ItemTooltipManager;
  private readonly cellContentsPanel: CellContentsPanel;
  private readonly hoverTooltip: HoverTooltip;
  private readonly callbacks: GameBoardRendererCallbacks;

  private tilePositions: Record<string, { x: number; y: number }> = {};
  private mapTileSprites: Array<{
    tile: HexTile;
    image: Phaser.GameObjects.Image;
    skullImage?: Phaser.GameObjects.Image;
    skullShiverTween?: Phaser.Tweens.Tween;
  }> = [];
  private trapVisuals: Phaser.GameObjects.Graphics[] = [];
  private fireTileAnimations = new Map<string, FireTileAnimation>();
  private playerSprites = new Map<string, SkinContainer>();
  private playerNameLabels = new Map<string, Phaser.GameObjects.Text>();
  private playerDizzyStars = new Map<string, Phaser.GameObjects.Container>();
  private tileItemContainers = new Map<string, Phaser.GameObjects.Container>();
  private playerCoordForTinting: Axial | null = null;
  private playerViewRange = 0;
  private locationSelectionHoverText: Phaser.GameObjects.Text | null = null;

  constructor(
    scene: Phaser.Scene,
    camera: Phaser.Cameras.Scene2D.Camera,
    uiCamera: Phaser.Cameras.Scene2D.Camera,
    itemTooltip: ItemTooltipManager,
    cellContentsPanel: CellContentsPanel,
    hoverTooltip: HoverTooltip,
    callbacks: GameBoardRendererCallbacks,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.uiCamera = uiCamera;
    this.itemTooltip = itemTooltip;
    this.cellContentsPanel = cellContentsPanel;
    this.hoverTooltip = hoverTooltip;
    this.callbacks = callbacks;
  }

  destroy(): void {
    this.clearMapTileSprites();
    for (const container of this.tileItemContainers.values()) {
      container.destroy(true);
    }
    this.tileItemContainers.clear();
    for (const sprite of this.playerSprites.values()) {
      sprite.destroy();
    }
    this.playerSprites.clear();
    for (const label of this.playerNameLabels.values()) {
      label.destroy();
    }
    this.playerNameLabels.clear();
    for (const effect of this.playerDizzyStars.values()) {
      effect.destroy(true);
    }
    this.playerDizzyStars.clear();
    this.locationSelectionHoverText?.destroy();
    this.locationSelectionHoverText = null;
    this.tilePositions = {};
  }

  renderMap(map: GameMap): void {
    this.clearMapTileSprites();
    const dx = TILE_WIDTH;
    const dy = TILE_HEIGHT;
    const texture = this.scene.textures.get("hex");
    const sprites: Phaser.GameObjects.Image[] = [];
    this.tilePositions = {};

    const playerCoord = this.getCurrentPlayerCoord();
    const viewRange = this.getCurrentPlayerViewRange();
    this.playerCoordForTinting = playerCoord;
    this.playerViewRange = viewRange;

    const currentTurn = this.getCurrentTurn();

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
      const rowOffset = row % 2 !== 0 ? dx / 2 : 0;
      const x = col * dx + TILE_WIDTH + rowOffset;
      const y = row * dy + TILE_HEIGHT;
      const img = this.scene.add.image(x, y, "hex", frame);
      img.setData("tile", tile);

      const destructionTurn =
        typeof tile.meta?.destructionTurn === "number"
          ? tile.meta.destructionTurn
          : undefined;
      const warningTurn =
        typeof tile.meta?.warningTurn === "number"
          ? tile.meta.warningTurn
          : undefined;
      const isDestroyed =
        tile.meta?.destroyed === true ||
        (typeof destructionTurn === "number" && currentTurn >= destructionTurn);
      const isWarning =
        !isDestroyed &&
        typeof warningTurn === "number" &&
        typeof destructionTurn === "number" &&
        currentTurn >= warningTurn &&
        currentTurn < destructionTurn;

      let skullImage: Phaser.GameObjects.Image | undefined;
      let skullShiverTween: Phaser.Tweens.Tween | undefined;
      if (isWarning && this.scene.textures.exists("board_icon_skull")) {
        skullImage = this.scene.add.image(x + 35, y - 30, "board_icon_skull");
        skullImage.setDisplaySize(28, 28);
        skullImage.setDepth(10);
        if (destructionTurn - currentTurn === 1) {
          skullShiverTween = this.scene.tweens.add({
            targets: skullImage,
            x: x + 38,
            y: y - 28,
            angle: 6,
            duration: 90,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
        }
        sprites.push(skullImage);
      }

      this.updateTileTintState(img, tile);
      img.setInteractive({ useHandCursor: false });
      img.on(
        Phaser.Input.Events.POINTER_OVER,
        (pointer: Phaser.Input.Pointer) => {
          this.callbacks.onTileHover(tile.id);
          if (isWarning && typeof destructionTurn === "number") {
            const turnsLeft = destructionTurn - currentTurn;
            this.hoverTooltip.show(pointer.x, pointer.y, {
              title: "Incoming Destruction",
              body: `Destroyed in ${turnsLeft} ${turnsLeft === 1 ? "turn" : "turns"}`,
            });
          }
        },
      );
      img.on(Phaser.Input.Events.POINTER_OUT, () => {
        this.hoverTooltip.hide();
        if (
          this.callbacks.getLocationSelection().hoveredTileId === tile.id
        ) {
          this.callbacks.onTileHover(null);
        }
      });
      img.on(
        Phaser.Input.Events.POINTER_UP,
        (pointer: Phaser.Input.Pointer) => {
          const selection = this.callbacks.getLocationSelection();
          if (
            this.callbacks.isPinchGestureInProgress() ||
            pointer.button !== 0 ||
            pointer.getDistance() > 15
          ) {
            return;
          }
          const tileData = img.getData("tile") as HexTile | undefined;
          if (!tileData) {
            return;
          }
          if (selection.active) {
            if (
              selection.pointerId !== null &&
              pointer.id === selection.pointerId
            ) {
              this.callbacks.onTilePick(tileData);
            }
            return;
          }
          if (
            this.callbacks.getCurrentMatch()?.metadata?.[
              TUTORIAL_MATCH_METADATA_KEY
            ]
          ) {
            this.showTutorialCellInfo(tileData);
          }
        },
      );
      sprites.push(img);
      this.mapTileSprites.push({ tile, image: img, skullImage, skullShiverTween });
      this.tilePositions[tile.id] = { x, y };
    }

    this.uiCamera.ignore(sprites);
    this.renderFireTileAnimations(map);

    const gridWidth = map.cols * dx + TILE_WIDTH * 2 + dx / 2;
    const gridHeight = map.rows * dy + TILE_HEIGHT * 2 + dy / 2;
    this.camera.setBounds(
      -gridWidth / 2,
      -gridHeight / 2,
      gridWidth * 2,
      gridHeight * 2,
    );
    this.camera.centerOn(gridWidth / 2, gridHeight / 2);
    this.scene.registry.set("currentMatchMap", map);
    this.renderItems(map);
    const replayView = this.callbacks.getReplayView();
    this.renderTraps(
      replayView?.snapshot.traps ?? this.callbacks.getCurrentMatch()?.traps,
    );
  }

  renderPlayerCharacters(match: MatchRecord): void {
    if (!this.scene.textures.exists("char")) {
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
      const offsets = getHexTileOffsets(sorted.length, TILE_WIDTH / 4);
      for (let index = 0; index < sorted.length; index += 1) {
        const playerId = sorted[index];
        const offset = offsets[index] ?? { x: 0, y: 0 };
        const x = world.x + offset.x;
        const y = world.y + offset.y;
        const character = characters[playerId];
        const conditions = character?.statuses?.conditions;
        const isDead = Array.isArray(conditions)
          ? conditions.indexOf("dead") !== -1
          : false;
        const isUnconscious = Array.isArray(conditions)
          ? conditions.indexOf("unconscious") !== -1
          : false;
        const playerSkin =
          this.callbacks.getPlayerSkin(playerId) ?? DEFAULT_SKIN;
        let sprite = this.playerSprites.get(playerId);
        if (!sprite || !sprite.active || sprite.scene !== this.scene) {
          sprite = createSkinContainer(this.scene, x, y, playerSkin, 2);
          sprite.setData("playerId", playerId);
          sprite.setInteractive({ useHandCursor: true });
          this.attachPlayerCardClickHandler(sprite, playerId);
          this.uiCamera.ignore(sprite);
          this.playerSprites.set(playerId, sprite);
        } else {
          sprite.updateSkin(playerSkin, this.scene.textures);
        }
        sprite.setPosition(x, y);
        sprite.setVisible(true);
        sprite.setDepth(5 + y / 1000);
        sprite.setAngle(isDead ? -90 : isUnconscious ? -18 : 0);
        if (isUnconscious && !isDead) {
          this.ensureDizzyStars(playerId, sprite);
        } else {
          this.removeDizzyStars(playerId);
        }

        const name = this.callbacks.getPlayerName(playerId);
        let label = this.playerNameLabels.get(playerId);
        if (!label || !label.active || label.scene !== this.scene) {
          label = this.scene.add.text(x, y, name, {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 4,
            resolution: 3,
          });
          label.setOrigin(0.5, 0.5);
          label.setDepth(6);
          label.setInteractive({ useHandCursor: true });
          this.attachPlayerCardClickHandler(label, playerId);
          this.uiCamera.ignore(label);
          this.playerNameLabels.set(playerId, label);
        }
        label.setText(name);
        label.setPosition(x, y);
        label.setVisible(true);
        this.positionLabel(label, sprite);
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
    for (const [playerId] of this.playerDizzyStars) {
      if (!seen.has(playerId)) {
        this.removeDizzyStars(playerId);
      }
    }
    this.refreshAllTileTints();
  }

  renderItems(map: GameMap): void {
    this.cellContentsPanel.close();
    this.itemTooltip.hide();
    for (const container of this.tileItemContainers.values()) {
      container.destroy(true);
    }
    this.tileItemContainers.clear();

    if (!Array.isArray(map.tiles) || map.tiles.length === 0) {
      return;
    }

    const maxIcons = 6;
    const iconsPerRow = 3;
    const spacing = 28;
    const verticalOffset = TILE_HEIGHT * 0.35;
    const replayView = this.callbacks.getReplayView();
    const matchItemsRaw =
      replayView?.snapshot.items ?? this.callbacks.getCurrentMatch()?.items;
    const matchItems = Array.isArray(matchItemsRaw) ? matchItemsRaw : [];
    const itemTypeById = new Map<string, ItemId>();
    for (const entry of matchItems) {
      if (!entry || typeof entry.item_id !== "string") {
        continue;
      }
      if (typeof entry.item_type !== "string") {
        continue;
      }
      itemTypeById.set(entry.item_id, entry.item_type);
    }

    for (const snapshot of map.tiles) {
      const itemIds = Array.isArray(snapshot.itemIds) ? snapshot.itemIds : [];
      if (itemIds.length === 0) {
        continue;
      }
      const aggregated = new Map<ItemId, number>();
      for (const id of itemIds) {
        if (typeof id !== "string") {
          continue;
        }
        const type = itemTypeById.get(id);
        if (!type) {
          continue;
        }
        const previous = aggregated.get(type) ?? 0;
        aggregated.set(type, previous + 1);
      }
      if (aggregated.size === 0) {
        continue;
      }
      const entries = Array.from(aggregated.entries());
      entries.sort((a, b) => {
        if (b[1] === a[1]) {
          const defA = ItemLibrary[a[0] as keyof typeof ItemLibrary];
          const defB = ItemLibrary[b[0] as keyof typeof ItemLibrary];
          const nameA = defA?.name ?? a[0];
          const nameB = defB?.name ?? b[0];
          return nameA.localeCompare(nameB);
        }
        return b[1] - a[1];
      });
      const hasMoreItemTypes = entries.length > maxIcons;
      const visibleEntries = entries.slice(
        0,
        hasMoreItemTypes ? maxIcons - 1 : maxIcons,
      );
      const displayCount =
        visibleEntries.length + (hasMoreItemTypes ? 1 : 0);
      const world = this.getTileWorldPosition(snapshot.id, snapshot.coord);
      const container = this.scene.add.container(
        world.x,
        world.y + verticalOffset,
      );
      container.setDepth(4 + world.y / 1000);

      const rows = Math.ceil(displayCount / iconsPerRow);
      for (let row = 0; row < rows; row += 1) {
        const rowStart = row * iconsPerRow;
        const rowCount = Math.min(iconsPerRow, displayCount - rowStart);
        const y = (row - (rows - 1) / 2) * spacing;
        for (let col = 0; col < rowCount; col += 1) {
          const index = rowStart + col;
          const x = (col - (rowCount - 1) / 2) * spacing;
          if (hasMoreItemTypes && index === visibleEntries.length) {
            const hiddenCount = entries
              .slice(visibleEntries.length)
              .reduce((total, entry) => total + entry[1], 0);
            const hiddenCountLabel =
              hiddenCount > 99 ? "+99+" : `+${hiddenCount}`;
            const moreBackground = this.scene.add
              .circle(0, 0, 13, 0x1d4ed8, 0.98)
              .setStrokeStyle(2, 0xbfdbfe, 1)
              .setInteractive({ useHandCursor: true });
            const moreLabel = this.scene.add
              .text(0, 0, hiddenCountLabel, {
                fontFamily: "Arial",
                fontSize: hiddenCountLabel.length > 3 ? "8px" : "11px",
                fontStyle: "bold",
                color: "#ffffff",
                stroke: "#0f172a",
                strokeThickness: 2,
                resolution: 3,
              })
              .setOrigin(0.5);
            moreBackground.on(
              Phaser.Input.Events.POINTER_UP,
              (
                pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event?: Phaser.Types.Input.EventData,
              ) => {
                event?.stopPropagation();
                if (pointer.button !== 0 || pointer.getDistance() > 15) {
                  return;
                }
                this.showCellContents(
                  snapshot.coord,
                  entries.map(([itemId, quantity]) => ({ itemId, quantity })),
                );
              },
            );
            moreBackground.on(Phaser.Input.Events.POINTER_OVER, () => {
              this.scene.input.setDefaultCursor("pointer");
            });
            moreBackground.on(Phaser.Input.Events.POINTER_OUT, () => {
              this.resetDefaultCursor();
            });
            const moreButton = this.scene.add.container(x, y, [
              moreBackground,
              moreLabel,
            ]);
            container.add(moreButton);
            continue;
          }
          const [itemType, quantity] = visibleEntries[index];
          const definition = ItemLibrary[itemType as keyof typeof ItemLibrary];
          if (!definition) {
            continue;
          }
          const textureInfo = resolveItemTexture(definition);
          if (!this.scene.textures.exists(textureInfo.texture)) {
            continue;
          }
          const tooltipBody = composeItemDescription(
            definition.description,
            definition.notes,
          );
          const showTooltip = (pointer: Phaser.Input.Pointer) => {
            if (pointer.button !== 0 && !pointer.wasTouch) {
              return;
            }
            if (
              this.callbacks.getLocationSelection().active ||
              this.callbacks.isPinchGestureInProgress()
            ) {
              return;
            }
            if (pointer.getDistance() > 15) {
              return;
            }
            this.itemTooltip.show(
              pointer.x,
              pointer.y,
              definition.name,
              tooltipBody,
            );
          };
          const sprite = this.scene.add.image(
            x,
            y,
            textureInfo.texture,
            textureInfo.frame,
          );
          sprite.setScale(1);
          sprite.setInteractive({ useHandCursor: true });
          sprite.on(Phaser.Input.Events.POINTER_UP, showTooltip);
          sprite.on(Phaser.Input.Events.POINTER_OVER, () => {
            if (!this.callbacks.getLocationSelection().active) {
              this.scene.input.setDefaultCursor("pointer");
            }
          });
          sprite.on(
            Phaser.Input.Events.POINTER_OUT,
            (pointer?: Phaser.Input.Pointer) => {
              this.resetDefaultCursor();
              if (!pointer?.wasTouch) {
                this.itemTooltip.hide();
              }
            },
          );
          container.add(sprite);
          const capped =
            quantity > 999 ? "999+" : quantity > 99 ? "99+" : `${quantity}`;
          const label = this.scene.add.text(x, y + 6, capped, {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
            resolution: 3,
          });
          label.setOrigin(0.5, 0);
          label.setInteractive({ useHandCursor: true });
          label.on(Phaser.Input.Events.POINTER_UP, showTooltip);
          label.on(Phaser.Input.Events.POINTER_OVER, () => {
            if (!this.callbacks.getLocationSelection().active) {
              this.scene.input.setDefaultCursor("pointer");
            }
          });
          label.on(
            Phaser.Input.Events.POINTER_OUT,
            (pointer?: Phaser.Input.Pointer) => {
              this.resetDefaultCursor();
              if (!pointer?.wasTouch) {
                this.itemTooltip.hide();
              }
            },
          );
          container.add(label);
        }
      }

      if (container.list.length === 0) {
        container.destroy(true);
        continue;
      }

      this.uiCamera.ignore(container);
      this.tileItemContainers.set(snapshot.id, container);
    }
  }

  private showTutorialCellInfo(tile: HexTile): void {
    const itemTypeById = new Map<string, ItemId>();
    for (const item of this.callbacks.getCurrentMatch()?.items ?? []) {
      itemTypeById.set(item.item_id, item.item_type);
    }

    const quantities = new Map<ItemId, number>();
    for (const itemId of tile.itemIds) {
      const itemType = itemTypeById.get(itemId);
      if (itemType) {
        quantities.set(itemType, (quantities.get(itemType) ?? 0) + 1);
      }
    }
    const entries: CellContentsEntry[] = Array.from(quantities.entries()).map(
      ([itemId, quantity]) => ({ itemId, quantity })
    );
    this.showCellContents(tile.coord, entries);
  }

  private showCellContents(coord: Axial, entries: CellContentsEntry[]): void {
    this.cellContentsPanel.show(coord, entries);
    this.callbacks.onCellInfoOpened(coord);
  }

  renderTraps(traps: TrapRecord[] | undefined): void {
    this.clearTrapVisuals();
    for (const trap of traps ?? []) {
      const from = this.getTileWorldPosition(trap.from.tileId, trap.from.coord);
      const to = this.getTileWorldPosition(trap.to.tileId, trap.to.coord);
      const midpoint = {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
      };
      const visual = this.scene.add.graphics();
      visual.lineStyle(7, 0xd65858, 0.9);
      visual.beginPath();
      visual.moveTo(from.x, from.y);
      visual.lineTo(to.x, to.y);
      visual.strokePath();
      visual.fillStyle(0xf97373, 1);
      visual.fillCircle(midpoint.x, midpoint.y, 7);
      visual.lineStyle(2, 0xffcccc, 1);
      visual.strokeCircle(midpoint.x, midpoint.y, 7);
      visual.setDepth(4);
      this.uiCamera.ignore(visual);
      this.trapVisuals.push(visual);
    }
  }

  refreshTileVisuals(): void {
    for (const entry of this.mapTileSprites) {
      this.updateTileTintState(entry.image, entry.tile);
    }
  }

  refreshLocationSelectionVisuals(): void {
    const selection = this.callbacks.getLocationSelection();
    for (const entry of this.mapTileSprites) {
      const { tile, image } = entry;
      const isHovered = selection.hoveredTileId === tile.id;
      const isInRange =
        selection.active && selection.actionId
          ? this.callbacks.isLocationInRange(
              selection.actionId,
              tile.coord,
              selection.extraExecutions,
            )
          : false;
      this.updateTileTintState(image, tile, {
        isLocationSelectionActive: selection.active,
        isInActionRange: isInRange,
        isHovered,
      });
    }
    this.updateLocationSelectionHoverText();
  }

  refreshAllTileTints(): void {
    this.playerCoordForTinting = this.getCurrentPlayerCoord();
    this.playerViewRange = this.getCurrentPlayerViewRange();
    const selection = this.callbacks.getLocationSelection();

    for (const entry of this.mapTileSprites) {
      const { tile, image } = entry;
      const isHovered = selection.hoveredTileId === tile.id;
      const isInRange =
        selection.active && selection.actionId
          ? this.callbacks.isLocationInRange(
              selection.actionId,
              tile.coord,
              selection.extraExecutions,
            )
          : false;
      this.updateTileTintState(image, tile, {
        isLocationSelectionActive: selection.active,
        isInActionRange: isInRange,
        isHovered,
      });
    }
  }

  getPlayerSprite(playerId: string): SkinContainer | undefined {
    return this.playerSprites.get(playerId);
  }

  getPlayerLabel(playerId: string): Phaser.GameObjects.Text | undefined {
    return this.playerNameLabels.get(playerId);
  }

  positionLabel(label: Phaser.GameObjects.Text, sprite: SkinContainer): void {
    const offset = sprite.displayHeight / 2 + 12;
    label.setPosition(sprite.x, sprite.y - offset);
    const playerId = sprite.getData("playerId") as string | undefined;
    if (playerId) {
      this.positionDizzyStars(playerId, sprite);
    }
  }

  ensureDizzyStars(playerId: string, sprite: SkinContainer): void {
    let effect = this.playerDizzyStars.get(playerId);
    if (!effect || !effect.active || effect.scene !== this.scene) {
      const leftStar = this.scene.add
        .text(-8, 0, "✦", {
          fontFamily: "Arial",
          fontSize: "13px",
          color: "#facc15",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5);
      const rightStar = this.scene.add
        .text(8, 1, "✧", {
          fontFamily: "Arial",
          fontSize: "10px",
          color: "#fde68a",
          stroke: "#000000",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5);
      effect = this.scene.add.container(0, 0, [leftStar, rightStar]);
      effect.setDepth(6.5);
      this.uiCamera.ignore(effect);
      this.playerDizzyStars.set(playerId, effect);
      this.scene.tweens.add({
        targets: leftStar,
        angle: 25,
        y: -3,
        duration: 420,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
      this.scene.tweens.add({
        targets: rightStar,
        angle: -30,
        y: 4,
        duration: 360,
        delay: 100,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }
    effect.setVisible(true);
    this.positionDizzyStars(playerId, sprite);
  }

  getCurrentPlayerCoord(): Axial | null {
    const match = this.getDisplayedMatch();
    const currentUserId = this.callbacks.getCurrentUserId();
    if (!match || !currentUserId) {
      return null;
    }
    return match.playerCharacters?.[currentUserId]?.position?.coord ?? null;
  }

  axialToWorld(coord: Axial): { x: number; y: number } {
    const rowOffset = coord.r % 2 !== 0 ? TILE_WIDTH / 2 : 0;
    return {
      x: coord.q * TILE_WIDTH + TILE_WIDTH + rowOffset,
      y: coord.r * TILE_HEIGHT + TILE_HEIGHT,
    };
  }

  private getCurrentPlayerViewRange(): number {
    const match = this.getDisplayedMatch();
    const currentUserId = this.callbacks.getCurrentUserId();
    if (!match || !currentUserId) {
      return 0;
    }
    const viewRange = match.playerCharacters?.[currentUserId]?.stats?.baseViewRange;
    return typeof viewRange === "number" && isFinite(viewRange)
      ? Math.max(0, Math.floor(viewRange))
      : 0;
  }

  private getCurrentRemoteViewCoord(): Axial | null {
    const replayView = this.callbacks.getReplayView();
    const match = this.callbacks.getCurrentMatch();
    const currentUserId = this.callbacks.getCurrentUserId();
    if (replayView || !match || !currentUserId) {
      return null;
    }
    const character = match.playerCharacters?.[currentUserId];
    const currentTurn = match.current_turn ?? 0;
    const remoteView = character?.remoteView;
    if (!remoteView || remoteView.turn !== currentTurn) {
      return null;
    }
    return remoteView.coord;
  }

  private getDisplayedMatch(): MatchRecord | null {
    return this.callbacks.getReplayView()?.match ?? this.callbacks.getCurrentMatch();
  }

  private getCurrentTurn(): number {
    return (
      this.callbacks.getReplayView()?.turn ??
      this.callbacks.getCurrentMatch()?.current_turn ??
      0
    );
  }

  private isOutOfViewRange(coord: Axial): boolean {
    const remoteView = this.getCurrentRemoteViewCoord();
    if (remoteView && remoteView.q === coord.q && remoteView.r === coord.r) {
      return false;
    }
    if (!this.playerCoordForTinting) {
      return false;
    }
    return (
      axialDistance(this.playerCoordForTinting, coord) > this.playerViewRange
    );
  }

  private updateTileTintState(
    image: Phaser.GameObjects.Image,
    tile: HexTile,
    options: {
      isLocationSelectionActive?: boolean;
      isInActionRange?: boolean;
      isHovered?: boolean;
    } = {},
  ): void {
    const currentTurn = this.getCurrentTurn();
    const destructionTurn =
      typeof tile.meta?.destructionTurn === "number"
        ? tile.meta.destructionTurn
        : undefined;
    const isDestroyed =
      tile.meta?.destroyed === true ||
      (typeof destructionTurn === "number" && currentTurn >= destructionTurn);

    if (isDestroyed) {
      image.setTint(0x333333);
      image.setAlpha(0.6);
      image.setScale(1);
      return;
    }

    const isOutOfRange = this.isOutOfViewRange(tile.coord);
    const dimTint = 0x666666;
    const { isLocationSelectionActive, isInActionRange, isHovered } = options;
    if (isOutOfRange) {
      image.setTint(dimTint);
      image.setAlpha(1);
    } else {
      image.clearTint();
      image.setAlpha(1);
    }
    if (isLocationSelectionActive) {
      if (isInActionRange) {
        image.setTint(isOutOfRange ? dimTint | 0x7dd3fc : 0x7dd3fc);
      } else {
        image.setTint(isOutOfRange ? dimTint | 0x334155 : 0x334155);
        image.setAlpha(0.8);
      }
    }
    if (isHovered) {
      const hoverTint = isInActionRange ? 0xfacc15 : 0xfb7185;
      image.setTint(hoverTint);
      image.setAlpha(1);
      image.setScale(1.03);
    } else {
      image.setScale(1);
    }
  }

  private clearMapTileSprites(): void {
    for (const entry of this.mapTileSprites) {
      entry.skullShiverTween?.remove();
      entry.image.destroy();
      entry.skullImage?.destroy();
    }
    this.mapTileSprites = [];
    this.clearFireTileAnimations();
    this.clearTrapVisuals();
  }

  private clearFireTileAnimations(): void {
    for (const animation of this.fireTileAnimations.values()) {
      for (const tween of animation.tweens) {
        tween.remove();
      }
      animation.container.destroy(true);
    }
    this.fireTileAnimations.clear();
  }

  renderFireTileAnimations(map: GameMap): void {
    this.clearFireTileAnimations();
    const currentTurn = this.getCurrentTurn();
    const nextTurn = currentTurn + 1;

    for (const snapshot of map.tiles) {
      const fireStartTurn =
        typeof snapshot.meta?.fireStartTurn === "number"
          ? snapshot.meta.fireStartTurn
          : undefined;
      const fireEndTurn =
        typeof snapshot.meta?.fireEndTurn === "number"
          ? snapshot.meta.fireEndTurn
          : undefined;
      const destructionTurn =
        typeof snapshot.meta?.destructionTurn === "number"
          ? snapshot.meta.destructionTurn
          : undefined;
      const isDestroyed =
        snapshot.meta?.destroyed === true ||
        (typeof destructionTurn === "number" && currentTurn >= destructionTurn);
      if (
        isDestroyed ||
        fireStartTurn === undefined ||
        fireEndTurn === undefined ||
        nextTurn < fireStartTurn ||
        nextTurn > fireEndTurn
      ) {
        continue;
      }

      const world = this.getTileWorldPosition(snapshot.id, snapshot.coord);
      const animation = createFireTileAnimation(
        this.scene,
        world.x,
        world.y,
        TILE_WIDTH,
        TILE_HEIGHT,
        2 + world.y / 1000,
      );
      this.uiCamera.ignore(animation.container);
      this.fireTileAnimations.set(snapshot.id, animation);
    }
  }

  private clearTrapVisuals(): void {
    for (const visual of this.trapVisuals) {
      visual.destroy();
    }
    this.trapVisuals = [];
  }

  private getTileWorldPosition(
    tileId: string,
    coord: Axial,
  ): { x: number; y: number } {
    const existing = this.tilePositions[tileId];
    return existing ?? this.axialToWorld(coord);
  }

  private attachPlayerCardClickHandler(
    gameObject: Phaser.GameObjects.GameObject,
    playerId: string,
  ): void {
    gameObject.on(
      Phaser.Input.Events.POINTER_UP,
      (pointer: Phaser.Input.Pointer) => {
        if (
          pointer.button !== 0 ||
          this.callbacks.getLocationSelection().active
        ) {
          return;
        }
        this.callbacks.onPlayerCardClick(playerId);
      },
    );
  }

  private positionDizzyStars(
    playerId: string,
    sprite: SkinContainer,
  ): void {
    const effect = this.playerDizzyStars.get(playerId);
    if (!effect || !effect.active) {
      return;
    }
    effect.setPosition(sprite.x, sprite.y - sprite.displayHeight / 2 - 5);
  }

  private removeDizzyStars(playerId: string): void {
    const effect = this.playerDizzyStars.get(playerId);
    if (!effect) {
      return;
    }
    effect.destroy(true);
    this.playerDizzyStars.delete(playerId);
  }

  private resetDefaultCursor(): void {
    this.scene.input.setDefaultCursor(
      this.callbacks.getLocationSelection().active ? "crosshair" : "default",
    );
  }

  private updateLocationSelectionHoverText(): void {
    const hoveredTileId =
      this.callbacks.getLocationSelection().hoveredTileId;
    if (!hoveredTileId) {
      this.locationSelectionHoverText?.setVisible(false);
      return;
    }
    const entry = this.mapTileSprites.find(
      (candidate) => candidate.tile.id === hoveredTileId,
    );
    if (!entry) {
      this.locationSelectionHoverText?.setVisible(false);
      return;
    }
    if (!this.locationSelectionHoverText) {
      this.locationSelectionHoverText = this.scene.add
        .text(0, 0, "", {
          fontFamily: "Arial",
          fontSize: "14px",
          color: "#ffffff",
          backgroundColor: "#0f172a",
          padding: { x: 6, y: 4 },
        })
        .setDepth(1000);
      this.uiCamera.ignore(this.locationSelectionHoverText);
    }
    const { tile, image } = entry;
    this.locationSelectionHoverText.setText(
      `${tile.cellType.localizationType}\n(${tile.coord.q}, ${tile.coord.r})`,
    );
    this.locationSelectionHoverText.setPosition(
      image.x - this.locationSelectionHoverText.width / 2,
      image.y -
        image.displayHeight / 2 -
        this.locationSelectionHoverText.height -
        8,
    );
    this.locationSelectionHoverText.setVisible(true);
  }
}
