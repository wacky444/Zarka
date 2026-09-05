import Phaser from "phaser";
import {
  SkillLibrary,
  type PlayerCharacter,
  type SkillDefinition,
  type SkillId
} from "@shared";

export interface CharacterPanelSkillsViewLayout {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
}

interface SkillCardItem {
  skill: SkillDefinition;
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

const HEADER_HEIGHT = 44;
const CARD_PADDING = 12;
const CARD_SPACING = 8;

export class CharacterPanelSkillsView {
  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly headerBox: Phaser.GameObjects.Rectangle;
  private readonly unspentPointsLabel: Phaser.GameObjects.Text;
  private readonly revertBtnBg: Phaser.GameObjects.Rectangle;
  private readonly revertBtnText: Phaser.GameObjects.Text;
  private readonly confirmBtnBg: Phaser.GameObjects.Rectangle;
  private readonly confirmBtnText: Phaser.GameObjects.Text;
  private readonly scrollContent: Phaser.GameObjects.Container;
  private readonly scrollPanel: ScrollablePanelInstance;
  private scrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private scrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private readonly elements: Phaser.GameObjects.GameObject[] = [];
  private readonly cardElements: Phaser.GameObjects.GameObject[] = [];
  private readonly cardItems: SkillCardItem[] = [];
  private currentCharacter: PlayerCharacter | null = null;
  private pendingUpgrades: SkillId[] = [];
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
      .rectangle(layout.margin, startY, width, height, 0x1b2440)
      .setOrigin(0, 0)
      .setVisible(false);
    this.background.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.background);

