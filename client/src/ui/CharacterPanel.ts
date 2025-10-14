import Phaser from "phaser";
import {
  ActionLibrary,
  type ActionDefinition,
  type ActionId,
  type MatchRecord,
  type PlayerCharacter,
  ActionCategory,
} from "@shared";
import { GridSelect, type GridSelectItem } from "./GridSelect";
import { deriveBoardIconKey, isBoardIconTexture } from "./actionIcons";
import { ProgressBar } from "./ProgressBar";

const DEFAULT_WIDTH = 320;
const TAB_HEIGHT = 40;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 180;
const PRIMARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter((definition) => definition.category === ActionCategory.Primary)
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));

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
  private healthBar: ProgressBar;
  private energyBar: ProgressBar;
  private mainActionBox: Phaser.GameObjects.Rectangle;
  private secondaryActionBox: Phaser.GameObjects.Rectangle;
  private mainActionLabel: Phaser.GameObjects.Text;
  private secondaryActionLabel: Phaser.GameObjects.Text;
  private mainActionDropdown: GridSelect;
  private mainActionDropdownWidth: number;
  private secondaryActionText: Phaser.GameObjects.Text;
  private panelWidth: number;
  private panelHeight: number;
  private barWidth: number;
  private readonly handleMainActionSelection = (
    actionId: string | null,
    item?: GridSelectItem | null
  ) => {
    this.emit("main-action-change", actionId ?? null, item ?? null);
  };

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
    this.healthBar = new ProgressBar(scene, barX, contentTop, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: 0x4ade80,
    });
    this.add(this.healthBar);
    this.energyLabel = scene.add
      .text(barX, contentTop + 32, "Energy", {
        fontSize: "14px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0);
    this.add(this.energyLabel);
    this.energyBar = new ProgressBar(scene, barX, contentTop + 46, {
      width: this.barWidth,
      height: BAR_HEIGHT,
      trackColor: 0x25304c,
      barColor: 0xfacc15,
    });
    this.add(this.energyBar);
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
    this.mainActionDropdown = new GridSelect(
      scene,
      MARGIN + 12,
      mainBoxY + 48,
      {
        width: this.mainActionDropdownWidth,
        title: "Select Main Action",
        placeholder: "Choose action",
        emptyLabel: "Unknown",
        columns: 3,
      }
    );
    this.add(this.mainActionDropdown);
    this.mainActionDropdown.on("change", this.handleMainActionSelection);
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

  override destroy(fromScene?: boolean) {
    this.mainActionDropdown.off("change", this.handleMainActionSelection);
    super.destroy(fromScene);
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
    dropdown.setDisplayWidth(this.mainActionDropdownWidth);
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    const contentTop = TAB_HEIGHT + MARGIN;
    this.healthBar.setPosition(barX, contentTop);
    this.energyBar.setPosition(barX, contentTop + 46);
    this.healthBar.resize(this.barWidth, BAR_HEIGHT);
    this.energyBar.resize(this.barWidth, BAR_HEIGHT);
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
      this.useBarValue(this.healthBar, 0);
      this.useBarValue(this.energyBar, 0);
      this.applyMainActions([]);
      this.secondaryActionText.setText("None selected");
      return;
    }
    this.nameText.setText(playerName ?? character.name);
    const health = character.stats.health;
    const energy = character.stats.energy;
    this.useBarValue(
      this.healthBar,
      health.max === 0 ? 0 : health.current / health.max
    );
    this.useBarValue(
      this.energyBar,
      energy.max === 0 ? 0 : energy.current / energy.max
    );
    const actions = this.collectMainActions(character);
    this.applyMainActions(actions);
    const secondaryId = character.actionPlan?.secondary?.actionId ?? null;
    this.secondaryActionText.setText(
      this.resolveSecondaryActionLabel(secondaryId)
    );
  }

  private useBarValue(bar: ProgressBar, ratio: number) {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    bar.setValue(clamped);
  }

  private applyMainActions(actions: ActionId[]) {
    const items = this.buildMainActionItems(actions);
    const currentValue = this.mainActionDropdown.getValue();
    this.mainActionDropdown.setItems(items);
    const targetId = currentValue ?? items[0]?.id ?? null;
    this.mainActionDropdown.setValue(targetId, false);
    if (!this.mainActionDropdown.getValue() && items[0]) {
      this.mainActionDropdown.setValue(items[0].id, false);
    }
  }

  private collectMainActions(character: PlayerCharacter) {
    const set = new Set<ActionId>();
    const plan = character.actionPlan;
    if (plan?.main?.actionId) set.add(plan.main.actionId as ActionId);
    if (plan?.nextMain?.actionId) set.add(plan.nextMain.actionId as ActionId);
    return Array.from(set);
  }

  private buildMainActionItems(actionIds: ActionId[]): GridSelectItem[] {
    const fallback: (ActionId | string)[] =
      PRIMARY_ACTION_IDS.length > 0
        ? PRIMARY_ACTION_IDS
        : ["move", "punch", "protect"];
    const sourceIds =
      actionIds.length > 0
        ? Array.from(new Set([...actionIds, ...fallback]))
        : fallback;
    return sourceIds.map((id) => this.resolveActionMetadata(id));
  }

  private resolveActionMetadata(actionId: ActionId | string): GridSelectItem {
    const definition = ActionLibrary[actionId as ActionId] ?? null;
    if (definition) {
      const { texture, frame } = this.resolveActionTexture(definition);
      return {
        id: definition.id,
        name: definition.name,
        description: this.describeAction(definition),
        texture,
        frame,
      };
    }
    const fallbackName = this.formatActionName(actionId);
    return {
      id: actionId,
      name: fallbackName,
      description: "Description coming soon.",
      texture: "hex",
      frame: "grass_01.png",
    };
  }

  private formatActionName(id: string) {
    const spaced = id.replace(/[_-]+/g, " ");
    return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
  }

  private resolveSecondaryActionLabel(actionId: string | null) {
    if (!actionId) {
      return "None selected";
    }
    const definition = ActionLibrary[actionId as ActionId];
    if (definition) {
      return definition.name;
    }
    return this.formatActionName(actionId);
  }

  private describeAction(definition: ActionDefinition) {
    if (definition.effects?.length) {
      return definition.effects[0].description;
    }
    if (definition.notes?.length) {
      return definition.notes[0];
    }
    if (definition.requirements?.length) {
      return definition.requirements[0].description;
    }
    return "Description coming soon.";
  }

  private resolveActionTexture(definition: ActionDefinition) {
    if (isBoardIconTexture(definition.texture) && definition.frame) {
      return { texture: deriveBoardIconKey(definition.frame) };
    }
    return { texture: definition.texture, frame: definition.frame };
  }
}
