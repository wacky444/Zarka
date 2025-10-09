import Phaser from "phaser";
import type { PlayerCharacter } from "@shared";

export class CharacterPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private panelWidth = 250;
  private panelHeight = 400;
  private x: number;
  private y: number;

  private characterSprite?: Phaser.GameObjects.Image;
  private healthBarBg?: Phaser.GameObjects.Rectangle;
  private healthBarFill?: Phaser.GameObjects.Rectangle;
  private healthText?: Phaser.GameObjects.Text;
  private energyBarBg?: Phaser.GameObjects.Rectangle;
  private energyBarFill?: Phaser.GameObjects.Rectangle;
  private energyText?: Phaser.GameObjects.Text;

  private mainActionBox?: Phaser.GameObjects.Container;
  private secondaryActionBox?: Phaser.GameObjects.Container;
  private mainActionText?: Phaser.GameObjects.Text;
  private secondaryActionText?: Phaser.GameObjects.Text;

  private mainActions = ["Move", "Attack", "Defend", "Search", "Rest"];
  private secondaryActions = ["Use Item", "Interact", "Hide", "None"];
  private selectedMainAction = 0;
  private selectedSecondaryAction = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.container = scene.add.container(x, y);
    this.container.setScrollFactor(0);

    this.createPanel();
  }

  private createPanel() {
    const panelBg = this.scene.add.rectangle(
      0,
      0,
      this.panelWidth,
      this.panelHeight,
      0x222222,
      0.85
    );
    panelBg.setStrokeStyle(2, 0x00ff88);
    this.container.add(panelBg);

    const portraitX = -this.panelWidth / 2 + 40;
    const portraitY = -this.panelHeight / 2 + 40;

    if (this.scene.textures.exists("char")) {
      this.characterSprite = this.scene.add.image(
        portraitX,
        portraitY,
        "char",
        "body_02.png"
      );
      this.characterSprite.setScale(2);
      this.container.add(this.characterSprite);
    }

    const barX = 30;
    const barY = -this.panelHeight / 2 + 20;
    const barWidth = 100;
    const barHeight = 12;

    this.healthBarBg = this.scene.add.rectangle(
      barX,
      barY,
      barWidth,
      barHeight,
      0x440000
    );
    this.healthBarBg.setOrigin(0, 0.5);
    this.container.add(this.healthBarBg);

    this.healthBarFill = this.scene.add.rectangle(
      barX,
      barY,
      barWidth,
      barHeight,
      0xff0000
    );
    this.healthBarFill.setOrigin(0, 0.5);
    this.container.add(this.healthBarFill);

    this.healthText = this.scene.add.text(barX, barY - 15, "Health", {
      fontSize: "10px",
      color: "#ffffff",
    });
    this.container.add(this.healthText);

    const energyBarY = barY + 25;
    this.energyBarBg = this.scene.add.rectangle(
      barX,
      energyBarY,
      barWidth,
      barHeight,
      0x002244
    );
    this.energyBarBg.setOrigin(0, 0.5);
    this.container.add(this.energyBarBg);

    this.energyBarFill = this.scene.add.rectangle(
      barX,
      energyBarY,
      barWidth,
      barHeight,
      0x0088ff
    );
    this.energyBarFill.setOrigin(0, 0.5);
    this.container.add(this.energyBarFill);

    this.energyText = this.scene.add.text(barX, energyBarY - 15, "Energy", {
      fontSize: "10px",
      color: "#ffffff",
    });
    this.container.add(this.energyText);

    const actionsY = -this.panelHeight / 2 + 120;
    this.createActionBox(
      "Main Action",
      actionsY,
      this.mainActions,
      (index) => {
        this.selectedMainAction = index;
        this.updateMainActionText();
      }
    );

    const secondaryActionsY = actionsY + 100;
    this.createSecondaryActionBox(
      "Secondary Action",
      secondaryActionsY,
      this.secondaryActions,
      (index) => {
        this.selectedSecondaryAction = index;
        this.updateSecondaryActionText();
      }
    );
  }

  private createActionBox(
    label: string,
    y: number,
    actions: string[],
    onSelect: (index: number) => void
  ) {
    this.mainActionBox = this.scene.add.container(0, y);

    const boxBg = this.scene.add.rectangle(
      0,
      20,
      this.panelWidth - 20,
      60,
      0x333333,
      0.9
    );
    boxBg.setStrokeStyle(1, 0x666666);
    this.mainActionBox.add(boxBg);

    const labelText = this.scene.add.text(
      -this.panelWidth / 2 + 15,
      0,
      label,
      {
        fontSize: "12px",
        color: "#00ff88",
      }
    );
    this.mainActionBox.add(labelText);

    this.mainActionText = this.scene.add.text(0, 20, actions[0], {
      fontSize: "14px",
      color: "#ffffff",
    });
    this.mainActionText.setOrigin(0.5);
    this.mainActionBox.add(this.mainActionText);

    const prevBtn = this.scene.add
      .text(-50, 20, "◀", {
        fontSize: "16px",
        color: "#00ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const newIndex =
          (this.selectedMainAction - 1 + actions.length) % actions.length;
        onSelect(newIndex);
      });
    this.mainActionBox.add(prevBtn);

    const nextBtn = this.scene.add
      .text(50, 20, "▶", {
        fontSize: "16px",
        color: "#00ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const newIndex = (this.selectedMainAction + 1) % actions.length;
        onSelect(newIndex);
      });
    this.mainActionBox.add(nextBtn);

    this.container.add(this.mainActionBox);
  }

  private createSecondaryActionBox(
    label: string,
    y: number,
    actions: string[],
    onSelect: (index: number) => void
  ) {
    this.secondaryActionBox = this.scene.add.container(0, y);

    const boxBg = this.scene.add.rectangle(
      0,
      20,
      this.panelWidth - 20,
      60,
      0x333333,
      0.9
    );
    boxBg.setStrokeStyle(1, 0x666666);
    this.secondaryActionBox.add(boxBg);

    const labelText = this.scene.add.text(
      -this.panelWidth / 2 + 15,
      0,
      label,
      {
        fontSize: "12px",
        color: "#00ff88",
      }
    );
    this.secondaryActionBox.add(labelText);

    this.secondaryActionText = this.scene.add.text(0, 20, actions[0], {
      fontSize: "14px",
      color: "#ffffff",
    });
    this.secondaryActionText.setOrigin(0.5);
    this.secondaryActionBox.add(this.secondaryActionText);

    const prevBtn = this.scene.add
      .text(-50, 20, "◀", {
        fontSize: "16px",
        color: "#00ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const newIndex =
          (this.selectedSecondaryAction - 1 + actions.length) %
          actions.length;
        onSelect(newIndex);
      });
    this.secondaryActionBox.add(prevBtn);

    const nextBtn = this.scene.add
      .text(50, 20, "▶", {
        fontSize: "16px",
        color: "#00ff88",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const newIndex = (this.selectedSecondaryAction + 1) % actions.length;
        onSelect(newIndex);
      });
    this.secondaryActionBox.add(nextBtn);

    this.container.add(this.secondaryActionBox);
  }

  private updateMainActionText() {
    if (this.mainActionText) {
      this.mainActionText.setText(this.mainActions[this.selectedMainAction]);
    }
  }

  private updateSecondaryActionText() {
    if (this.secondaryActionText) {
      this.secondaryActionText.setText(
        this.secondaryActions[this.selectedSecondaryAction]
      );
    }
  }

  public updateCharacter(character: PlayerCharacter | null) {
    if (!character) {
      return;
    }

    const healthPercent = character.stats.health.current / character.stats.health.max;
    const energyPercent = character.stats.energy.current / character.stats.energy.max;

    if (this.healthBarFill) {
      const barWidth = 100;
      this.healthBarFill.width = barWidth * healthPercent;
    }

    if (this.energyBarFill) {
      const barWidth = 100;
      this.energyBarFill.width = barWidth * energyPercent;
    }
  }

  public setVisible(visible: boolean) {
    this.container.setVisible(visible);
  }

  public destroy() {
    this.container.destroy();
  }
}
