import Phaser from "phaser";
import { LocalizationType, type MatchPreviewCell } from "@shared";
import { THEME } from "./ColorPalette";
import { t } from "../services/i18n";
import { MATCH_PREVIEW_COLORS } from "./MatchCardModel";

interface PositionedCell {
  cell: MatchPreviewCell;
  x: number;
  y: number;
}

export class MatchMapPreview extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    cells: MatchPreviewCell[]
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setSize(width, height);

    const background = scene.add
      .rectangle(0, 0, width, height, THEME.colors.collapsedBackground)
      .setOrigin(0);
    this.add(background);

    if (cells.length === 0) {
      const placeholder = scene.add
        .text(width / 2, height / 2, t("Map unavailable"), {
          color: THEME.colors.textMuted,
          fontSize: "12px",
          align: "center",
          wordWrap: { width: Math.max(40, width - 12) }
        })
        .setOrigin(0.5);
      this.add(placeholder);
      return;
    }

    const hexHeight = Math.sqrt(3) / 2 + 0.15;
    const rowStep = hexHeight;
    const positionedCells: PositionedCell[] = cells.map((cell) => ({
      cell,
      x: cell.coord.q + (((cell.coord.r % 2) + 2) % 2) * 0.5,
      y: cell.coord.r * rowStep
    }));
    const minX = Math.min(...positionedCells.map((cell) => cell.x)) - 0.5;
    const maxX = Math.max(...positionedCells.map((cell) => cell.x)) + 0.5;
    const minY =
      Math.min(...positionedCells.map((cell) => cell.y)) - hexHeight / 2;
    const maxY =
      Math.max(...positionedCells.map((cell) => cell.y)) + hexHeight / 2;
    const scale = Math.max(
      0.1,
      Math.min((width - 12) / (maxX - minX), (height - 12) / (maxY - minY))
    );
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    const radius = scale / Math.sqrt(3);
    const graphics = scene.add.graphics();
    this.add(graphics);

    for (const { cell, x, y } of positionedCells) {
      const centerX = offsetX + (x - minX) * scale;
      const centerY = offsetY + (y - minY) * scale;
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = (index * 60 * Math.PI) / 180;
        return new Phaser.Geom.Point(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius
        );
      });
      const fillColor = MATCH_PREVIEW_COLORS[cell.destructionState];
      graphics.fillStyle(fillColor, 1);
      graphics.lineStyle(1, THEME.colors.collapsedBackground, 1);
      graphics.fillPoints(points, true);
      graphics.strokePoints(points, true);
      if (
        cell.localizationType !== LocalizationType.Road &&
        cell.localizationType !== LocalizationType.Path &&
        cell.localizationType !== LocalizationType.Alley
      ) {
        graphics.fillStyle(THEME.colors.collapsedBackground, 0.65);
        graphics.fillCircle(centerX, centerY, Math.max(1, radius * 0.15));
      }
    }
  }
}
