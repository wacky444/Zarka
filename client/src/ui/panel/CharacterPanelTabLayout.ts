import Phaser from "phaser";
import type { CharacterPanelTabEntry, TabKey } from "../CharacterPanelTabs";

const TAB_HEIGHT = 40;
const TAB_ARROW_WIDTH = 36;
const MOBILE_TAB_MIN_WIDTH = 82;

export class CharacterPanelTabLayout {
  private mobileNavigation = false;
  private startIndex = 0;

  constructor(
    private readonly tabs: CharacterPanelTabEntry[],
    private readonly previousButton: Phaser.GameObjects.Rectangle,
    private readonly previousText: Phaser.GameObjects.Text,
    private readonly nextButton: Phaser.GameObjects.Rectangle,
    private readonly nextText: Phaser.GameObjects.Text,
    private readonly getWidth: () => number,
    private readonly isUnread: (key: TabKey) => boolean
  ) {}

  setMobileNavigation(enabled: boolean): void {
    const changed = this.mobileNavigation !== enabled;
    this.mobileNavigation = enabled;
    if (!enabled || changed) {
      this.startIndex = 0;
    }
    this.layout(this.getWidth());
  }

  reveal(key: TabKey): void {
    if (!this.mobileNavigation) {
      return;
    }
    const index = this.tabs.findIndex((tab) => tab.key === key);
    const visibleCount = this.getVisibleTabCount(this.getWidth());
    if (index < 0 || visibleCount >= this.tabs.length) {
      this.startIndex = 0;
      this.layout(this.getWidth());
      return;
    }
    if (index < this.startIndex) {
      this.startIndex = index;
    } else if (index >= this.startIndex + visibleCount) {
      this.startIndex = index - visibleCount + 1;
    }
    this.layout(this.getWidth());
  }

  move(delta: number): void {
    if (!this.mobileNavigation) {
      return;
    }
    const visibleCount = this.getVisibleTabCount(this.getWidth());
    if (visibleCount >= this.tabs.length) {
      return;
    }
    const maxStart = this.tabs.length - visibleCount;
    this.startIndex = Math.max(
      0,
      Math.min(maxStart, this.startIndex + delta)
    );
    this.layout(this.getWidth());
  }

  layout(width: number): void {
    const compact =
      this.mobileNavigation &&
      this.getVisibleTabCount(width) < this.tabs.length;
    const visibleCount = compact
      ? this.getVisibleTabCount(width)
      : this.tabs.length;
    const tabAreaWidth = compact
      ? Math.max(1, width - TAB_ARROW_WIDTH * 2)
      : width;
    const tabWidth = tabAreaWidth / Math.max(1, visibleCount);

    if (!compact) {
      this.startIndex = 0;
    } else {
      this.startIndex = Math.max(
        0,
        Math.min(this.tabs.length - visibleCount, this.startIndex)
      );
    }

    this.tabs.forEach((tab, index) => {
      const visible =
        !compact ||
        (index >= this.startIndex && index < this.startIndex + visibleCount);
      if (!visible) {
        tab.rect.setVisible(false).disableInteractive();
        tab.text.setVisible(false).disableInteractive();
        tab.badge?.setVisible(false);
        return;
      }
      const displayIndex = compact ? index - this.startIndex : index;
      const tabX = (compact ? TAB_ARROW_WIDTH : 0) + displayIndex * tabWidth;
      tab.rect
        .setPosition(tabX, 0)
        .setSize(tabWidth, TAB_HEIGHT)
        .setVisible(true)
        .setInteractive({ useHandCursor: true });
      tab.text
        .setPosition(tabX + tabWidth / 2, TAB_HEIGHT / 2)
        .setVisible(true)
        .setInteractive({ useHandCursor: true });
      tab.badge
        ?.setPosition(tabX + tabWidth - 10, 6)
        .setVisible(this.isUnread(tab.key));
    });

    const showArrows = compact;
    this.previousButton.setVisible(showArrows);
    this.previousText.setVisible(showArrows);
    this.nextButton.setVisible(showArrows);
    this.nextText.setVisible(showArrows);
    if (!showArrows) {
      this.previousButton.disableInteractive();
      this.previousText.disableInteractive();
      this.nextButton.disableInteractive();
      this.nextText.disableInteractive();
      return;
    }

    const canMovePrevious = this.startIndex > 0;
    const canMoveNext = this.startIndex + visibleCount < this.tabs.length;
    this.previousButton
      .setPosition(0, 0)
      .setAlpha(canMovePrevious ? 1 : 0.35);
    this.previousText
      .setPosition(TAB_ARROW_WIDTH / 2, TAB_HEIGHT / 2)
      .setAlpha(canMovePrevious ? 1 : 0.35);
    this.nextButton
      .setPosition(width - TAB_ARROW_WIDTH, 0)
      .setAlpha(canMoveNext ? 1 : 0.35);
    this.nextText
      .setPosition(width - TAB_ARROW_WIDTH / 2, TAB_HEIGHT / 2)
      .setAlpha(canMoveNext ? 1 : 0.35);
    setInteractive(this.previousButton, this.previousText, canMovePrevious);
    setInteractive(this.nextButton, this.nextText, canMoveNext);
  }

  private getVisibleTabCount(width: number): number {
    if (width >= this.tabs.length * MOBILE_TAB_MIN_WIDTH) {
      return this.tabs.length;
    }
    const availableWidth = Math.max(1, width - TAB_ARROW_WIDTH * 2);
    return Math.max(
      1,
      Math.min(
        this.tabs.length,
        Math.floor(availableWidth / MOBILE_TAB_MIN_WIDTH)
      )
    );
  }
}

function setInteractive(
  button: Phaser.GameObjects.Rectangle,
  text: Phaser.GameObjects.Text,
  enabled: boolean
): void {
  if (enabled) {
    button.setInteractive({ useHandCursor: true });
    text.setInteractive({ useHandCursor: true });
  } else {
    button.disableInteractive();
    text.disableInteractive();
  }
}
