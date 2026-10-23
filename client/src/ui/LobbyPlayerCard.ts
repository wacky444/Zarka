import Phaser from "phaser";
import { DEFAULT_SKIN, type Skin } from "@shared";
import { THEME } from "./ColorPalette";
import { createSkinContainer } from "./PlayerSkinRenderer";
import { t } from "../services/i18n";

const CARD_HEIGHT = 52;
const CARD_PADDING = 6;
const AVATAR_BOX_SIZE = 40;
const ELO_COLUMN_WIDTH = 72;

export interface LobbyPlayerData {
  id: string;
  name: string;
  elo: number;
  skin?: Skin;
  isHost?: boolean;
  isSelf?: boolean;
  index: number;
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

export class LobbyPlayerCard extends Phaser.GameObjects.Container {
  readonly cardHeight = CARD_HEIGHT;
  private readonly playerData: LobbyPlayerData;
  private cardWidth: number;
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly separators: Phaser.GameObjects.Graphics;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly hostBadge?: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text;
  private readonly eloLabel: Phaser.GameObjects.Text;
  private readonly eloValue: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    data: LobbyPlayerData
  ) {
    super(scene, x, y);
    this.playerData = data;
    this.cardWidth = Math.max(260, width);
    this.setSize(this.cardWidth, CARD_HEIGHT);
    scene.add.existing(this);

    this.background = scene.add
      .rectangle(0, 0, this.cardWidth, CARD_HEIGHT, THEME.colors.cardBackground)
      .setOrigin(0)
      .setStrokeStyle(1, THEME.colors.collapsedBorder, 1);
    this.add(this.background);

    const avatarBoxY = (CARD_HEIGHT - AVATAR_BOX_SIZE) / 2;
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
    const avatarCenterY = CARD_HEIGHT / 2;
    if (scene.textures.exists("char")) {
      const skinContainer = createSkinContainer(
        scene,
        avatarCenterX,
        avatarCenterY,
        data.skin ?? DEFAULT_SKIN,
        2.0
      );
      this.add(skinContainer);
    }

    const infoX = CARD_PADDING + AVATAR_BOX_SIZE + 10;
    const eloColumnX = this.cardWidth - CARD_PADDING - ELO_COLUMN_WIDTH;
    const eloCenterX = eloColumnX + ELO_COLUMN_WIDTH / 2;

    let nameX = infoX;
    if (data.isHost) {
      this.hostBadge = scene.add
        .text(infoX, 18, `👑 ${t("Host")}`, {
          color: THEME.colors.zarkanGold,
          fontSize: "12px",
          fontStyle: "bold"
        })
        .setOrigin(0, 0.5);
      this.add(this.hostBadge);
      nameX += this.hostBadge.width + 6;
    }

    this.nameText = scene.add
      .text(nameX, 18, "", {
        color: THEME.colors.textPrimary,
        fontSize: "15px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);
    this.add(this.nameText);

    let subLabel = `#${data.index}`;
    if (data.isSelf) {
      subLabel += ` • ${t("You")}`;
    }
    this.subText = scene.add
      .text(infoX, 35, subLabel, {
        color: data.isSelf ? THEME.colors.healthRecover : THEME.colors.textMuted,
        fontSize: "12px"
      })
      .setOrigin(0, 0.5);
    this.add(this.subText);

    this.separators = scene.add.graphics();
    this.separators.lineStyle(1, THEME.colors.collapsedBorder, 0.8);
    this.separators.lineBetween(eloColumnX, 8, eloColumnX, CARD_HEIGHT - 8);
    this.add(this.separators);

    this.eloLabel = scene.add
      .text(eloCenterX, 17, t("ELO"), {
        color: THEME.colors.textMuted,
        fontSize: "11px",
        align: "center"
      })
      .setOrigin(0.5);
    this.add(this.eloLabel);

    this.eloValue = scene.add
      .text(eloCenterX, 35, `${data.elo ?? 1000}`, {
        color: THEME.colors.zarkanGold,
        fontSize: "15px",
        fontStyle: "bold",
        align: "center"
      })
      .setOrigin(0.5);
    this.add(this.eloValue);

    const availableNameWidth = Math.max(20, eloColumnX - nameX - 10);
    fitText(this.nameText, data.name, availableNameWidth);
  }

  updateWidth(newWidth: number): void {
    const clampedWidth = Math.max(260, newWidth);
    if (this.cardWidth === clampedWidth) return;
    this.cardWidth = clampedWidth;
    this.setSize(this.cardWidth, CARD_HEIGHT);
    this.background.setSize(this.cardWidth, CARD_HEIGHT);

    const eloColumnX = this.cardWidth - CARD_PADDING - ELO_COLUMN_WIDTH;
    const eloCenterX = eloColumnX + ELO_COLUMN_WIDTH / 2;

    this.separators.clear();
    this.separators.lineStyle(1, THEME.colors.collapsedBorder, 0.8);
    this.separators.lineBetween(eloColumnX, 8, eloColumnX, CARD_HEIGHT - 8);

    this.eloLabel.setX(eloCenterX);
    this.eloValue.setX(eloCenterX);

    const nameX = this.hostBadge
      ? this.hostBadge.x + this.hostBadge.width + 6
      : CARD_PADDING + AVATAR_BOX_SIZE + 10;
    const availableNameWidth = Math.max(20, eloColumnX - nameX - 10);
    fitText(this.nameText, this.playerData.name, availableNameWidth);
  }
}