    const headerY = startY + 8;
    const headerWidth = width - 24;
    this.headerBox = scene.add
      .rectangle(
        layout.margin + 12,
        headerY,
        headerWidth,
        HEADER_HEIGHT,
        0x141c33,
        0.95
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.headerBox.setStrokeStyle?.(1, 0x2d3a60, 0.9);
    parent.add(this.headerBox);

    this.unspentPointsLabel = scene.add
      .text(
        layout.margin + 24,
        headerY + HEADER_HEIGHT / 2,
        "Available Skill: 0",
        {
          fontSize: "15px",
          color: "#facc15"
        }
      )
      .setOrigin(0, 0.5)
      .setVisible(false);
    parent.add(this.unspentPointsLabel);

    const btnHeight = 26;
    const confirmBtnWidth = 70;
    const revertBtnWidth = 64;
    const headerRight = layout.margin + 12 + headerWidth - 10;
    const confirmBtnX = headerRight - confirmBtnWidth;
    const confirmBtnY = headerY + (HEADER_HEIGHT - btnHeight) / 2;
    const revertBtnX = confirmBtnX - 8 - revertBtnWidth;
    const revertBtnY = confirmBtnY;

    this.revertBtnBg = scene.add
      .rectangle(
        revertBtnX,
        revertBtnY,
        revertBtnWidth,
        btnHeight,
        0x334155,
        0.5
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.revertBtnBg.setStrokeStyle?.(1, 0x475569, 0.8);
    parent.add(this.revertBtnBg);

    this.revertBtnText = scene.add
      .text(
        revertBtnX + revertBtnWidth / 2,
        revertBtnY + btnHeight / 2,
        "Revert",
        {
          fontSize: "12px",
          color: "#ffffff",
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
        0x334155,
        0.5
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.confirmBtnBg.setStrokeStyle?.(1, 0x22c55e, 0.8);
    parent.add(this.confirmBtnBg);

    this.confirmBtnText = scene.add
      .text(
        confirmBtnX + confirmBtnWidth / 2,
        confirmBtnY + btnHeight / 2,
        "Confirm",
        {
          fontSize: "12px",
          color: "#ffffff",
          fontStyle: "bold"
        }
      )
      .setOrigin(0.5, 0.5)
      .setAlpha(0.4)
      .setVisible(false);
    parent.add(this.confirmBtnText);

    this.revertBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.revertBtnBg.input?.enabled) {
        this.revertBtnBg.setFillStyle(0xef4444);
      }
    });
    this.revertBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.revertBtnBg.input?.enabled) {
        this.revertBtnBg.setFillStyle(0x475569);
      }
    });
    this.revertBtnBg.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.revertBtnBg.input?.enabled) {
        this.pendingUpgrades = [];
        this.refreshView();
      }
    });

    this.confirmBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.confirmBtnBg.input?.enabled) {
        this.confirmBtnBg.setFillStyle(0x22c55e);
      }
    });
    this.confirmBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (this.confirmBtnBg.input?.enabled) {
        this.confirmBtnBg.setFillStyle(0x16a34a);
      }
    });
    this.confirmBtnBg.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.confirmBtnBg.input?.enabled && this.pendingUpgrades.length > 0) {
        const toApply = [...this.pendingUpgrades];
        this.setButtonsEnabled(false);
        this.onConfirmSkills?.(toApply);
      }
    });

    const listTop = headerY + HEADER_HEIGHT + 8;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - startY) - 8);

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
        track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: scene.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
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
    if (this.scrollMask) {
      this.scrollPanel.setMask?.(this.scrollMask);
    }
    this.scrollPanel.setVisible?.(false);
    parent.add(this.scrollPanel);

    this.buildSkillList(listWidth - 8);

    this.elements = [
      this.background,
      this.headerBox,
      this.unspentPointsLabel,
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
    this.unspentPointsLabel.setVisible(visible);
    this.revertBtnBg.setVisible(visible);
    this.revertBtnText.setVisible(visible);
    this.confirmBtnBg.setVisible(visible);
    this.confirmBtnText.setVisible(visible);
    this.scrollPanel.setVisible?.(visible);
    this.scrollPanel.setMouseWheelScrollerEnable?.(visible);
  }

  setOnConfirmSkills(callback: (skillIds: SkillId[]) => void): void {
    this.onConfirmSkills = callback;
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
      this.revertBtnBg.setFillStyle(0x475569, 1);
      this.revertBtnBg.setInteractive({ useHandCursor: true });
      this.revertBtnText.setAlpha(1);

      this.confirmBtnBg.setFillStyle(0x16a34a, 1);
      this.confirmBtnBg.setInteractive({ useHandCursor: true });
      this.confirmBtnText.setAlpha(1);
    } else {
      this.revertBtnBg.setFillStyle(0x334155, 0.5);
      this.revertBtnBg.disableInteractive();
      this.revertBtnText.setAlpha(0.4);

      this.confirmBtnBg.setFillStyle(0x334155, 0.5);
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
        `Available Skill: ${effectivePoints} (-${spentPending})`
      );
      this.setButtonsEnabled(true);
    } else {
      this.unspentPointsLabel.setText(`Available Skill: ${committedPoints}`);
      this.setButtonsEnabled(false);
    }

    const committedAbilities = this.currentCharacter?.abilities ?? [];

    for (const item of this.cardItems) {
      if (!item.skill.implemented) {
        item.statusBadge.setText("Not Implemented");
        item.statusBadge.setColor("#f87171");
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

      const committedRank = committedAbilities.filter(
        (id) => id === item.skill.id
      ).length;
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
        item.statusBadge.setColor("#facc15");
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
          item.upgradeBtnBg.setFillStyle(0x16a34a, 1);
          item.upgradeBtnBg.setInteractive({ useHandCursor: true });
          item.upgradeBtnText.setAlpha(1);
        } else {
          item.upgradeBtnBg.setFillStyle(0x334155, 0.6);
          item.upgradeBtnBg.disableInteractive();
          item.upgradeBtnText.setAlpha(0.6);
        }
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
      options.margin + 24,
      headerY + HEADER_HEIGHT / 2
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

    const listTop = headerY + HEADER_HEIGHT + 8;
    const listWidth = width - 24;
    const listHeight = Math.max(100, height - (listTop - startY) - 8);

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
    this.scrollPanel.layout?.();
  }

  destroy(): void {
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
    const skills = Object.values(SkillLibrary);
    let currentY = 0;

    for (const skill of skills) {
      currentY +=
        this.createSkillCard(skill, currentY, cardWidth) + CARD_SPACING;
    }

    this.scrollContent.setSize(cardWidth, currentY);
    this.scrollPanel.layout?.();
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
        color: "#cbd5f5",
        wordWrap: { width: textWidth, useAdvancedWrap: true },
        lineSpacing: 3
      })
      .setOrigin(0, 0);

    const cardHeight = Math.max(82, 54 + descText.height + CARD_PADDING);

    const cardBg = this.scene.add
      .rectangle(0, startY, cardWidth, cardHeight, 0x202b4a, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2f3a5d, 0.9)
      .setInteractive({ useHandCursor: false });

    const nameText = this.scene.add
      .text(CARD_PADDING, startY + 8, skill.name, {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0, 0);

    const costText = this.scene.add
      .text(cardWidth - CARD_PADDING, startY + 8, `Cost: ${skill.cost} SP`, {
        fontSize: "12px",
        color: "#facc15"
      })
      .setOrigin(1, 0);

    const categoryText = skill.category
      ? this.scene.add
          .text(CARD_PADDING, startY + 28, `[${skill.category}]`, {
            fontSize: "12px",
            color: "#8ea4d2"
          })
          .setOrigin(0, 0)
      : null;

    const btnWidth = 72;
    const btnHeight = 20;
    const btnX = cardWidth - CARD_PADDING - btnWidth;
    const btnY = startY + 26;

    const upgradeBtnBg = this.scene.add
      .rectangle(btnX, btnY, btnWidth, btnHeight, 0x16a34a, 1)
      .setOrigin(0, 0)
      .setVisible(skill.implemented);

    const upgradeBtnText = this.scene.add
      .text(btnX + btnWidth / 2, btnY + btnHeight / 2, "+ Upgrade", {
        fontSize: "11px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0.5)
      .setVisible(skill.implemented);

    const decBtnWidth = 22;
    const decBtnX = btnX - 6 - decBtnWidth;
    const decrementBtnBg = this.scene.add
      .rectangle(decBtnX, btnY, decBtnWidth, btnHeight, 0xef4444, 0.8)
      .setOrigin(0, 0)
      .setVisible(false);

    const decrementBtnText = this.scene.add
      .text(decBtnX + decBtnWidth / 2, btnY + btnHeight / 2, "-", {
        fontSize: "13px",
        color: "#ffffff",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    const rankText = this.scene.add
      .text(decBtnX - 8, btnY + btnHeight / 2, `Rank: 0/${skill.max}`, {
        fontSize: "12px",
        color: "#94a3b8"
      })
      .setOrigin(1, 0.5)
      .setVisible(skill.implemented);

    const statusBadge = this.scene.add
      .text(
        cardWidth - CARD_PADDING,
        btnY + btnHeight / 2,
        skill.implemented ? "" : "Not Implemented",
        {
          fontSize: "11px",
          color: "#f87171"
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
          upgradeBtnBg.setFillStyle(0x22c55e);
        }
      });
      upgradeBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
        if (upgradeBtnBg.input?.enabled) {
          upgradeBtnBg.setFillStyle(0x16a34a);
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
          const committedPoints =
            this.currentCharacter?.progression?.availableSkillPoints ?? 0;
          const effectivePoints = committedPoints - this.calculatePendingCost();
          if (effectivePoints >= skill.cost && totalRank < skill.max) {
            this.pendingUpgrades.push(skill.id);
            this.refreshView();
          }
        }
      });

      decrementBtnBg.on(Phaser.Input.Events.POINTER_OVER, () => {
        if (decrementBtnBg.input?.enabled) {
          decrementBtnBg.setFillStyle(0xf87171);
        }
      });
      decrementBtnBg.on(Phaser.Input.Events.POINTER_OUT, () => {
        if (decrementBtnBg.input?.enabled) {
          decrementBtnBg.setFillStyle(0xef4444);
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
    if (categoryText) {
      this.scrollContent.add(categoryText);
      this.cardElements.push(categoryText);
    }
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
