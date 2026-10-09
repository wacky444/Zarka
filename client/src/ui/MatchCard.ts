import Phaser from "phaser";
import type { MatchCardSummary } from "@shared";
import { t } from "../services/i18n";
import { THEME } from "./ColorPalette";
import {
  createMatchCardClickHandler,
  getMatchCardPresentation,
  getMatchTypeBadge
} from "./MatchCardModel";
import { MatchMapPreview } from "./MatchMapPreview";

const CARD_HEIGHT = 124;
const CARD_PADDING = 8;
const MAP_WIDTH = 136;
const MAP_HEIGHT = CARD_HEIGHT - CARD_PADDING * 2;
const TIME_COLUMN_WIDTH = 82;
const TURN_COLUMN_WIDTH = 58;

export interface MatchCardOptions {
  isMyMatch: boolean;
  currentUserReady?: boolean;
  onSelect: (match: MatchCardSummary) => void;
}

function fitText(
  text: Phaser.GameObjects.Text,
  value: string,
  maxWidth: number
): void {
  let visibleText = value;
  text.setText(visibleText);
  while (visibleText.length > 1 && text.width > maxWidth) {
    visibleText = `${visibleText.slice(0, -2)}…`;
    text.setText(visibleText);
  }
}

export class MatchCard extends Phaser.GameObjects.Container {
  private readonly summary: MatchCardSummary;
  private readonly options: MatchCardOptions;
  private readonly cardWidth: number;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    summary: MatchCardSummary,
    options: MatchCardOptions
  ) {
    super(scene, x, y);
    this.summary = summary;
    this.options = options;
    this.cardWidth = Math.max(300, width);
    this.setSize(this.cardWidth, CARD_HEIGHT);
    scene.add.existing(this);

    const background = scene.add
      .rectangle(0, 0, this.cardWidth, CARD_HEIGHT, THEME.colors.cardBackground)
      .setOrigin(0)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.add(background);

    const mapWidth = Math.min(
      MAP_WIDTH,
      Math.max(90, Math.floor(this.cardWidth * 0.32))
    );
    const timeColumnWidth = this.cardWidth < 360 ? 66 : TIME_COLUMN_WIDTH;
    const turnColumnWidth = this.cardWidth < 360 ? 48 : TURN_COLUMN_WIDTH;
    const mapPreview = new MatchMapPreview(
      scene,
      CARD_PADDING,
      CARD_PADDING,
      mapWidth,
      MAP_HEIGHT,
      summary.mapPreviewCells
    );
    this.add(mapPreview);

    const infoX = CARD_PADDING + mapWidth + 10;
    const turnColumnX = this.cardWidth - CARD_PADDING - turnColumnWidth;
    const timeColumnX = turnColumnX - timeColumnWidth;
    const infoWidth = Math.max(0, timeColumnX - infoX - 10);
    const row1Y = 38;
    const row2Y = 88;

    const badge = scene.add
      .text(infoX, row1Y, getMatchTypeBadge(summary.isRanked), {
        color: summary.isRanked
          ? THEME.colors.zarkanGold
          : THEME.colors.textMuted,
        fontSize: "15px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.add(badge);

    this.nameText = scene.add
      .text(infoX + badge.width + 8, row1Y, "", {
        color: THEME.colors.textPrimary,
        fontSize: "16px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    fitText(
      this.nameText,
      summary.name?.trim() || t("Match"),
      Math.max(24, infoWidth - badge.width - 8)
    );
    this.add(this.nameText);

    const presentation = getMatchCardPresentation(
      summary,
      Date.now(),
      options
    );
    const playerCount = scene.add
      .text(infoX, row2Y, presentation.playerCount, {
        color: THEME.colors.textPrimary,
        fontSize: "15px"
      })
      .setOrigin(0, 0.5);
    this.add(playerCount);

    const columnLabelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: THEME.colors.textMuted,
      fontSize: "11px",
      align: "center"
    };
    const columnValueStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: THEME.colors.textPrimary,
      fontSize: "15px",
      fontStyle: "bold",
      align: "center"
    };
    const timeCenterX = timeColumnX + timeColumnWidth / 2;
    const turnCenterX = turnColumnX + turnColumnWidth / 2;
    const timeLabel = scene.add
      .text(timeCenterX, 48, t("Time left"), {
        ...columnLabelStyle,
        wordWrap: { width: timeColumnWidth - 4 }
      })
      .setOrigin(0.5);
    this.add(timeLabel);
    this.timeText = scene.add
      .text(timeCenterX, 74, this.getLocalizedTime(presentation.timeLeft), columnValueStyle)
      .setOrigin(0.5)
      .setColor(
        presentation.urgentTimeLeft
          ? THEME.colors.cooldown
          : THEME.colors.textPrimary
      );
    this.add(this.timeText);
    const turnLabel = scene.add
      .text(turnCenterX, 48, t("Turn"), {
        ...columnLabelStyle,
        wordWrap: { width: turnColumnWidth - 4 }
      })
      .setOrigin(0.5);
    this.add(turnLabel);
    const turnText = scene.add
      .text(turnCenterX, 74, `${summary.currentTurn}`, columnValueStyle)
      .setOrigin(0.5);
    this.add(turnText);

    const separators = scene.add.graphics();
    separators.lineStyle(1, THEME.colors.collapsedBorder, 0.8);
    separators.lineBetween(timeColumnX, 14, timeColumnX, CARD_HEIGHT - 14);
    separators.lineBetween(turnColumnX, 14, turnColumnX, CARD_HEIGHT - 14);
    this.add(separators);

    if (presentation.showPlayOverlay) {
      const overlay = scene.add.graphics();
      const centerX = CARD_PADDING + mapWidth / 2;
      const centerY = CARD_PADDING + MAP_HEIGHT / 2;
      overlay.fillStyle(0x16a34a, 0.9);
      overlay.fillCircle(centerX, centerY, 19);
      overlay.fillStyle(0xffffff, 1);
      overlay.fillPoints(
        [
          new Phaser.Geom.Point(centerX - 5, centerY - 8),
          new Phaser.Geom.Point(centerX + 8, centerY),
          new Phaser.Geom.Point(centerX - 5, centerY + 8)
        ],
        true
      );
      this.add(overlay);
    }

    const hitArea = scene.add
      .zone(0, 0, this.cardWidth, CARD_HEIGHT)
      .setOrigin(0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, this.cardWidth, CARD_HEIGHT),
        Phaser.Geom.Rectangle.Contains
      );
    let downPointerId: number | null = null;
    hitArea.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        downPointerId = pointer.id;
        event.stopPropagation();
      }
    );
    hitArea.on(
      Phaser.Input.Events.POINTER_UP,
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (downPointerId === pointer.id) {
          createMatchCardClickHandler(this.summary, this.options.onSelect)();
        }
        downPointerId = null;
      }
    );
    hitArea.on(Phaser.Input.Events.POINTER_OUT, () => {
      downPointerId = null;
    });
    this.add(hitArea);
  }

  refreshTime(nowMs = Date.now()): void {
    const presentation = getMatchCardPresentation(
      this.summary,
      nowMs,
      this.options
    );
    this.timeText.setText(this.getLocalizedTime(presentation.timeLeft));
    this.timeText.setColor(
      presentation.urgentTimeLeft
        ? THEME.colors.cooldown
        : THEME.colors.textPrimary
    );
  }

  private getLocalizedTime(value: string): string {
    return value === "Manual" || value === "Waiting" ? t(value) : value;
  }
}
