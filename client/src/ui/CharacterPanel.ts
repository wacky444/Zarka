import Phaser from "phaser";
import {
  ActionLibrary,
  type ActionDefinition,
  type ActionId,
  type Axial,
  type MatchRecord,
  type PlayerCharacter,
  ActionCategory,
} from "@shared";
import { GridSelect, type GridSelectItem } from "./GridSelect";
import { deriveBoardIconKey, isBoardIconTexture } from "./actionIcons";
import { ProgressBar } from "./ProgressBar";
import { LocationSelector } from "./LocationSelector";

const DEFAULT_WIDTH = 420;
const TAB_HEIGHT = 40;
const MARGIN = 16;
const PORTRAIT_SIZE = 96;
const BAR_HEIGHT = 20;
const BOX_HEIGHT = 180;
const PRIMARY_ACTION_IDS: ActionId[] = Object.values(ActionLibrary)
  .filter((definition) => definition.category === ActionCategory.Primary)
  .map((definition) => definition.id)
  .sort((a, b) => ActionLibrary[a].name.localeCompare(ActionLibrary[b].name));

export type MainActionSelection = {
  actionId: string | null;
  targetLocation: Axial | null;
};

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
  private readyToggle!: Phaser.GameObjects.Text;
  private mainActionBox: Phaser.GameObjects.Rectangle;
  private secondaryActionBox: Phaser.GameObjects.Rectangle;
  private mainActionLabel: Phaser.GameObjects.Text;
  private secondaryActionLabel: Phaser.GameObjects.Text;
  private mainActionDropdown: GridSelect;
  private mainActionDropdownWidth: number;
  private locationSelector: LocationSelector;
  private secondaryActionText: Phaser.GameObjects.Text;
  private panelWidth: number;
  private panelHeight: number;
  private barWidth: number;
  private mainActionSelection: string | null = null;
  private mainActionTarget: Axial | null = null;
  private lastMainActionItem: GridSelectItem | null = null;
  private readyState = false;
  private readyEnabled = false;
  private readonly handleMainActionSelection = (actionId: string | null) => {
    this.mainActionSelection = actionId ?? null;
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    if (!this.mainActionSelection) {
      this.setMainActionTarget(null, false);
    }
    this.refreshLocationSelectorState();
    this.emitMainActionChange();
  };
  private readonly handleLocationPickRequest = () => {
    if (!this.mainActionSelection || !this.selectedActionSupportsLocation()) {
      return;
    }
    this.emit("main-action-location-request");
  };
  private readonly handleLocationClear = () => {
    this.setMainActionTarget(null, true);
  };
  private readonly handleReadyToggle = () => {
    if (!this.readyEnabled) {
      return;
    }
    this.setReadyState(!this.readyState, true);
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
    const readyY = contentTop + 80;
    this.readyToggle = scene.add
      .text(barX, readyY, "[ ] Ready", {
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.readyToggle.setInteractive({ useHandCursor: true });
    this.readyToggle.on("pointerup", this.handleReadyToggle);
    this.add(this.readyToggle);
    this.setReadyEnabled(false);
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
    const locationY = mainBoxY + 48 + this.mainActionDropdown.height + 12;
    this.locationSelector = new LocationSelector(
      scene,
      MARGIN + 12,
      locationY,
      this.mainActionDropdownWidth
    );
    this.locationSelector.setEnabled(false);
    this.locationSelector.setVisible(false);
    this.locationSelector.setActive(false);
    this.locationSelector.on("pick-request", this.handleLocationPickRequest);
    this.locationSelector.on("clear-request", this.handleLocationClear);
    this.add(this.locationSelector);
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
    this.locationSelector.off("pick-request", this.handleLocationPickRequest);
    this.locationSelector.off("clear-request", this.handleLocationClear);
    this.readyToggle?.off("pointerup", this.handleReadyToggle);
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
    const locationY = dropdownY + dropdown.height + 12;
    this.locationSelector.setPosition(MARGIN + 12, locationY);
    this.locationSelector.setSelectorWidth(this.mainActionDropdownWidth);
    const barX = MARGIN * 2 + PORTRAIT_SIZE;
    const contentTop = TAB_HEIGHT + MARGIN;
    this.healthBar.setPosition(barX, contentTop);
    this.energyBar.setPosition(barX, contentTop + 46);
    this.healthBar.resize(this.barWidth, BAR_HEIGHT);
    this.energyBar.resize(this.barWidth, BAR_HEIGHT);
    if (this.readyToggle) {
      this.readyToggle.setPosition(barX, contentTop + 80);
    }
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
      this.applyCharacter(null, null, false);
      return;
    }
    const characters = match.playerCharacters ?? {};
    const character = characters[currentUserId] ?? null;
    const name = usernames?.[currentUserId] ?? null;
    const ready = match.readyStates?.[currentUserId] ?? false;
    this.applyCharacter(character, name, ready);
  }

  private applyCharacter(
    character: PlayerCharacter | null,
    playerName: string | null,
    ready: boolean
  ) {
    if (!character) {
      this.nameText.setText("No character");
      this.useBarValue(this.healthBar, 0);
      this.useBarValue(this.energyBar, 0);
      this.applyMainActions([], null);
      this.setMainActionTarget(null, false);
      this.setLocationSelectionPending(false);
      this.secondaryActionText.setText("None selected");
      this.setReadyEnabled(false);
      this.setReadyState(false, false);
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
    const mainActionId = character.actionPlan?.main?.actionId ?? null;
    this.applyMainActions(actions, mainActionId);
    const targetLocation = character.actionPlan?.main?.targetLocationId ?? null;
    this.setMainActionTarget(targetLocation ?? null, false);
    this.setLocationSelectionPending(false);
    const secondaryId = character.actionPlan?.secondary?.actionId ?? null;
    this.secondaryActionText.setText(
      this.resolveSecondaryActionLabel(secondaryId)
    );
    this.setReadyEnabled(true);
    this.setReadyState(ready, false);
  }

  private useBarValue(bar: ProgressBar, ratio: number) {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    bar.setValue(clamped);
  }

  setReadyState(ready: boolean, emit = false): boolean {
    const normalized = !!ready;
    const changed = this.readyState !== normalized;
    this.readyState = normalized;
    if (this.readyToggle) {
      this.readyToggle.setText(normalized ? "[x] Ready" : "[ ] Ready");
    }
    if (emit && changed) {
      this.emit("ready-change", normalized);
    }
    return changed;
  }

  getReadyState(): boolean {
    return this.readyState;
  }

  private setReadyEnabled(enabled: boolean) {
    this.readyEnabled = enabled;
    if (!this.readyToggle) {
      return;
    }
    if (enabled) {
      this.readyToggle.setAlpha(1);
      this.readyToggle.setInteractive({ useHandCursor: true });
    } else {
      this.readyToggle.setAlpha(0.5);
      this.readyToggle.disableInteractive();
    }
  }

  private applyMainActions(actions: ActionId[], preferredId: string | null) {
    const items = this.buildMainActionItems(actions);
    this.mainActionDropdown.setItems(items);
    if (preferredId) {
      this.mainActionDropdown.setValue(preferredId, false);
      if (!this.mainActionDropdown.getValue() && items[0]) {
        this.mainActionDropdown.setValue(items[0].id, false);
      }
    } else if (!this.mainActionDropdown.getValue() && items[0]) {
      this.mainActionDropdown.setValue(items[0].id, false);
    }
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    this.mainActionSelection = this.mainActionDropdown.getValue();
    if (!this.mainActionSelection) {
      this.setMainActionTarget(null, false);
    }
    this.refreshLocationSelectorState();
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
        tags: definition.tags,
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

  private refreshLocationSelectorState() {
    this.lastMainActionItem = this.mainActionDropdown.getSelectedItem() ?? null;
    const supports = this.selectedActionSupportsLocation();
    this.locationSelector.setVisible(supports);
    this.locationSelector.setActive(supports);
    if (!supports) {
      if (this.mainActionTarget !== null) {
        this.mainActionTarget = null;
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setEnabled(false);
      this.locationSelector.setPending(false);
      return;
    }
    const hasSelection = this.mainActionSelection !== null;
    this.locationSelector.setEnabled(hasSelection);
    if (!hasSelection) {
      this.locationSelector.setPending(false);
    }
  }

  private selectedActionSupportsLocation() {
    return this.lastMainActionItem?.tags?.includes("Ranged") ?? false;
  }

  private emitMainActionChange() {
    const supports = this.selectedActionSupportsLocation();
    const payload: MainActionSelection = {
      actionId: this.mainActionSelection,
      targetLocation:
        supports && this.mainActionTarget
          ? { q: this.mainActionTarget.q, r: this.mainActionTarget.r }
          : null,
    };
    this.emit("main-action-change", payload);
  }

  setMainActionTarget(target: Axial | null, emit = false): boolean {
    const supports = this.selectedActionSupportsLocation();
    if (!supports) {
      const changed = this.mainActionTarget !== null;
      if (changed) {
        this.mainActionTarget = null;
      }
      this.locationSelector.setValue(null);
      this.locationSelector.setPending(false);
      if (emit && changed) {
        this.emitMainActionChange();
      }
      return changed;
    }
    const normalized = this.normalizeAxial(target);
    if (this.isSameAxial(normalized, this.mainActionTarget)) {
      return false;
    }
    this.mainActionTarget = normalized;
    this.locationSelector.setValue(
      normalized ? { q: normalized.q, r: normalized.r } : null
    );
    if (!normalized) {
      this.locationSelector.setPending(false);
    }
    if (emit) {
      this.emitMainActionChange();
    }
    return true;
  }

  getMainActionSelection(): MainActionSelection {
    const supports = this.selectedActionSupportsLocation();
    return {
      actionId: this.mainActionSelection,
      targetLocation:
        supports && this.mainActionTarget
          ? { q: this.mainActionTarget.q, r: this.mainActionTarget.r }
          : null,
    };
  }

  setLocationSelectionPending(active: boolean): void {
    if (!this.selectedActionSupportsLocation()) {
      this.locationSelector.setPending(false);
      return;
    }
    this.locationSelector.setPending(active);
  }

  private normalizeAxial(target: Axial | null): Axial | null {
    if (!target) {
      return null;
    }
    const q = typeof target.q === "number" ? target.q : Number(target.q);
    const r = typeof target.r === "number" ? target.r : Number(target.r);
    if (Number.isNaN(q) || Number.isNaN(r)) {
      return null;
    }
    return { q, r };
  }

  private isSameAxial(a: Axial | null, b: Axial | null) {
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.q === b.q && a.r === b.r;
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
