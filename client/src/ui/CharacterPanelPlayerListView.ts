import Phaser from "phaser";
import type { MatchRecord } from "@shared";
import type { PlayerOption } from "./PlayerSelector";

type PlayerTabListEntry = {
  playerId: string;
  button: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

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
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask,
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
};

type CharacterPanelPlayerListViewLayout = {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
};

const BOX_HEIGHT = 180;
const NO_TEAM_LABEL = "No Team";
const UNKNOWN_TEAM_LABEL = "Unknown Team";
const PLAYER_LIST_LABEL_PADDING = 10;
const CARD_SPRITE_SIZE = 64;
const CARD_SPRITE_PADDING = 16;

export class CharacterPanelPlayerListView {
  private playersTabEntries: PlayerTabListEntry[] = [];
  private playersTabSelection: string | null = null;
  private currentMatch: MatchRecord | null = null;
  private playerOptions: PlayerOption[] = [];
  private playersTabListContent: Phaser.GameObjects.Container;
  private playersTabListScrollPanel: ScrollablePanelInstance;
  private playersTabListBackground: Phaser.GameObjects.Rectangle;
  private playersTabListTitle: Phaser.GameObjects.Text;
  private playersTabCardBackground: Phaser.GameObjects.Rectangle;
  private playersTabCardName: Phaser.GameObjects.Text;
  private playersTabCardTeam: Phaser.GameObjects.Text;
  private playersTabCardSprite: Phaser.GameObjects.Image;
  private playersTabEmpty: Phaser.GameObjects.Text;
  private readonly elements: Phaser.GameObjects.GameObject[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    layout: CharacterPanelPlayerListViewLayout,
  ) {
    const playersBoxY = layout.contentTop;
    const playersBoxWidth = layout.boxWidth;
    const playersBoxHeight = Math.max(
      BOX_HEIGHT * 2,
      layout.panelHeight - playersBoxY - layout.margin,
    );

    this.playersTabListBackground = scene.add
      .rectangle(
        layout.margin,
        playersBoxY,
        playersBoxWidth,
        playersBoxHeight,
        0x1b2440,
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.playersTabListBackground.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.playersTabListBackground);

    this.playersTabListTitle = scene.add
      .text(layout.margin + 12, playersBoxY + 12, "Players", {
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabListTitle);

    this.playersTabCardBackground = scene.add
      .rectangle(
        layout.margin + 12,
        playersBoxY + playersBoxHeight - 150,
        playersBoxWidth - 24,
        138,
        0x141c33,
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.playersTabCardBackground.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.playersTabCardBackground);

    this.playersTabCardName = scene.add
      .text(layout.margin + 24, playersBoxY + playersBoxHeight - 138, "", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabCardName);

    this.playersTabCardTeam = scene.add
      .text(layout.margin + 24, playersBoxY + playersBoxHeight - 112, "", {
        fontSize: "13px",
        color: "#a0b7ff",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabCardTeam);

    const listTop = playersBoxY + 44;
    const cardTop = this.playersTabCardBackground.y;
    const listHeight = Math.max(0, cardTop - listTop - 12);
    const listWidth = Math.max(120, playersBoxWidth - 24);
    this.playersTabListContent = scene.add.container(0, 0);
    this.playersTabListScrollPanel = scene.rexUI.add.scrollablePanel({
      x: layout.margin + 12,
      y: listTop,
      width: listWidth,
      height: listHeight,
      scrollMode: 0,
      panel: {
        child: this.playersTabListContent,
        mask: { padding: 1 },
      },
      slider: false,
      scroller: {
        threshold: 10,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: true,
        speed: 0.35,
      },
      space: { left: 0, right: 0, top: 0, bottom: 0 },
    }) as ScrollablePanelInstance;
    this.playersTabListScrollPanel.setOrigin?.(0, 0);
    this.playersTabListScrollPanel.setVisible?.(false);
    parent.add(this.playersTabListScrollPanel);

    const cardRight =
      this.playersTabCardBackground.x + this.playersTabCardBackground.width;
    const cardCenterY =
      this.playersTabCardBackground.y + this.playersTabCardBackground.height / 2;
    this.playersTabCardSprite = scene.add
      .image(cardRight - CARD_SPRITE_PADDING, cardCenterY, "char")
      .setOrigin(1, 0.5)
      .setDisplaySize(CARD_SPRITE_SIZE, CARD_SPRITE_SIZE)
      .setVisible(false);
    parent.add(this.playersTabCardSprite);

    this.playersTabEmpty = scene.add
      .text(layout.margin + 24, playersBoxY + 70, "No players found.", {
        fontSize: "14px",
        color: "#94a3d4",
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabEmpty);

    this.elements = [
      this.playersTabListBackground,
      this.playersTabListTitle,
      this.playersTabListScrollPanel,
      this.playersTabCardBackground,
      this.playersTabCardName,
      this.playersTabCardTeam,
      this.playersTabCardSprite,
      this.playersTabEmpty,
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  layout(options: CharacterPanelPlayerListViewLayout): void {
    const playersBoxY = options.contentTop;
    const playersBoxHeight = Math.max(
      BOX_HEIGHT * 2,
      options.panelHeight - playersBoxY - options.margin,
    );
    this.playersTabListBackground.setPosition(options.margin, playersBoxY);
    this.playersTabListBackground.setSize(options.boxWidth, playersBoxHeight);
    this.playersTabListBackground.setDisplaySize(
      options.boxWidth,
      playersBoxHeight,
    );
    this.playersTabListTitle.setPosition(options.margin + 12, playersBoxY + 12);
    const listTop = playersBoxY + 44;
    this.playersTabCardBackground.setPosition(
      options.margin + 12,
      playersBoxY + playersBoxHeight - 150,
    );
    this.playersTabCardBackground.setSize(options.boxWidth - 24, 138);
    this.playersTabCardBackground.setDisplaySize(options.boxWidth - 24, 138);
    this.playersTabCardName.setPosition(
      options.margin + 24,
      playersBoxY + playersBoxHeight - 138,
    );
    this.playersTabCardTeam.setPosition(
      options.margin + 24,
      playersBoxY + playersBoxHeight - 112,
    );
    const cardRight =
      this.playersTabCardBackground.x + this.playersTabCardBackground.width;
    const cardCenterY =
      this.playersTabCardBackground.y + this.playersTabCardBackground.height / 2;
    this.playersTabCardSprite.setPosition(
      cardRight - CARD_SPRITE_PADDING,
      cardCenterY,
    );
    const cardTop = this.playersTabCardBackground.y;
    const listHeight = Math.max(0, cardTop - listTop - 12);
    const listWidth = Math.max(120, options.boxWidth - 24);
    this.playersTabListScrollPanel.setPosition?.(options.margin + 12, listTop);
    this.playersTabListScrollPanel.setSize?.(listWidth, listHeight);
    this.playersTabListScrollPanel.setMinSize?.(listWidth, listHeight);
    this.playersTabListScrollPanel.layout?.();
    this.playersTabEmpty.setPosition(options.margin + 24, playersBoxY + 70);
    this.refresh();
  }

  update(match: MatchRecord | null, players: PlayerOption[]): void {
    this.currentMatch = match;
    this.playerOptions = players;
    this.refresh();
  }

  refresh(): void {
    const match = this.currentMatch;
    const list = this.playerOptions;
    const availableIds = new Set(list.map((option) => option.id));
    if (
      !this.playersTabSelection ||
      !availableIds.has(this.playersTabSelection)
    ) {
      this.playersTabSelection = list[0]?.id ?? null;
    }
    for (const entry of this.playersTabEntries) {
      entry.button.destroy();
      entry.label.destroy();
    }
    this.playersTabEntries = [];
    for (const child of [...this.playersTabListContent.list]) {
      child.destroy();
    }
    this.playersTabListContent.removeAll(false);
    if (!match || list.length === 0) {
      this.playersTabEmpty.setVisible(true);
      this.playersTabCardName.setText("");
      this.playersTabCardTeam.setText("");
      this.playersTabCardSprite.setVisible(false);
      return;
    }
    this.playersTabEmpty.setVisible(false);
    const entriesByTeam = new Map<string, PlayerOption[]>();
    const order: string[] = [];
    for (const option of list) {
      let teamId;
      const character = match?.playerCharacters?.[option.id];
      if (character && "position" in character && "inventory" in character) {
        teamId = character.teamId?.trim() || NO_TEAM_LABEL;
      } else {
        teamId = UNKNOWN_TEAM_LABEL;
      }
      if (!entriesByTeam.has(teamId)) {
        entriesByTeam.set(teamId, []);
        order.push(teamId);
      }
      entriesByTeam.get(teamId)?.push(option);
    }
    order.sort((a, b) => {
      const rank = (value: string) => (value === NO_TEAM_LABEL ? 1 : 0);
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.localeCompare(b);
    });
    const rowHeight = 30;
    const rowSpacing = 6;
    const sectionSpacing = 12;
    const containerWidth = Math.max(
      120,
      this.playersTabListBackground.width - 24,
    );
    const itemWidth = Math.max(80, containerWidth - 2);
    let y = 0;
    for (const teamId of order) {
      const teamLabel = this.scene.add
        .text(0, y, `Team ${teamId}`, {
          fontSize: "13px",
          color: "#a0b7ff",
        })
        .setOrigin(0, 0);
      this.playersTabListContent.add(teamLabel);
      y += 18;
      const members = entriesByTeam.get(teamId) ?? [];
      members.sort((a, b) => a.label.localeCompare(b.label));
      for (const option of members) {
        const button = this.scene.add
          .rectangle(0, y, itemWidth, rowHeight, 0x202b4a, 0.95)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x2f3a5d, 1)
          .setInteractive({ useHandCursor: true });
        const label = this.scene.add
          .text(PLAYER_LIST_LABEL_PADDING, y + rowHeight / 2, option.label, {
            fontSize: "14px",
            color: "#ffffff",
          })
          .setOrigin(0, 0.5);
        this.fitPlayerListLabelWidth(
          label,
          option.label,
          itemWidth - PLAYER_LIST_LABEL_PADDING * 2,
        );
        button.on(Phaser.Input.Events.POINTER_UP, () => {
          this.playersTabSelection = option.id;
          this.applySelectionStyles();
          this.refreshPlayerCard();
        });
        this.playersTabListContent.add(button);
        this.playersTabListContent.add(label);
        this.playersTabEntries.push({
          playerId: option.id,
          button,
          label,
        });
        y += rowHeight + rowSpacing;
      }
      y += sectionSpacing;
    }
    this.applySelectionStyles();
    this.refreshPlayerCard();
    this.playersTabListScrollPanel.layout?.();
  }

  openPlayerCard(playerId: string): boolean {
    const normalized = this.normalizePlayerId(playerId);
    if (!normalized) {
      return false;
    }
    const availableIds = new Set(this.playerOptions.map((option) => option.id));
    if (!availableIds.has(normalized)) {
      return false;
    }
    this.playersTabSelection = normalized;
    this.applySelectionStyles();
    this.refreshPlayerCard();
    return true;
  }

  clearSelectionStyles(): void {
    for (const entry of this.playersTabEntries) {
      entry.button.setFillStyle(0x202b4a, 0.95);
      entry.button.setStrokeStyle(1, 0x2f3a5d, 1);
      entry.label.setColor("#ffffff");
    }
  }

  private normalizePlayerId(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private fitPlayerListLabelWidth(
    label: Phaser.GameObjects.Text,
    value: string,
    maxWidth: number,
  ): void {
    if (label.width <= maxWidth) {
      return;
    }
    let truncated = value;
    while (truncated.length > 1) {
      truncated = truncated.slice(0, -1).trimEnd();
      label.setText(`${truncated}…`);
      if (label.width <= maxWidth) {
        return;
      }
    }
  }

  private applySelectionStyles(): void {
    for (const entry of this.playersTabEntries) {
      const selected = entry.playerId === this.playersTabSelection;
      entry.button.setFillStyle(selected ? 0x2f5e88 : 0x202b4a, 0.95);
      entry.button.setStrokeStyle(selected ? 2 : 1, 0x6ea8d6, 1);
      entry.label.setColor(selected ? "#d8f0ff" : "#ffffff");
    }
  }

  private refreshPlayerCard(): void {
    const selectedId = this.playersTabSelection;
    const match = this.currentMatch;
    if (!selectedId || !match) {
      this.playersTabCardName.setText("");
      this.playersTabCardTeam.setText("");
      this.playersTabCardSprite.setVisible(false);
      return;
    }
    const character = match.playerCharacters?.[selectedId] ?? null;
    const displayName =
      this.playerOptions.find((option) => option.id === selectedId)?.label ??
      selectedId;
    this.playersTabCardName.setText(displayName);
    let teamId;
    if (character && "position" in character && "inventory" in character) {
      teamId = character?.teamId?.trim() || NO_TEAM_LABEL;
    } else {
      teamId = UNKNOWN_TEAM_LABEL;
    }
    this.playersTabCardTeam.setText(`Team: ${teamId}`);

    const option = this.playerOptions.find((entry) => entry.id === selectedId);
    const texture = option?.texture ?? "char";
    const frame = option?.frame;
    if (this.scene.textures.exists(texture)) {
      this.playersTabCardSprite.setTexture(texture, frame);
    } else {
      this.playersTabCardSprite.setTexture("char");
    }
    this.playersTabCardSprite
      .setDisplaySize(CARD_SPRITE_SIZE, CARD_SPRITE_SIZE)
      .setVisible(true);
  }
}
