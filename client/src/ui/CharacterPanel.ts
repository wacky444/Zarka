import Phaser from "phaser";
import type { MatchRecord, PlayerCharacter } from "@shared";

const DEFAULT_WIDTH = 320;
const TAB_HEIGHT = 40;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 120;

export class CharacterPanel extends Phaser.GameObjects.Container {
  private background: Phaser.GameObjects.Rectangle;
  private tabs: Array<{
    key: string;
    rect: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
  }> = [];
  private portrait: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private healthLabel: Phaser.GameObjects.Text;
  private energyLabel: Phaser.GameObjects.Text;
  private healthBarBg: Phaser.GameObjects.Rectangle;
  private healthBarFill: Phaser.GameObjects.Rectangle;
  private energyBarBg: Phaser.GameObjects.Rectangle;
  private energyBarFill: Phaser.GameObjects.Rectangle;
  private mainActionBox: Phaser.GameObjects.Rectangle;
  private secondaryActionBox: Phaser.GameObjects.Rectangle;
  private mainActionLabel: Phaser.GameObjects.Text;
  private secondaryActionLabel: Phaser.GameObjects.Text;
  private mainActionDropdown: Phaser.GameObjects.Container;
  private mainActionDropdownBg: Phaser.GameObjects.Rectangle;
  private mainActionSelectedText: Phaser.GameObjects.Text;
  private mainActionCaret: Phaser.GameObjects.Text;
  private mainActionOptionsContainer: Phaser.GameObjects.Container;
  private mainActionValues: string[] = [];
  private mainActionSelectedValue: string | null = null;
  private mainActionDropdownWidth: number;
  private mainActionOptionsVisible = false;
  private secondaryActionText: Phaser.GameObjects.Text;
  private panelWidth: number;
  private panelHeight: number;
  private barWidth: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width = DEFAULT_WIDTH,
    height: number = scene.scale.height
  ) {
    super(scene, x, y);
    this.panelWidth = width;
    this.panelHeight = height;
    this.barWidth = width - (PORTRAIT_SIZE + MARGIN * 3);
    this.setSize(width, height);
    this.setScrollFactor(0);
    scene.add.existing(this);
    this.setDepth(1000);
    this.background = scene.add
      .rectangle(0, 0, width, height, 0x151a2f, 0.92)
      .setOrigin(0, 0);
    this.add(this.background);
    const tabsConfig = [
      { key: "character", label: "Character" },
      { key: "players", label: "Players" },
      { key: "chat", label: "Chat" },
    ];
    const tabWidth = width / tabsConfig.length;
    tabsConfig.forEach((tab, index) => {
      const rect = scene.add
        .rectangle(
          index * tabWidth,
          0,
          tabWidth,
          TAB_HEIGHT,
          index === 0 ? 0x253055 : 0x1c233f
        )
        .setOrigin(0, 0);
      const text = scene.add
        .text(index * tabWidth + 12, 10, tab.label, {
          fontSize: "16px",
          color: "#ffffff",
        })
        .setOrigin(0, 0);
      this.add(rect);
      this.add(text);
      this.tabs.push({ key: tab.key, rect, text });
    });
    const contentTop = TAB_HEIGHT + MARGIN;
    this.portrait = scene.add
      .image(MARGIN, contentTop, "char", "body_02.png")
      .setOrigin(0, 0);
    this.portrait.setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);
    this.add(this.portrait);
    this.nameText = scene.add
      .text(MARGIN, contentTop + PORTRAIT_SIZE + 8, "", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.nameText);
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    this.healthLabel = scene.add
      .text(barX, contentTop - 14, "Health", {
        fontSize: "14px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.add(this.healthLabel);
    this.healthBarBg = scene.add
      .rectangle(barX, contentTop, this.barWidth, BAR_HEIGHT, 0x25304c)
      .setOrigin(0, 0);
    this.add(this.healthBarBg);
    this.healthBarFill = scene.add
      .rectangle(barX, contentTop, this.barWidth, BAR_HEIGHT, 0x4ade80)
      .setOrigin(0, 0);
    this.add(this.healthBarFill);
    this.energyLabel = scene.add
      .text(barX, contentTop + 32, "Energy", {
        fontSize: "14px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.add(this.energyLabel);
    this.energyBarBg = scene.add
      .rectangle(barX, contentTop + 46, this.barWidth, BAR_HEIGHT, 0x25304c)
      .setOrigin(0, 0);
    this.add(this.energyBarBg);
    this.energyBarFill = scene.add
      .rectangle(barX, contentTop + 46, this.barWidth, BAR_HEIGHT, 0xfacc15)
      .setOrigin(0, 0);
    this.add(this.energyBarFill);
    const mainBoxY = this.nameText.y + this.nameText.height + 12;
    const boxWidth = width - MARGIN * 2;
    this.mainActionBox = scene.add
      .rectangle(MARGIN, mainBoxY, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.add(this.mainActionBox);
    this.mainActionLabel = scene.add
      .text(MARGIN + 12, mainBoxY + 12, "Main Action", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.mainActionLabel);
    this.mainActionDropdownWidth = boxWidth - 24;
    this.mainActionDropdown = scene.add.container(MARGIN + 12, mainBoxY + 48);
    this.mainActionDropdown.setSize(this.mainActionDropdownWidth, 32);
    this.mainActionDropdown.setScrollFactor(0);
    this.mainActionDropdownBg = scene.add
      .rectangle(0, 0, this.mainActionDropdownWidth, 32, 0x101828)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155);
    this.mainActionSelectedText = scene.add
      .text(8, 6, "Loading...", {
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.mainActionCaret = scene.add
      .text(this.mainActionDropdownWidth - 18, 6, "▼", {
        fontSize: "14px",
        color: "#94a3b8",
      })
      .setOrigin(0, 0);
    this.mainActionDropdown.add([
      this.mainActionDropdownBg,
      this.mainActionSelectedText,
      this.mainActionCaret,
    ]);
    this.mainActionDropdown.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.mainActionDropdownWidth, 32),
      Phaser.Geom.Rectangle.Contains
    );
    this.mainActionDropdown.on("pointerdown", () => {
      this.toggleMainActionOptions();
    });
    this.add(this.mainActionDropdown);
    this.mainActionOptionsContainer = scene.add.container(
      MARGIN + 12,
      mainBoxY + 48 + 34
    );
    this.mainActionOptionsContainer.setVisible(false);
    this.mainActionOptionsContainer.setScrollFactor(0);
    this.add(this.mainActionOptionsContainer);
    const secondaryBoxY = mainBoxY + BOX_HEIGHT + 16;
    this.secondaryActionBox = scene.add
      .rectangle(MARGIN, secondaryBoxY, boxWidth, BOX_HEIGHT, 0x1b2440)
      .setOrigin(0, 0);
    this.add(this.secondaryActionBox);
    this.secondaryActionLabel = scene.add
      .text(MARGIN + 12, secondaryBoxY + 12, "Secondary Action", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.add(this.secondaryActionLabel);
    this.secondaryActionText = scene.add
      .text(MARGIN + 12, secondaryBoxY + 48, "None selected", {
        fontSize: "15px",
        color: "#cbd5f5",
      })
      .setOrigin(0, 0);
    this.add(this.secondaryActionText);
  }

  setPanelSize(width: number, height: number) {
    this.panelWidth = width;
    this.panelHeight = height;
    this.barWidth = width - (PORTRAIT_SIZE + MARGIN * 3);
    this.setSize(width, height);
    this.background.setSize(width, height);
    const boxWidth = width - MARGIN * 2;
    this.mainActionBox.setSize(boxWidth, BOX_HEIGHT);
    this.mainActionBox.setDisplaySize(boxWidth, BOX_HEIGHT);
    this.secondaryActionBox.setSize(boxWidth, BOX_HEIGHT);
    this.secondaryActionBox.setDisplaySize(boxWidth, BOX_HEIGHT);
    this.mainActionDropdownWidth = boxWidth - 24;
    this.mainActionDropdown.setSize(this.mainActionDropdownWidth, 32);
    this.mainActionDropdownBg.setSize(this.mainActionDropdownWidth, 32);
    this.mainActionDropdownBg.setDisplaySize(this.mainActionDropdownWidth, 32);
    this.mainActionCaret.setX(this.mainActionDropdownWidth - 18);
    const input = this.mainActionDropdown.input;
    if (input && input.hitArea) {
      const area = input.hitArea as Phaser.Geom.Rectangle;
      area.width = this.mainActionDropdownWidth;
      area.height = 32;
    } else if (this.mainActionValues.length > 1) {
      this.mainActionDropdown.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, this.mainActionDropdownWidth, 32),
        Phaser.Geom.Rectangle.Contains
      );
    }
    this.rebuildMainActionOptions();
  }

  getPanelWidth() {
    return this.panelWidth;
  }

  updateFromMatch(
    match: MatchRecord | null,
    currentUserId: string | null,
    usernames?: Record<string, string>
  ) {
    if (!match || !currentUserId) {
      this.applyCharacter(null, null);
      return;
    }
    const characters = match.playerCharacters ?? {};
    const character = characters[currentUserId] ?? null;
    const name = usernames?.[currentUserId] ?? null;
    this.applyCharacter(character, name);
  }

  private applyCharacter(
    character: PlayerCharacter | null,
    playerName: string | null
  ) {
    if (!character) {
      this.nameText.setText("No character");
      this.useBarValue(this.healthBarFill, 0);
      this.useBarValue(this.energyBarFill, 0);
      this.applyMainActions([]);
      this.secondaryActionText.setText("None selected");
      return;
    }
    this.nameText.setText(playerName ?? character.name);
    const health = character.stats.health;
    const energy = character.stats.energy;
    this.useBarValue(
      this.healthBarFill,
      health.max === 0 ? 0 : health.current / health.max
    );
    this.useBarValue(
      this.energyBarFill,
      energy.max === 0 ? 0 : energy.current / energy.max
    );
    const actions = this.collectMainActions(character);
    this.applyMainActions(actions.length > 0 ? actions : ["None"]);
    const secondary =
      character.actionPlan?.secondary?.actionId ?? "None selected";
    this.secondaryActionText.setText(secondary);
  }

  private useBarValue(bar: Phaser.GameObjects.Rectangle, ratio: number) {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    const width = this.barWidth * clamped;
    bar.setDisplaySize(width, BAR_HEIGHT);
    bar.setSize(width, BAR_HEIGHT);
  }

  private applyMainActions(actions: string[]) {
    this.mainActionValues = actions;
    this.selectMainAction(actions[0] ?? null);
    this.closeMainActionOptions();
    this.rebuildMainActionOptions();
    if (this.mainActionValues.length > 1) {
      this.mainActionDropdown.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, this.mainActionDropdownWidth, 32),
        Phaser.Geom.Rectangle.Contains
      );
      this.mainActionDropdown.setAlpha(1);
    } else {
      this.mainActionDropdown.disableInteractive();
      this.mainActionDropdown.setAlpha(0.85);
    }
  }

  private collectMainActions(character: PlayerCharacter) {
    const set = new Set<string>();
    const plan = character.actionPlan;
    if (plan?.main?.actionId) set.add(plan.main.actionId);
    if (plan?.nextMain?.actionId) set.add(plan.nextMain.actionId);
    return Array.from(set);
  }

  private toggleMainActionOptions() {
    if (this.mainActionValues.length <= 1) {
      return;
    }
    this.mainActionOptionsVisible = !this.mainActionOptionsVisible;
    this.mainActionOptionsContainer.setVisible(this.mainActionOptionsVisible);
  }

  private rebuildMainActionOptions() {
    this.mainActionOptionsContainer.removeAll(true);
    if (this.mainActionValues.length <= 1) {
      this.closeMainActionOptions();
      return;
    }
    const itemHeight = 30;
    const totalHeight = this.mainActionValues.length * itemHeight;
    const bg = this.scene.add
      .rectangle(0, 0, this.mainActionDropdownWidth, totalHeight, 0x101828)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155);
    bg.setScrollFactor(0);
    this.mainActionOptionsContainer.add(bg);
    this.mainActionValues.forEach((value, index) => {
      const label = this.formatActionLabel(value);
      const optionText = this.scene.add
        .text(8, index * itemHeight + 6, label, {
          fontSize: "15px",
          color: "#e2e8f0",
        })
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      optionText.setScrollFactor(0);
      optionText.on("pointerover", () => {
        optionText.setColor("#ffffff");
      });
      optionText.on("pointerout", () => {
        optionText.setColor("#e2e8f0");
      });
      optionText.on("pointerdown", () => {
        this.selectMainAction(value);
      });
      this.mainActionOptionsContainer.add(optionText);
    });
  }

  private selectMainAction(value: string | null) {
    this.mainActionSelectedValue = value;
    const label = this.formatActionLabel(value ?? "None");
    this.mainActionSelectedText.setText(label);
    this.closeMainActionOptions();
  }

  private closeMainActionOptions() {
    this.mainActionOptionsVisible = false;
    this.mainActionOptionsContainer.setVisible(false);
  }

  private formatActionLabel(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "Unknown";
  }
}
