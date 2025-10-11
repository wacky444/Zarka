import Phaser from "phaser";
import type { MatchRecord, PlayerCharacter } from "@shared";
import { Dropdown } from "./Dropdown";

const DEFAULT_WIDTH = 320;
const TAB_HEIGHT = 40;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 120;
const DEFAULT_MAIN_ACTIONS = ["Move", "Attack", "Guard"]; // TODO change with a list from shared types

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
  private mainActionDropdown: Dropdown;
  private mainActionDropdownWidth: number;
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
    this.mainActionDropdown = new Dropdown(scene, MARGIN + 12, mainBoxY + 48, {
      width: this.mainActionDropdownWidth,
      placeholder: "Loading...",
      emptyLabel: "Unknown",
      listMaxHeight: 200,
      depth: 20,
    });
    this.add(this.mainActionDropdown);
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
    this.bringToTop(this.mainActionDropdown);
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
    const dropdown = this.mainActionDropdown;
    const dropdownY = this.nameText.y + this.nameText.height + 12 + 48;
    dropdown.setPosition(MARGIN + 12, dropdownY);
    dropdown.setDropdownWidth(this.mainActionDropdownWidth);
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
    this.applyMainActions(actions.length > 0 ? actions : DEFAULT_MAIN_ACTIONS);
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
    const values = actions.length > 0 ? actions : DEFAULT_MAIN_ACTIONS;
    this.mainActionDropdown.setOptions(values);
    const current = values[0] ?? "";
    this.mainActionDropdown.setValue(current);
  }

  private collectMainActions(character: PlayerCharacter) {
    const set = new Set<string>();
    const plan = character.actionPlan;
    if (plan?.main?.actionId) set.add(plan.main.actionId);
    if (plan?.nextMain?.actionId) set.add(plan.nextMain.actionId);
    return Array.from(set);
  }
}
