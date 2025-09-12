import Phaser from "phaser";
import { makeButton } from "../ui/button";
import { HexTile, CellType } from "@shared";

export class GameScene extends Phaser.Scene {
  private cam!: Phaser.Cameras.Scene2D.Camera;

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
  }

  create() {
    this.cam = this.cameras.main;

    // Create a simple hex grid (pointy-top style) of 20 tiles (5 columns x 4 rows)
    const cols = 5;
    const rows = 4;

    const tileW = 59.5;
    const tileH = 205;

    // Spacing for pointy-top hexagon layout (approximate using sprite bounds)
    const dx = tileW * 1; // horizontal distance between columns
    const dy = tileH * 1; // vertical distance between rows

    const texture = this.textures.get("hex");
    const frameNames = texture.getFrameNames().filter((f) => f !== "__BASE");
    const cellTypes = Object.values(CellType) as CellType[];

    const sprites: Phaser.GameObjects.Image[] = [];

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const x = col * dx + tileW; // +tileW to add a small left margin
        const y = row * dy + (col % 2 ? dy / 2 : 0) + tileH; // offset every other column
        const frame = frameNames[(Math.random() * frameNames.length) | 0];
        const img = this.add.image(x, y, "hex", frame);
        // Attach a HexTile model to this sprite for shared logic/state
        const cellType = cellTypes[(Math.random() * cellTypes.length) | 0];
        const tile = new HexTile({ q: col, r: row }, cellType, { frame });
        img.setData("tile", tile);
        sprites.push(img);
      }
    }

    // Camera bounds around the grid
    const gridWidth = cols * dx + tileW * 2;
    const gridHeight = rows * dy + tileH * 2 + dy / 2;
    this.cam.setBounds(0, 0, gridWidth, gridHeight);
    this.cam.centerOn(gridWidth / 2, gridHeight / 2);

    // Shared model (HexTile) is now used via sprite data above

    // Drag to pan
    this.enableDragPan();

    // Scrollwheel zoom
    this.enableWheelZoom();

    // Optional: Back button to return to main scene
    makeButton(this, 10, 10, "Back", () => {
      this.scene.start("MainScene");
    }).setScrollFactor(0);
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
