import Phaser from "phaser";
import { t } from "../services/i18n";
import {
  SkillLibrary,
  type PlayerCharacter,
  type SkillCategory,
  type SkillDefinition,
  type SkillId
} from "@shared";
import { Subtabs } from "./Subtabs";
import { THEME } from "./ColorPalette";
import { getTutorialSkillHighlights } from "../tutorial/TutorialUiPolicy";

export interface CharacterPanelSkillsViewLayout {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
}

interface SkillCardItem {
  skill: SkillDefinition;
  cardBg: Phaser.GameObjects.Rectangle;
  rankText: Phaser.GameObjects.Text;
  statusBadge: Phaser.GameObjects.Text;
  upgradeBtnBg: Phaser.GameObjects.Rectangle;
  upgradeBtnText: Phaser.GameObjects.Text;
  decrementBtnBg: Phaser.GameObjects.Rectangle;
  decrementBtnText: Phaser.GameObjects.Text;
}

type ScrollablePanelInstance = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMouseWheelScrollerEnable?: (enabled: boolean) => void;
  mouseWheelScrollerEnable?: boolean;
  setScrollerEnable?: (enabled: boolean) => void;
  scrollerEnable?: boolean;
  setScrollFactor?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setVisible?: (value: boolean) => Phaser.GameObjects.GameObject;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setOrigin?: (x: number, y?: number) => Phaser.GameObjects.GameObject;
  setPosition?: (x: number, y: number) => Phaser.GameObjects.GameObject;
  setMask?: (
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
  addChildOY?: (inc: number, clamp?: boolean) => void;
  childOY?: number;
  t?: number;
};

const HEADER_HEIGHT = 72;
const CARD_PADDING = 12;
const CARD_SPACING = 8;

