import type Phaser from "phaser";

export type TabKey = "character" | "items" | "players" | "chat" | "log";

export interface CharacterPanelTabEntry {
  key: TabKey;
  rect: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  badge?: Phaser.GameObjects.Rectangle;
}

interface CharacterPanelTabsOptions {
  tabs: CharacterPanelTabEntry[];
  defaultKey: TabKey;
  characterElements: Phaser.GameObjects.GameObject[];
  itemsElements: Phaser.GameObjects.GameObject[];
  chatElements: Phaser.GameObjects.GameObject[];
  onCharacterTabShow: () => void;
  onCharacterTabHide: () => void;
  onItemsTabShow: () => void;
  onItemsTabHide: () => void;
  onChatTabShow: () => void;
  onChatTabHide: () => void;
  onLogVisibilityChange: (options: {
    visible: boolean;
    forceEnsure: boolean;
  }) => void;
  onTabChange: (key: TabKey, previous: TabKey) => void;
  onLogTabOpened: () => void;
  onLogTabClosed: () => void;
}

export class CharacterPanelTabs {
  private activeKey: TabKey;
  private readonly unreadTabs = new Set<TabKey>();

  constructor(private readonly options: CharacterPanelTabsOptions) {
    this.activeKey = options.defaultKey;
  }

  getActiveTab(): TabKey {
    return this.activeKey;
  }

  isActive(key: TabKey): boolean {
    return this.activeKey === key;
  }

  setTabUnread(key: TabKey, unread: boolean): void {
    if (unread) {
      this.unreadTabs.add(key);
    } else {
      this.unreadTabs.delete(key);
    }
    this.updateStyles();
  }

  setActiveTab(key: TabKey): void {
    if (key === this.activeKey) {
      if (key === "log") {
        this.options.onLogVisibilityChange({
          visible: true,
          forceEnsure: true,
        });
      }
      return;
    }
    const previous = this.activeKey;
    this.activeKey = key;
    this.unreadTabs.delete(key);
    this.updateStyles();
    this.updateVisibility(false);
    this.options.onTabChange(key, previous);
    if (key === "log") {
      this.options.onLogTabOpened();
      this.options.onLogVisibilityChange({ visible: true, forceEnsure: true });
    } else if (previous === "log") {
      this.options.onLogTabClosed();
    }
  }

  refresh(): void {
    this.updateStyles();
    this.updateVisibility(false);
  }

  private updateStyles(): void {
    for (const tab of this.options.tabs) {
      const active = tab.key === this.activeKey;
      const unread = !active && this.unreadTabs.has(tab.key);
      tab.rect.setFillStyle(active ? 0x253055 : 0x1c233f);
      tab.text.setAlpha(active ? 1 : 0.7);
      if (tab.badge) {
        tab.badge.setVisible(unread);
      }
    }
  }

  private updateVisibility(forceEnsure: boolean): void {
    const showCharacter = this.activeKey === "character";
    this.toggleElements(this.options.characterElements, showCharacter);
    if (showCharacter) {
      this.options.onCharacterTabShow();
    } else {
      this.options.onCharacterTabHide();
    }
    const showItems = this.activeKey === "items";
    this.toggleElements(this.options.itemsElements, showItems);
    if (showItems) {
      this.options.onItemsTabShow();
    } else {
      this.options.onItemsTabHide();
    }
    const showChat = this.activeKey === "chat";
    this.toggleElements(this.options.chatElements, showChat);
    if (showChat) {
      this.options.onChatTabShow();
    } else {
      this.options.onChatTabHide();
    }
    const showLog = this.activeKey === "log";
    this.options.onLogVisibilityChange({ visible: showLog, forceEnsure });
  }

  private toggleElements(
    elements: Phaser.GameObjects.GameObject[],
    visible: boolean
  ) {
    for (const obj of elements) {
      const target = obj as Phaser.GameObjects.GameObject & {
        setVisible?: (value: boolean) => void;
        setActive?: (value: boolean) => void;
      };
      target.setVisible?.(visible);
      target.setActive?.(visible);
    }
  }
}
