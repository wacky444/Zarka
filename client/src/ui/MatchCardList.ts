import Phaser from "phaser";
import type { MatchCardSummary } from "@shared";
import { MatchCard } from "./MatchCard";

const CARD_GAP = 10;
const CARD_HORIZONTAL_PADDING = 32;
const CARD_MAX_WIDTH = 720;

export type MatchCardScrollPanel = Phaser.GameObjects.GameObject & {
  layout?: () => void;
  setMinSize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  setPosition?: (x: number, y: number) => void;
  setOrigin?: (x: number, y?: number) => void;
  setVisible?: (visible: boolean) => void;
  setActive?: (active: boolean) => void;
  scrollToTop?: () => void;
  t?: number;
};

export function createMatchCardScrollPanel(
  scene: Phaser.Scene,
  child: Phaser.GameObjects.Container
): MatchCardScrollPanel {
  return scene.rexUI.add.scrollablePanel({
    x: 0,
    y: 0,
    width: scene.scale.width,
    height: scene.scale.height,
    scrollMode: 0,
    panel: { child, mask: true },
    slider: {
      track: scene.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
      thumb: scene.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
    },
    scroller: {
      threshold: 10,
      rectBoundsInteractive: true,
      slidingDeceleration: 5000,
      backDeceleration: 2000,
      pointerOutRelease: true
    },
    mouseWheelScroller: { focus: 2, speed: 0.35 },
    space: { left: 0, right: 8, top: 0, bottom: 0, panel: 8 }
  }) as MatchCardScrollPanel;
}

export class MatchCardList<T extends MatchCardSummary> extends Phaser.GameObjects.Container {
  private readonly isMyMatch: boolean;
  private readonly onSelect: (match: T) => void;
  private matches: T[] = [];
  private cards: MatchCard[] = [];
  private layoutWidth = 0;

  constructor(
    scene: Phaser.Scene,
    isMyMatch: boolean,
    onSelect: (match: T) => void
  ) {
    super(scene, 0, 0);
    this.isMyMatch = isMyMatch;
    this.onSelect = onSelect;
    scene.add.existing(this);
    this.layout(scene.scale.width);
  }

  setMatches(matches: readonly T[]): void {
    this.matches = [...matches];
    this.renderMatches();
  }

  layout(width: number): void {
    if (this.layoutWidth === width) {
      return;
    }
    this.layoutWidth = width;
    this.renderMatches();
  }

  setItemsVisible(visible: boolean): void {
    this.setVisible(visible).setActive(visible);
    for (const card of this.cards) {
      card.setVisible(visible).setActive(visible);
    }
  }

  private renderMatches(): void {
    for (const card of this.cards) {
      card.destroy();
    }
    this.cards = [];
    this.removeAll(false);

    const cardWidth = Math.min(
      CARD_MAX_WIDTH,
      Math.max(300, this.layoutWidth - CARD_HORIZONTAL_PADDING)
    );
    const cardLeft = (this.layoutWidth - cardWidth) / 2;
    let cursorY = 0;

    for (const match of this.matches) {
      const currentUserReady =
        "currentUserReady" in match &&
        typeof match.currentUserReady === "boolean"
          ? match.currentUserReady
          : undefined;
      const card = new MatchCard(
        this.scene,
        cardLeft,
        cursorY,
        cardWidth,
        match,
        {
          isMyMatch: this.isMyMatch,
          currentUserReady,
          onSelect: () => this.onSelect(match)
        }
      );
      this.add(card);
      this.cards.push(card);
      cursorY += card.height + CARD_GAP;
    }

    this.setSize(this.layoutWidth, Math.max(0, cursorY - CARD_GAP));
  }
}
