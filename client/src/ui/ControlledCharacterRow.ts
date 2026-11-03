import Phaser from "phaser";
import { THEME } from "./ColorPalette";
import { createSkinContainer } from "./PlayerSkinRenderer";
import { t } from "../services/i18n";
import type { Skin } from "@shared";

const ROW_HEIGHT = 52;
const CARD_PADDING = 6;
const AVATAR_BOX_SIZE = 40;
const ACTIONS_COLUMN_WIDTH = 130;

export interface ControlledCharacterData {
  id: string;
  name: string;
  skin: Skin;
  index: number;
  canDelete: boolean;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
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

export class ControlledCharacterRow extends Phaser.GameObjects.Container {
  readonly rowHeight = ROW_HEIGHT;
  private readonly charData: ControlledCharacterData;
  private cardWidth: number;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly separators: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly badgeText: Phaser.GameObjects.Text;
  private readonly renameButton: Phaser.GameObjects.Text;
  private readonly deleteButton: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    data: ControlledCharacterData
  ) {
    super(scene, x, y);
    this.charData = data;
    this.cardWidth = Math.max(260, width);
    this.setSize(this.cardWidth, ROW_HEIGHT);
    scene.add.existing(this);

    this.background = scene.add
      .rectangle(0, 0, this.cardWidth, ROW_HEIGHT, THEME.colors.cardBackground)
      .setOrigin(0)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.add(this.background);

    const avatarBoxY = (ROW_HEIGHT - AVATAR_BOX_SIZE) / 2;
    const avatarBox = scene.add
      .rectangle(
        CARD_PADDING,
        avatarBoxY,
        AVATAR_BOX_SIZE,
        AVATAR_BOX_SIZE,
        THEME.colors.collapsedBackground
      )
      .setOrigin(0)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.add(avatarBox);

    const avatarCenterX = CARD_PADDING + AVATAR_BOX_SIZE / 2;
    const avatarCenterY = ROW_HEIGHT / 2;
    if (scene.textures.exists("char")) {
      const skinWithoutHat: Skin = { ...data.skin, hat: "" };
      const skinContainer = createSkinContainer(
        scene,
        avatarCenterX,
        avatarCenterY,
        skinWithoutHat,
        2.0
      );
      this.add(skinContainer);
    }

    const infoX = CARD_PADDING + AVATAR_BOX_SIZE + 10;
    const actionsColumnX = this.cardWidth - CARD_PADDING - ACTIONS_COLUMN_WIDTH;

    this.nameText = scene.add
      .text(infoX, 18, "", {
        color: THEME.colors.textPrimary,
        fontSize: "15px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.add(this.nameText);

    this.badgeText = scene.add
      .text(infoX, 35, `Character #${data.index}`, {
        color: THEME.colors.textMuted,
        fontSize: "12px"
      })
      .setOrigin(0, 0.5);
    this.add(this.badgeText);

    this.separators = scene.add.graphics();
    this.separators.lineStyle(1, THEME.colors.collapsedBorder, 0.8);
    this.separators.lineBetween(actionsColumnX, 8, actionsColumnX, ROW_HEIGHT - 8);
    this.add(this.separators);

    // Rename button
    this.renameButton = scene.add
      .text(actionsColumnX + 8, ROW_HEIGHT / 2, `[ ${t("Rename")} ]`, {
        color: THEME.buttons.default.text,
        backgroundColor: THEME.buttons.default.background,
        fontSize: "13px"
      })
      .setPadding(4)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => data.onRename(data.id));
    this.add(this.renameButton);

    // Delete button
    this.deleteButton = scene.add
      .text(actionsColumnX + 76, ROW_HEIGHT / 2, `[ ${t("Delete")} ]`, {
        color: data.canDelete ? "#ff7777" : "#555555",
        backgroundColor: THEME.buttons.default.background,
        fontSize: "13px"
      })
      .setPadding(4)
      .setOrigin(0, 0.5);

    if (data.canDelete) {
      this.deleteButton
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => data.onDelete(data.id));
    }
    this.add(this.deleteButton);

    const availableNameWidth = Math.max(20, actionsColumnX - infoX - 10);
    fitText(this.nameText, data.name, availableNameWidth);
  }

  updateWidth(newWidth: number): void {
    const clampedWidth = Math.max(260, newWidth);
    if (this.cardWidth === clampedWidth) return;
    this.cardWidth = clampedWidth;
    this.setSize(this.cardWidth, ROW_HEIGHT);
    this.background.setSize(this.cardWidth, ROW_HEIGHT);

    const actionsColumnX = this.cardWidth - CARD_PADDING - ACTIONS_COLUMN_WIDTH;

    this.separators.clear();
    this.separators.lineStyle(1, THEME.colors.collapsedBorder, 0.8);
    this.separators.lineBetween(actionsColumnX, 8, actionsColumnX, ROW_HEIGHT - 8);

    this.renameButton.setX(actionsColumnX + 8);
    this.deleteButton.setX(actionsColumnX + 76);

    const infoX = CARD_PADDING + AVATAR_BOX_SIZE + 10;
    const availableNameWidth = Math.max(20, actionsColumnX - infoX - 10);
    fitText(this.nameText, this.charData.name, availableNameWidth);
  }
}