export class CharacterPanelSkillsView {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly headerBox: Phaser.GameObjects.Rectangle;
  private readonly unspentPointsLabel: Phaser.GameObjects.Text;
  private readonly experienceLabel: Phaser.GameObjects.Text;
  private readonly revertBtnBg: Phaser.GameObjects.Rectangle;
  private readonly revertBtnText: Phaser.GameObjects.Text;
  private readonly confirmBtnBg: Phaser.GameObjects.Rectangle;
  private readonly confirmBtnText: Phaser.GameObjects.Text;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private readonly categoryTabs: Subtabs<SkillCategory>;
  private activeCategory: SkillCategory = "offensive";
  private skillCardWidth = 0;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private readonly elements: Phaser.GameObjects.GameObject[] = [];
  private readonly cardElements: Phaser.GameObjects.GameObject[] = [];
  private readonly cardItems: SkillCardItem[] = [];
  private currentCharacter: PlayerCharacter | null = null;
  private pendingUpgrades: SkillId[] = [];
  private allowedSkillIds: ReadonlySet<SkillId> | null = null;
  private tutorialChooseSkillsMode = false;
  private confirmBtnHighlighted = false;
  private onConfirmSkills?: (skillIds: SkillId[]) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    layout: CharacterPanelSkillsViewLayout
  ) {
    const startY = layout.contentTop;
    const width = layout.boxWidth;
    const height = Math.max(180, layout.panelHeight - startY - layout.margin);

    this.background = scene.add
      .rectangle(layout.margin, startY, width, height, THEME.colors.panelBackground)
      .setOrigin(0, 0)
      .setVisible(false);
    this.background.setStrokeStyle?.(1, THEME.colors.panelBorder, 0.8);
    parent.add(this.background);

    const headerY = startY + 8;
    const headerWidth = width - 24;
    this.headerBox = scene.add
      .rectangle(
        layout.margin + 12,
        headerY,
        headerWidth,
        HEADER_HEIGHT,
        THEME.colors.headerBackground,
        0.95
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.headerBox.setStrokeStyle?.(1, THEME.colors.headerBorder, 0.9);
    parent.add(this.headerBox);

    this.unspentPointsLabel = scene.add
      .text(
        layout.margin + 12,
        headerY + 18,
        "Available Skill: 0",
        {
          fontSize: "15px",
          color: THEME.colors.zarkanGold
        }
      )
      .setOrigin(0, 0.5)
      .setVisible(false);
    parent.add(this.unspentPointsLabel);

    this.experienceLabel = scene.add.text(
      layout.margin + 12,
      headerY + 50,
      "Experience: 0 / 10 · Level 1",
      { fontSize: "13px", color: THEME.colors.experienceText }
    ).setOrigin(0, 0.5).setVisible(false);
    parent.add(this.experienceLabel);

    const btnHeight = 26;
    const confirmBtnWidth = 70;
    const revertBtnWidth = 64;
    const headerRight = layout.margin + 12 + headerWidth - 10;
    const confirmBtnX = headerRight - confirmBtnWidth;
    const confirmBtnY = headerY + 6;
    const revertBtnX = confirmBtnX - 8 - revertBtnWidth;
    const revertBtnY = confirmBtnY;

    this.revertBtnBg = scene.add
      .rectangle(
        revertBtnX,
        revertBtnY,
        revertBtnWidth,
        btnHeight,
        THEME.colors.buttonDisabledBackground,
        0.5
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.revertBtnBg.setStrokeStyle?.(1, THEME.colors.buttonRevertBorder, 0.8);
    parent.add(this.revertBtnBg);

    this.revertBtnText = scene.add
      .text(
        revertBtnX + revertBtnWidth / 2,
        revertBtnY + btnHeight / 2,
        "Revert",
        {
          fontSize: "12px",
          color: THEME.colors.textPrimary,
          fontStyle: "bold"
        }
      )
      .setOrigin(0.5, 0.5)
      .setAlpha(0.4)
      .setVisible(false);
    parent.add(this.revertBtnText);

    this.confirmBtnBg = scene.add
      .rectangle(
        confirmBtnX,
        confirmBtnY,
        confirmBtnWidth,
        btnHeight,
        THEME.colors.buttonDisabledBackground,
        0.5
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.confirmBtnBg.setStrokeStyle?.(1, THEME.colors.buttonConfirmBorder, 0.8);
    parent.add(this.confirmBtnBg);

    this.confirmBtnText = scene.add
      .text(
        confirmBtnX + confirmBtnWidth / 2,
        confirmBtnY + btnHeight / 2,
        "Confirm",
        {
          fontSize: "12px",
          color: THEME.colors.textPrimary,
          fontStyle: "bold"
        }
      )
      .setOrigin(0.5, 0.5)
      .setAlpha(0.4)
      .setVisible(false);
    parent.add(this.confirmBtnText);

    this.revertBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.revertBtnBg.input?.enabled) {
        this.revertBtnBg.setFillStyle(THEME.colors.buttonRevertHover);
      }
    });
    this.revertBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.revertBtnBg.input?.enabled) {
        this.revertBtnBg.setFillStyle(THEME.colors.buttonRevertFill);
      }
    });
    this.revertBtnBg.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );
    this.revertBtnBg.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (this.revertBtnBg.input?.enabled) {
          this.pendingUpgrades = [];
          this.refreshView();
        }
      }
    );

    this.confirmBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.confirmBtnBg.input?.enabled) {
        this.confirmBtnBg.setFillStyle(THEME.colors.buttonConfirmHover);
      }
    });
    this.confirmBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.confirmBtnBg.input?.enabled) {
        this.confirmBtnBg.setFillStyle(THEME.colors.buttonConfirmFill);
      }
    });
    this.confirmBtnBg.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
      }
    );
    this.confirmBtnBg.on(
      Phaser.Input.Events.POINTER_UP,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (
          this.confirmBtnBg.input?.enabled &&
          this.pendingUpgrades.length > 0
        ) {
          const toApply = [...this.pendingUpgrades];
          this.setButtonsEnabled(false);
          this.onConfirmSkills?.(toApply);
        }
      }
    );

    const categoryTabsTop = headerY + HEADER_HEIGHT + 6;
    this.categoryTabs = new Subtabs<SkillCategory>({
      scene,
      parent,
      x: layout.margin + 12,
      y: categoryTabsTop,
      width: headerWidth,
      tabs: [
        { key: "offensive", label: t("Offensive") },
        { key: "defense", label: t("Defense") },
        { key: "utility", label: t("Utility") },
        { key: "npc", label: t("NPC") }
      ],
      defaultKey: this.activeCategory,
      onChange: (key) => {
        this.activeCategory = key;
        this.rebuildSkillList();
      }
    });

    const listTop = categoryTabsTop + 36;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - startY) - 8);
    this.skillCardWidth = listWidth - 8;

    const matrix = parent.getWorldTransformMatrix();
    const worldX = matrix.tx + layout.margin + 12;
    const worldY = matrix.ty + listTop;

    this.scrollMaskShape = scene.add
      .rectangle(worldX, worldY, listWidth, listHeight, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.scrollMask = this.scrollMaskShape.createGeometryMask();

    this.scrollContent = scene.add.container(0, 0);

    this.scrollPanel = scene.rexUI.add.scrollablePanel({
      x: layout.margin + 12,
      y: listTop,
      width: listWidth,
      height: listHeight,
      scrollMode: 0,
      panel: {
        child: this.scrollContent,
        mask: false
      },
      slider: {
        track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 2, THEME.colors.loadingTrack),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 6, 36, 3, THEME.colors.loadingFill)
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: {
        focus: 2,
        speed: 0.35
      },
      space: { left: 0, right: 2, top: 0, bottom: 0, panel: 6 }
    }) as ScrollablePanelInstance;
    this.scrollPanel.setOrigin?.(0, 0);
    this.scrollPanel.setScrollFactor?.(0);
    const rawScrollPanel = this.scrollPanel as unknown as {
      childrenMap?: {
        scrollableBlock?: { setScrollFactor?: (x: number, y?: number) => void; scrollFactorX?: number; scrollFactorY?: number };
        child?: { setScrollFactor?: (x: number, y?: number) => void; scrollFactorX?: number; scrollFactorY?: number };
      };
    };
    if (rawScrollPanel?.childrenMap?.scrollableBlock) {
      rawScrollPanel.childrenMap.scrollableBlock.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorX = 0;
      rawScrollPanel.childrenMap.scrollableBlock.scrollFactorY = 0;
    }
    if (rawScrollPanel?.childrenMap?.child) {
      rawScrollPanel.childrenMap.child.setScrollFactor?.(0);
      rawScrollPanel.childrenMap.child.scrollFactorX = 0;
      rawScrollPanel.childrenMap.child.scrollFactorY = 0;
    }
    this.scrollContent.setScrollFactor(0);
    if (this.scrollMask) {
      this.scrollPanel.setMask?.(this.scrollMask);
    }
    this.scrollPanel.setVisible?.(false);
    this.categoryTabs.setVisible(false);
    parent.add(this.scrollPanel);
    this.categoryTabs.bringToTop();
    parent.bringToTop(this.revertBtnBg);
    parent.bringToTop(this.revertBtnText);
    parent.bringToTop(this.confirmBtnBg);
    parent.bringToTop(this.confirmBtnText);

    this.buildSkillList(this.skillCardWidth);

    this.elements = [
      this.background,
      this.headerBox,
      this.unspentPointsLabel,
      this.experienceLabel,
      this.revertBtnBg,
      this.revertBtnText,
      this.confirmBtnBg,
      this.confirmBtnText,
      this.scrollPanel
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setVisible(visible: boolean): void {
    this.background.setVisible(visible);
    this.headerBox.setVisible(visible);
    this.categoryTabs.setVisible(visible);
    this.unspentPointsLabel.setVisible(visible);
    this.experienceLabel.setVisible(visible);
    this.revertBtnBg.setVisible(visible);
    this.revertBtnText.setVisible(visible);
    this.confirmBtnBg.setVisible(visible);
    this.confirmBtnText.setVisible(visible);
    this.scrollPanel.setVisible?.(visible);
    this.scrollPanel.setMouseWheelScrollerEnable?.(visible);
    this.scrollPanel.setScrollerEnable?.(visible);
    this.categoryTabs.bringToTop();
    if (visible) {
      this.refreshTutorialHighlights();
    }
  }

  setScrollerEnable(enabled: boolean): void {
    this.scrollPanel.setMouseWheelScrollerEnable?.(enabled);
    this.scrollPanel.setScrollerEnable?.(enabled);
  }

  setOnConfirmSkills(callback: (skillIds: SkillId[]) => void): void {
    this.onConfirmSkills = callback;
  }

  getHighlightedCategory(): SkillCategory | null {
    return this.categoryTabs.getHighlightedKey();
  }

  isConfirmButtonHighlighted(): boolean {
    return this.confirmBtnHighlighted;
  }

  getHighlightedTarget(): Phaser.GameObjects.GameObject | null {
    if (this.categoryTabs.getHighlightedKey()) {
      const tabTarget = this.categoryTabs.getHighlightedTarget();
      if (tabTarget && tabTarget.visible) {
        return tabTarget;
      }
    }
    if (this.confirmBtnHighlighted && this.confirmBtnBg.visible) {
      return this.confirmBtnBg;
    }
    for (const item of this.cardItems) {
      if (item.upgradeBtnBg.isStroked && item.upgradeBtnBg.visible) {
        return item.upgradeBtnBg;
      }
    }
    return null;
  }

  isSkillUpgradeHighlighted(skillId: SkillId): boolean {
    const item = this.cardItems.find((card) => card.skill.id === skillId);
    return item?.upgradeBtnBg.isStroked ?? false;
  }

  setTutorialSkillPolicy(
    skillIds: readonly SkillId[] | null,
    isTutorialChooseSkills: boolean
  ): void {
    const next = skillIds ? new Set(skillIds) : null;
    const allowedChanged =
      this.allowedSkillIds?.size !== next?.size ||
      (this.allowedSkillIds !== null &&
        ![...this.allowedSkillIds].every((id) => next?.has(id)));
    const tutorialChanged =
      this.tutorialChooseSkillsMode !== isTutorialChooseSkills;

    this.allowedSkillIds = next;
    this.tutorialChooseSkillsMode = isTutorialChooseSkills;

    if (allowedChanged) {
      this.rebuildSkillList();
    } else if (tutorialChanged) {
      this.refreshTutorialHighlights();
    }
  }

  setAllowedSkillIds(skillIds: readonly SkillId[] | null): void {
    this.setTutorialSkillPolicy(skillIds, false);
  }

  setHighlightedCategory(category: SkillCategory | null): void {
    this.categoryTabs.setHighlightedKey(category);
  }

  update(character: PlayerCharacter | null): void {
    this.currentCharacter = character;
    this.pendingUpgrades = [];
    this.refreshView();
  }

  private calculatePendingCost(): number {
    let cost = 0;
    for (const id of this.pendingUpgrades) {
      const def = SkillLibrary[id];
      if (def) {
        cost += def.cost;
      }
    }
    return cost;
  }

  private setButtonsEnabled(enabled: boolean): void {
    if (enabled) {
      this.revertBtnBg.setFillStyle(THEME.colors.buttonRevertFill, 1);
      this.revertBtnBg.setInteractive({ useHandCursor: true });
      this.revertBtnText.setAlpha(1);

      this.confirmBtnBg.setFillStyle(THEME.colors.buttonConfirmFill, 1);
      this.confirmBtnBg.setInteractive({ useHandCursor: true });
      this.confirmBtnText.setAlpha(1);
    } else {
      this.revertBtnBg.setFillStyle(THEME.colors.buttonDisabledBackground, 0.5);
      this.revertBtnBg.disableInteractive();
      this.revertBtnText.setAlpha(0.4);

      this.confirmBtnBg.setFillStyle(THEME.colors.buttonDisabledBackground, 0.5);
      this.confirmBtnBg.disableInteractive();
      this.confirmBtnText.setAlpha(0.4);
    }
  }

  private refreshView(): void {
    const committedPoints =
      this.currentCharacter?.progression?.availableSkillPoints ?? 0;
    const spentPending = this.calculatePendingCost();
    const effectivePoints = committedPoints - spentPending;

    if (this.pendingUpgrades.length > 0) {
      this.unspentPointsLabel.setText(
        t(`Available Skill: ${effectivePoints} (-${spentPending})`)
      );
      this.setButtonsEnabled(true);
    } else {
      this.unspentPointsLabel.setText(t(`Available Skill: ${committedPoints}`));
      this.setButtonsEnabled(false);
    }
    const progression = this.currentCharacter?.progression;
    const experience = Math.max(0, progression?.experience ?? 0);
    const experienceForNextLevel = Math.max(0, progression?.experienceForNextLevel ?? 0);
    const level = Math.max(1, progression?.level ?? 1);
    this.experienceLabel.setText(
      experienceForNextLevel > 0
        ? `${t("Experience:")} ${experience}/${experienceForNextLevel} · ${t("Level")} ${level}`
        : `${t("Experience:")} ${experience} · ${t("Level")} ${level}`
    );

    const committedAbilities = this.currentCharacter?.abilities ?? [];

    for (const item of this.cardItems) {
      const committedRank = committedAbilities.filter(
        (id) => id === item.skill.id
      ).length;
      const hasInvestedRank = committedRank > 0;
      item.cardBg.setStrokeStyle(
        hasInvestedRank ? 2 : 1,
        hasInvestedRank ? THEME.colors.healthAccent : THEME.colors.skillCardBorder,
        hasInvestedRank ? 1 : 0.9
      );

      if (!item.skill.implemented) {
        item.statusBadge.setText(t("Not Implemented"));
        item.statusBadge.setColor(THEME.colors.cooldown);
        item.statusBadge.setVisible(true);
        item.rankText.setVisible(false);
        item.upgradeBtnBg.setVisible(false);
        item.upgradeBtnBg.disableInteractive();
        item.upgradeBtnText.setVisible(false);
        item.decrementBtnBg.setVisible(false);
        item.decrementBtnBg.disableInteractive();
        item.decrementBtnText.setVisible(false);
        continue;
      }

      const pendingRank = this.pendingUpgrades.filter(
        (id) => id === item.skill.id
      ).length;
      const totalRank = committedRank + pendingRank;

      if (pendingRank > 0) {
        item.rankText.setText(
          `Rank: ${committedRank} (+${pendingRank})/${item.skill.max}`
        );
        item.decrementBtnBg.setVisible(true);
        item.decrementBtnBg.setInteractive({ useHandCursor: true });
        item.decrementBtnText.setVisible(true);
      } else {
        item.rankText.setText(`Rank: ${committedRank}/${item.skill.max}`);
        item.decrementBtnBg.setVisible(false);
        item.decrementBtnBg.disableInteractive();
        item.decrementBtnText.setVisible(false);
      }
      item.rankText.setVisible(true);

      if (totalRank >= item.skill.max) {
        item.statusBadge.setText("MAX");
        item.statusBadge.setColor(THEME.colors.zarkanGold);
        item.statusBadge.setVisible(true);
        item.upgradeBtnBg.setVisible(false);
        item.upgradeBtnBg.disableInteractive();
        item.upgradeBtnText.setVisible(false);
      } else {
        item.statusBadge.setVisible(false);
        item.upgradeBtnBg.setVisible(true);
        item.upgradeBtnText.setVisible(true);

        const canAfford = effectivePoints >= item.skill.cost;
        if (canAfford) {
          item.upgradeBtnBg.setFillStyle(THEME.colors.buttonConfirmFill, 1);
          item.upgradeBtnBg.setInteractive({ useHandCursor: true });
          item.upgradeBtnText.setAlpha(1);
        } else {
          item.upgradeBtnBg.setFillStyle(THEME.colors.buttonDisabledBackground, 0.6);
          item.upgradeBtnBg.disableInteractive();
          item.upgradeBtnText.setAlpha(0.6);
        }
      }
    }
    this.refreshTutorialHighlights();
  }

  private refreshTutorialHighlights(): void {
    const highlights = getTutorialSkillHighlights({
      isTutorialChooseSkills: this.tutorialChooseSkillsMode,
      pendingUpgrades: this.pendingUpgrades,
      abilities: this.currentCharacter?.abilities
    });

    this.categoryTabs.setHighlightedKey(highlights.highlightedCategory);
    this.confirmBtnHighlighted = highlights.confirmHighlighted;
    if (this.confirmBtnHighlighted) {
      this.confirmBtnBg.setStrokeStyle(3, THEME.colors.tutorialHighlight, 1);
    } else {
      this.confirmBtnBg.setStrokeStyle(1, THEME.colors.buttonConfirmBorder, 0.8);
    }

    for (const item of this.cardItems) {
      const isStrength2Highlighted =
        item.skill.id === "strength2" && highlights.highlightStrength2Upgrade;
      const isVitalityHighlighted =
        item.skill.id === "vitality" && highlights.highlightVitalityUpgrade;
      if (isStrength2Highlighted || isVitalityHighlighted) {
        item.upgradeBtnBg.setStrokeStyle(3, THEME.colors.tutorialHighlight, 1);
      } else {
        item.upgradeBtnBg.setStrokeStyle();
      }
    }
  }

  layout(options: CharacterPanelSkillsViewLayout): void {
    const startY = options.contentTop;
    const width = options.boxWidth;
    const height = Math.max(180, options.panelHeight - startY - options.margin);

    this.background.setPosition(options.margin, startY);
    this.background.setSize(width, height);
    this.background.setDisplaySize(width, height);

    const headerY = startY + 8;
    const headerWidth = width - 24;
    this.headerBox.setPosition(options.margin + 12, headerY);
    this.headerBox.setSize(headerWidth, HEADER_HEIGHT);
    this.headerBox.setDisplaySize(headerWidth, HEADER_HEIGHT);

    this.unspentPointsLabel.setPosition(
      options.margin + 12,
      headerY + 18
    );
    this.experienceLabel.setPosition(
      options.margin + 12,
      headerY + 50
    );

    const btnHeight = 26;
    const confirmBtnWidth = 70;
    const revertBtnWidth = 64;
    const headerRight = options.margin + 12 + headerWidth - 10;
    const confirmBtnX = headerRight - confirmBtnWidth;
    const confirmBtnY = headerY + (HEADER_HEIGHT - btnHeight) / 2;
    const revertBtnX = confirmBtnX - 8 - revertBtnWidth;
    const revertBtnY = confirmBtnY;

    this.revertBtnBg.setPosition(revertBtnX, revertBtnY);
    this.revertBtnText.setPosition(
      revertBtnX + revertBtnWidth / 2,
      revertBtnY + btnHeight / 2
    );
    this.confirmBtnBg.setPosition(confirmBtnX, confirmBtnY);
    this.confirmBtnText.setPosition(
      confirmBtnX + confirmBtnWidth / 2,
      confirmBtnY + btnHeight / 2
    );

    const categoryTabsTop = headerY + HEADER_HEIGHT + 6;
    const listTop = categoryTabsTop + 36;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - startY) - 8);

    this.categoryTabs.layout(
      options.margin + 12,
      categoryTabsTop,
      headerWidth,
      28
    );

    const matrix = this.parent.getWorldTransformMatrix();
    const worldX = matrix.tx + options.margin + 12;
    const worldY = matrix.ty + listTop;

    if (this.scrollMaskShape) {
      this.scrollMaskShape.setPosition(worldX, worldY);
      this.scrollMaskShape.setSize(listWidth, listHeight);
    }

    this.scrollPanel.setPosition?.(options.margin + 12, listTop);
    this.scrollPanel.setSize?.(listWidth, listHeight);
    this.scrollPanel.setMinSize?.(listWidth, listHeight);
    const nextCardWidth = Math.max(0, listWidth - 8);
    if (this.skillCardWidth !== nextCardWidth) {
      this.skillCardWidth = nextCardWidth;
      this.rebuildSkillList();
    } else {
      this.scrollPanel.layout?.();
    }
    this.categoryTabs.bringToTop();
  }

  destroy(): void {
    this.categoryTabs.destroy();
    this.scrollPanel.clearMask?.();
    this.scrollMask?.destroy();
    this.scrollMaskShape?.destroy();
    this.scrollMask = null;
    this.scrollMaskShape = null;

    this.cardItems.length = 0;
    this.pendingUpgrades.length = 0;
    this.currentCharacter = null;

    for (const el of this.cardElements) {
      el.destroy();
    }
    this.cardElements.length = 0;

    for (const child of [...this.scrollContent.list]) {
      child.destroy();
    }
    this.scrollContent.removeAll(false);

    for (const el of this.elements) {
      el.destroy();
    }
    this.elements.length = 0;
  }

  private buildSkillList(cardWidth: number): void {
    const skills = Object.values(SkillLibrary).filter(
      (skill) =>
        skill.category === this.activeCategory &&
        (!this.allowedSkillIds || this.allowedSkillIds.has(skill.id))
    );
    let currentY = 0;

    for (const skill of skills) {
      currentY +=
        this.createSkillCard(skill, currentY, cardWidth) + CARD_SPACING;
    }

    this.scrollContent.setSize(cardWidth, currentY);
    this.scrollPanel.layout?.();
  }

  private rebuildSkillList(): void {
    for (const element of this.cardElements) {
      element.destroy();
    }
    this.cardElements.length = 0;
    this.cardItems.length = 0;
    this.scrollContent.removeAll(false);
    this.buildSkillList(this.skillCardWidth);
    this.refreshView();
  }

  private createSkillCard(
    skill: SkillDefinition,
    startY: number,
    cardWidth: number
  ): number {
    const textWidth = cardWidth - CARD_PADDING * 2;

    const descText = this.scene.add
      .text(CARD_PADDING, startY + 54, skill.description, {
        fontSize: "13px",
        color: THEME.colors.modalText,
        wordWrap: { width: textWidth, useAdvancedWrap: true },
        lineSpacing: 3
      })
      .setOrigin(0, 0);

    const cardHeight = Math.max(82, 54 + descText.height + CARD_PADDING);

    const cardBg = this.scene.add
      .rectangle(0, startY, cardWidth, cardHeight, THEME.colors.skillCardBackground, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, THEME.colors.skillCardBorder, 0.9)
      .setInteractive({ useHandCursor: false });

    const nameText = this.scene.add
      .text(CARD_PADDING, startY + 8, skill.name, {
        fontSize: "15px",
        color: THEME.colors.textPrimary,
        fontStyle: "bold"
      })
      .setOrigin(0, 0);

    const costText = this.scene.add
      .text(cardWidth - CARD_PADDING, startY + 8, `Cost: ${skill.cost} SP`, {
        fontSize: "12px",
        color: THEME.colors.zarkanGold
      })
      .setOrigin(1, 0);

    const btnWidth = 72;
    const btnHeight = 20;
    const btnX = cardWidth - CARD_PADDING - btnWidth;
    const btnY = startY + 26;

    const upgradeBtnBg = this.scene.add
      .rectangle(btnX, btnY, btnWidth, btnHeight, THEME.colors.buttonConfirmFill, 1)
      .setOrigin(0, 0)
      .setVisible(skill.implemented);

    const upgradeBtnText = this.scene.add
      .text(btnX + btnWidth / 2, btnY + btnHeight / 2, "+ Upgrade", {
        fontSize: "11px",
        color: THEME.colors.textPrimary,
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0.5)
      .setVisible(skill.implemented);

    const decBtnWidth = 22;
    const decBtnX = btnX - 6 - decBtnWidth;
    const decrementBtnBg = this.scene.add
      .rectangle(decBtnX, btnY, decBtnWidth, btnHeight, THEME.colors.buttonDangerFill, 0.8)
      .setOrigin(0, 0)
      .setVisible(false);

    const decrementBtnText = this.scene.add
      .text(decBtnX + decBtnWidth / 2, btnY + btnHeight / 2, "-", {
        fontSize: "13px",
        color: THEME.colors.textPrimary,
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    const rankText = this.scene.add
      .text(decBtnX - 8, btnY + btnHeight / 2, `Rank: 0/${skill.max}`, {
        fontSize: "12px",
        color: THEME.colors.textMuted
      })
      .setOrigin(1, 0.5)
      .setVisible(skill.implemented);

    const statusBadge = this.scene.add
      .text(
        cardWidth - CARD_PADDING,
        btnY + btnHeight / 2,
        skill.implemented ? "" : t("Not Implemented"),
        {
          fontSize: "11px",
          color: THEME.colors.cooldown
        }
      )
      .setOrigin(1, 0.5)
      .setVisible(!skill.implemented);

    const forwardWheel = (
      _pointer: Phaser.Input.Pointer,
      _dx: number,
      dy: number
    ) => {
      this.scrollPanel.addChildOY?.(-dy * 0.35, true);
    };

    cardBg.on(Phaser.Input.Events.POINTER_WHEEL, forwardWheel);
    upgradeBtnBg.on(Phaser.Input.Events.POINTER_WHEEL, forwardWheel);
    decrementBtnBg.on(Phaser.Input.Events.POINTER_WHEEL, forwardWheel);

    if (skill.implemented) {
      upgradeBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
        if (upgradeBtnBg.input?.enabled) {
          upgradeBtnBg.setFillStyle(THEME.colors.buttonConfirmHover);
        }
      });
      upgradeBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
        if (upgradeBtnBg.input?.enabled) {
          upgradeBtnBg.setFillStyle(THEME.colors.buttonConfirmFill);
        }
      });
      upgradeBtnBg.on(Phaser.Input.Events.POINTER_UP, () => {
        if (upgradeBtnBg.input?.enabled) {
          const committedRank = (this.currentCharacter?.abilities ?? []).filter(
            (id) => id === skill.id
          ).length;
          const pendingRank = this.pendingUpgrades.filter(
            (id) => id === skill.id
          ).length;
          const totalRank = committedRank + pendingRank;
          const tutorialRankLimitReached =
            this.tutorialChooseSkillsMode && totalRank >= 1;
          const committedPoints =
            this.currentCharacter?.progression?.availableSkillPoints ?? 0;
          const effectivePoints = committedPoints - this.calculatePendingCost();
          if (
            effectivePoints >= skill.cost &&
            totalRank < skill.max &&
            !tutorialRankLimitReached
          ) {
            this.pendingUpgrades.push(skill.id);
            this.refreshView();
          }
        }
      });

      decrementBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
        if (decrementBtnBg.input?.enabled) {
          decrementBtnBg.setFillStyle(THEME.colors.buttonDangerHover);
        }
      });
      decrementBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
        if (decrementBtnBg.input?.enabled) {
          decrementBtnBg.setFillStyle(THEME.colors.buttonDangerFill);
        }
      });
      decrementBtnBg.on(Phaser.Input.Events.POINTER_UP, () => {
        if (decrementBtnBg.input?.enabled) {
          const lastIdx = this.pendingUpgrades.lastIndexOf(skill.id);
          if (lastIdx !== -1) {
            this.pendingUpgrades.splice(lastIdx, 1);
            this.refreshView();
          }
        }
      });
    }

    this.scrollContent.add(cardBg);
    this.scrollContent.add(nameText);
    this.scrollContent.add(costText);
    this.scrollContent.add(rankText);
    this.scrollContent.add(statusBadge);
    this.scrollContent.add(decrementBtnBg);
    this.scrollContent.add(decrementBtnText);
    this.scrollContent.add(upgradeBtnBg);
    this.scrollContent.add(upgradeBtnText);
    this.scrollContent.add(descText);

    this.cardElements.push(
      cardBg,
      nameText,
      costText,
      rankText,
      statusBadge,
      decrementBtnBg,
      decrementBtnText,
      upgradeBtnBg,
      upgradeBtnText,
      descText
    );

    this.cardItems.push({
      skill,
      cardBg,
      rankText,
      statusBadge,
      upgradeBtnBg,
      upgradeBtnText,
      decrementBtnBg,
      decrementBtnText
    });

    return cardHeight;
  }
}
