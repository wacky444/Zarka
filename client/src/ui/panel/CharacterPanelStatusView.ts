import Phaser from "phaser";
import {
  DEFAULT_SKIN,
  type PlayerCharacter,
  type Skin
} from "@shared";
import { ProgressBar } from "../ProgressBar";
import { THEME } from "../ColorPalette";
import { createSkinContainer, type SkinContainer } from "../PlayerSkinRenderer";
import { t } from "../../services/i18n";

export interface CharacterPanelStatusViewLayout {
  margin: number;
  portraitSize: number;
  barWidth: number;
  contentTop: number;
  barHeight: number;
}

export class CharacterPanelStatusView {
  private readonly portrait: SkinContainer;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly healthLabel: Phaser.GameObjects.Text;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly healthBar: ProgressBar;
  private readonly energyBar: ProgressBar;
  private readonly elements: Phaser.GameObjects.GameObject[];

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    layout: CharacterPanelStatusViewLayout
  ) {
    const portraitScale = layout.portraitSize / 16;
    const barX = layout.margin * 2 + layout.portraitSize;
    this.portrait = createSkinContainer(
      scene,
      layout.margin + layout.portraitSize / 2,
      layout.contentTop + layout.portraitSize / 2,
      DEFAULT_SKIN,
      portraitScale
    );
    parent.add(this.portrait);
    this.nameText = scene.add
      .text(layout.margin, layout.contentTop - 14, "", {
        fontSize: "18px",
        color: "#ffffff"
      })
      .setOrigin(0, 0);
    parent.add(this.nameText);
    this.healthLabel = scene.add
      .text(barX, layout.contentTop - 14, "Health", {
        fontSize: "14px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0);
    parent.add(this.healthLabel);
    this.healthBar = new ProgressBar(scene, barX, layout.contentTop, {
      width: layout.barWidth,
      height: layout.barHeight,
      trackColor: 0x25304c,
      barColor: THEME.colors.healthAccent
    });
    parent.add(this.healthBar);
    this.energyLabel = scene.add
      .text(barX, layout.contentTop + 32, t("Energy"), {
        fontSize: "14px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0);
    parent.add(this.energyLabel);
    this.energyBar = new ProgressBar(
      scene,
      barX,
      layout.contentTop + 46,
      {
        width: layout.barWidth,
        height: layout.barHeight,
        trackColor: 0x25304c,
        barColor: THEME.colors.energyAccent
      }
    );
    parent.add(this.energyBar);
    this.elements = [
      this.portrait,
      this.nameText,
      this.healthLabel,
      this.energyLabel,
      this.healthBar,
      this.energyBar
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setSkin(skin: Skin, textures: Phaser.Textures.TextureManager): void {
    this.portrait.updateSkin(skin, textures);
  }

  update(character: PlayerCharacter | null, playerName: string | null): void {
    if (!character) {
      this.nameText.setText("No character");
      this.healthLabel.setText("Health");
      this.energyLabel.setText(t("Energy"));
      this.healthBar.setValue(0);
      this.energyBar.setValue(0);
      return;
    }
    const { health, energy } = character.stats;
    const temporaryEnergy =
      typeof energy.temporary === "number" && energy.temporary > 0
        ? energy.temporary
        : 0;
    const energyLabel = `${t("Energy")} ${energy.current}/${energy.max}${
      temporaryEnergy > 0 ? ` (+${temporaryEnergy} extra)` : ""
    }`;
    this.nameText.setText(playerName ?? character.name);
    this.healthLabel.setText(`Health ${health.current}/${health.max}`);
    this.energyLabel.setText(energyLabel);
    this.healthBar.setValue(
      health.max === 0 ? 0 : health.current / health.max
    );
    this.energyBar.setValue(
      energy.max === 0 ? 0 : energy.current / energy.max
    );
  }

  layout(layout: CharacterPanelStatusViewLayout): void {
    const barX = layout.margin * 2 + layout.portraitSize;
    this.portrait.setPosition(
      layout.margin + layout.portraitSize / 2,
      layout.contentTop + layout.portraitSize / 2
    );
    this.nameText.setPosition(layout.margin, layout.contentTop - 14);
    this.healthLabel.setPosition(barX, layout.contentTop - 14);
    this.healthBar.setPosition(barX, layout.contentTop);
    this.healthBar.resize(layout.barWidth, layout.barHeight);
    this.energyLabel.setPosition(barX, layout.contentTop + 32);
    this.energyBar.setPosition(barX, layout.contentTop + 46);
    this.energyBar.resize(layout.barWidth, layout.barHeight);
  }

  destroy(): void {
    this.portrait.destroy(true);
    this.nameText.destroy();
    this.healthLabel.destroy();
    this.energyLabel.destroy();
    this.healthBar.destroy();
    this.energyBar.destroy();
  }
}
