import Phaser from "phaser";
import type { MatchRecord } from "@shared";
import type { PlayerOption } from "./PlayerSelector";

type PlayerTabListEntry = {
  playerId: string;
  button: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  readyIcon: Phaser.GameObjects.Text;
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
    mask: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask
  ) => Phaser.GameObjects.GameObject;
  clearMask?: (destroyMask?: boolean) => Phaser.GameObjects.GameObject;
  addChildOY?: (inc: number, clamp?: boolean) => void;
  childOY?: number;
  t?: number;
};

type CharacterPanelPlayerListViewLayout = {
  margin: number;
  contentTop: number;
  boxWidth: number;
  panelHeight: number;
};

const BOX_HEIGHT = 180;
const UNKNOWN_TEAM_LABEL = "Unknown Team";
const PLAYER_LIST_LABEL_PADDING = 10;
const CARD_SPRITE_SIZE = 64;
const CARD_SPRITE_PADDING = 16;
const CARD_HEIGHT = 138;
const PLAYER_ROW_HEIGHT = 30;
const PLAYER_ROW_SPACING = 6;
const VISIBLE_PLAYER_ROWS = 8;
const PLAYER_LIST_SCROLL_HEIGHT =
  VISIBLE_PLAYER_ROWS * PLAYER_ROW_HEIGHT +
  (VISIBLE_PLAYER_ROWS - 1) * PLAYER_ROW_SPACING;

import { Subtabs } from "./Subtabs";

export type PlayerSubTabKey = "players" | "teams";

export class CharacterPanelPlayerListView {
  private readonly subtabs: Subtabs<PlayerSubTabKey>;
  private playersTabEntries: PlayerTabListEntry[] = [];
  private playersTabSelection: string | null = null;
  private currentMatch: MatchRecord | null = null;
  private playerOptions: PlayerOption[] = [];
  private currentUserId: string | null = null;
  private playersTabListContent: Phaser.GameObjects.Container;
  private playersTabListScrollPanel: ScrollablePanelInstance;
  private playersTabScrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private playersTabScrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private playersTabListBackground: Phaser.GameObjects.Rectangle;
  private playersTabListTitle: Phaser.GameObjects.Text;
  private playersTabCardBackground: Phaser.GameObjects.Rectangle;
  private playersTabCardName: Phaser.GameObjects.Text;
  private playersTabCardTeam: Phaser.GameObjects.Text;
  private playersTabCardSprite: Phaser.GameObjects.Image;
  private playersTabEmpty: Phaser.GameObjects.Text;
  private teamsTabListTitle: Phaser.GameObjects.Text;
  private teamsTabListContent: Phaser.GameObjects.Container;
  private teamsTabListScrollPanel: ScrollablePanelInstance;
  private teamsTabScrollMask: Phaser.Display.Masks.GeometryMask | null = null;
  private teamsTabScrollMaskShape: Phaser.GameObjects.Rectangle | null = null;
  private teamsTabEmpty: Phaser.GameObjects.Text;
  private teamsTabEntries: Phaser.GameObjects.GameObject[] = [];
  private readonly elements: Phaser.GameObjects.GameObject[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly parent: Phaser.GameObjects.Container,
    layout: CharacterPanelPlayerListViewLayout
  ) {
    const playersBoxY = layout.contentTop;
    const playersBoxWidth = layout.boxWidth;
    const playersBoxHeight = Math.max(
      BOX_HEIGHT * 2,
      layout.panelHeight - playersBoxY - layout.margin
    );

    this.playersTabListBackground = scene.add
      .rectangle(
        layout.margin,
        playersBoxY,
        playersBoxWidth,
        playersBoxHeight,
        0x1b2440
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.playersTabListBackground.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.playersTabListBackground);

    const subtabY = playersBoxY + 8;
    const subtabHeight = 28;

    this.subtabs = new Subtabs<PlayerSubTabKey>({
      scene,
      parent,
      x: layout.margin + 12,
      y: subtabY,
      width: playersBoxWidth - 24,
      height: subtabHeight,
      tabs: [
        { key: "players", label: "Players" },
        { key: "teams", label: "Teams" }
      ],
      defaultKey: "players",
      onChange: () => {
        this.updateSubtabVisibility();
      }
    });

    const subtabBottom = subtabY + subtabHeight + 6;
    const listTop = subtabBottom + 26;
    const listHeight = PLAYER_LIST_SCROLL_HEIGHT;
    const cardTop = listTop + listHeight + 12;

    this.playersTabListTitle = scene.add
      .text(layout.margin + 12, subtabBottom, "Players", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabListTitle);

    this.playersTabCardBackground = scene.add
      .rectangle(
        layout.margin + 12,
        cardTop,
        playersBoxWidth - 24,
        CARD_HEIGHT,
        0x141c33
      )
      .setOrigin(0, 0)
      .setVisible(false);
    this.playersTabCardBackground.setStrokeStyle?.(1, 0x253055, 0.8);
    parent.add(this.playersTabCardBackground);

    this.playersTabCardName = scene.add
      .text(layout.margin + 24, cardTop + 12, "", {
        fontSize: "18px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabCardName);

    this.playersTabCardTeam = scene.add
      .text(layout.margin + 24, cardTop + 38, "", {
        fontSize: "13px",
        color: "#a0b7ff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabCardTeam);

    const listWidth = Math.max(120, playersBoxWidth - 24);
    const matrix = parent.getWorldTransformMatrix();
    const worldX = matrix.tx + layout.margin + 12;
    const worldY = matrix.ty + listTop;

    this.playersTabScrollMaskShape = scene.add
      .rectangle(worldX, worldY, listWidth, listHeight, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.playersTabScrollMask =
      this.playersTabScrollMaskShape.createGeometryMask();

    this.playersTabListContent = scene.add.container(0, 0);
    this.playersTabListScrollPanel = scene.rexUI.add.scrollablePanel({
      x: layout.margin + 12,
      y: listTop,
      width: listWidth,
      height: listHeight,
      scrollMode: 0,
      panel: {
        child: this.playersTabListContent,
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
    this.playersTabListScrollPanel.setOrigin?.(0, 0);
    if (this.playersTabScrollMask) {
      this.playersTabListScrollPanel.setMask?.(this.playersTabScrollMask);
    }
    this.playersTabListScrollPanel.setVisible?.(false);
    parent.add(this.playersTabListScrollPanel);

    const cardRight =
      this.playersTabCardBackground.x + this.playersTabCardBackground.width;
    const cardCenterY =
      this.playersTabCardBackground.y +
      this.playersTabCardBackground.height / 2;
    this.playersTabCardSprite = scene.add
      .image(cardRight - CARD_SPRITE_PADDING, cardCenterY, "char")
      .setOrigin(1, 0.5)
      .setDisplaySize(CARD_SPRITE_SIZE, CARD_SPRITE_SIZE)
      .setVisible(false);
    parent.add(this.playersTabCardSprite);

    this.playersTabEmpty = scene.add
      .text(layout.margin + 24, subtabBottom + 30, "No players found.", {
        fontSize: "14px",
        color: "#94a3d4"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.playersTabEmpty);

    this.teamsTabListTitle = scene.add
      .text(layout.margin + 12, subtabBottom, "Teams", {
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.teamsTabListTitle);

    this.teamsTabListContent = scene.add.container(0, 0);
    const teamsListHeight = Math.max(0, playersBoxHeight - (subtabBottom - playersBoxY) - 40);

    this.teamsTabScrollMaskShape = scene.add
      .rectangle(worldX, worldY, listWidth, teamsListHeight, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setVisible(true);
    this.teamsTabScrollMask =
      this.teamsTabScrollMaskShape.createGeometryMask();

    this.teamsTabListScrollPanel = scene.rexUI.add.scrollablePanel({
      x: layout.margin + 12,
      y: listTop,
      width: listWidth,
      height: teamsListHeight,
      scrollMode: 0,
      panel: {
        child: this.teamsTabListContent,
        mask: false
      },
      slider: false,
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
      space: { left: 0, right: 0, top: 0, bottom: 0 }
    }) as ScrollablePanelInstance;
    this.teamsTabListScrollPanel.setOrigin?.(0, 0);
    if (this.teamsTabScrollMask) {
      this.teamsTabListScrollPanel.setMask?.(this.teamsTabScrollMask);
    }
    this.teamsTabListScrollPanel.setVisible?.(false);
    parent.add(this.teamsTabListScrollPanel);

    this.teamsTabEmpty = scene.add
      .text(layout.margin + 24, subtabBottom + 30, "No teams found.", {
        fontSize: "14px",
        color: "#94a3d4"
      })
      .setOrigin(0, 0)
      .setVisible(false);
    parent.add(this.teamsTabEmpty);

    this.elements = [
      this.playersTabListBackground,
      ...this.subtabs.getElements(),
      this.playersTabListTitle,
      this.playersTabListScrollPanel,
      this.playersTabCardBackground,
      this.playersTabCardName,
      this.playersTabCardTeam,
      this.playersTabCardSprite,
      this.playersTabEmpty,
      this.teamsTabListTitle,
      this.teamsTabListScrollPanel,
      this.teamsTabEmpty
    ];
  }

  getElements(): Phaser.GameObjects.GameObject[] {
    return this.elements;
  }

  setActiveSubtab(subtab: PlayerSubTabKey): void {
    this.subtabs.setActiveKey(subtab);
    this.updateSubtabVisibility();
  }

  getActiveSubtab(): PlayerSubTabKey {
    return this.subtabs.getActiveKey();
  }

  private updateSubtabVisibility(): void {
    const isVisible = this.playersTabListBackground.visible;
    const isPlayersActive =
      isVisible && this.subtabs.getActiveKey() === "players";
    const isTeamsActive = isVisible && this.subtabs.getActiveKey() === "teams";

    this.subtabs.setVisible(isVisible);

    this.playersTabListTitle.setVisible(isPlayersActive);
    this.playersTabListScrollPanel.setVisible?.(isPlayersActive);
    this.playersTabCardBackground.setVisible(isPlayersActive);
    this.playersTabCardName.setVisible(isPlayersActive);
    this.playersTabCardTeam.setVisible(isPlayersActive);
    this.playersTabCardSprite.setVisible(
      isPlayersActive &&
        Boolean(
          this.playersTabSelection &&
            this.currentMatch?.playerCharacters?.[this.playersTabSelection]
        )
    );
    const match = this.currentMatch;
    const list = this.playerOptions;
    this.playersTabEmpty.setVisible(
      isPlayersActive && (!match || list.length === 0)
    );

    this.teamsTabListTitle.setVisible(isTeamsActive);
    this.teamsTabListScrollPanel.setVisible?.(isTeamsActive);
    const teamCount = match?.teamCounts
      ? Object.keys(match.teamCounts).length
      : match?.teams?.length ?? 0;
    this.teamsTabEmpty.setVisible(isTeamsActive && (!match || teamCount === 0));
  }

  layout(options: CharacterPanelPlayerListViewLayout): void {
    const playersBoxY = options.contentTop;
    const subtabY = playersBoxY + 8;
    const subtabHeight = 28;
    const subtabBottom = subtabY + subtabHeight + 6;
    const listTop = subtabBottom + 26;
    const listHeight = PLAYER_LIST_SCROLL_HEIGHT;
    const cardTop = listTop + listHeight + 12;
    const cardHeight = CARD_HEIGHT;
    const playersBoxHeight = Math.max(
      cardTop + cardHeight + 12 - playersBoxY,
      options.panelHeight - playersBoxY - options.margin
    );

    this.playersTabListBackground.setPosition(options.margin, playersBoxY);
    this.playersTabListBackground.setSize(options.boxWidth, playersBoxHeight);
    this.playersTabListBackground.setDisplaySize(
      options.boxWidth,
      playersBoxHeight
    );

    this.subtabs.layout(
      options.margin + 12,
      subtabY,
      options.boxWidth - 24,
      subtabHeight
    );

    this.playersTabListTitle.setPosition(options.margin + 12, subtabBottom);
    this.teamsTabListTitle.setPosition(options.margin + 12, subtabBottom);

    const listWidth = Math.max(120, options.boxWidth - 24);
    this.playersTabListScrollPanel.setPosition?.(options.margin + 12, listTop);
    this.playersTabListScrollPanel.setSize?.(listWidth, listHeight);
    this.playersTabListScrollPanel.setMinSize?.(listWidth, listHeight);
    this.playersTabListScrollPanel.layout?.();

    const teamsListHeight = Math.max(0, playersBoxY + playersBoxHeight - listTop - 16);
    this.teamsTabListScrollPanel.setPosition?.(options.margin + 12, listTop);
    this.teamsTabListScrollPanel.setSize?.(listWidth, teamsListHeight);
    this.teamsTabListScrollPanel.setMinSize?.(listWidth, teamsListHeight);
    this.teamsTabListScrollPanel.layout?.();

    this.updateMaskBounds(
      options.margin,
      listTop,
      listWidth,
      listHeight,
      teamsListHeight
    );

    this.playersTabCardBackground.setPosition(
      options.margin + 12,
      cardTop
    );
    this.playersTabCardBackground.setSize(options.boxWidth - 24, cardHeight);
    this.playersTabCardBackground.setDisplaySize(options.boxWidth - 24, cardHeight);
    this.playersTabCardName.setPosition(
      options.margin + 24,
      cardTop + 12
    );
    this.playersTabCardTeam.setPosition(
      options.margin + 24,
      cardTop + 38
    );
    const cardRight =
      this.playersTabCardBackground.x + this.playersTabCardBackground.width;
    const cardCenterY =
      this.playersTabCardBackground.y +
      this.playersTabCardBackground.height / 2;
    this.playersTabCardSprite.setPosition(
      cardRight - CARD_SPRITE_PADDING,
      cardCenterY
    );
    this.playersTabEmpty.setPosition(options.margin + 24, subtabBottom + 30);
    this.teamsTabEmpty.setPosition(options.margin + 24, subtabBottom + 30);
    this.refresh();
  }

  update(
    match: MatchRecord | null,
    players: PlayerOption[],
    currentUserId?: string | null
  ): void {
    this.currentMatch = match;
    this.playerOptions = players;
    this.currentUserId = currentUserId ?? null;
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
      this.playersTabSelection =
        this.currentUserId && availableIds.has(this.currentUserId)
          ? this.currentUserId
          : list[0]?.id ?? null;
    }
    for (const entry of this.playersTabEntries) {
      entry.button.destroy();
      entry.label.destroy();
      entry.readyIcon.destroy();
    }
    this.playersTabEntries = [];
    for (const child of [...this.playersTabListContent.list]) {
      child.destroy();
    }
    this.playersTabListContent.removeAll(false);
    if (!match || list.length === 0) {
      this.playersTabListTitle.setText("Players");
      this.playersTabCardName.setText("");
      this.playersTabCardTeam.setText("");
      this.playersTabCardSprite.setVisible(false);
      this.updateSubtabVisibility();
      return;
    }
    const totalPlayers = list.length;
    let aliveCount = 0;
    for (const option of list) {
      const character = match.playerCharacters?.[option.id];
      const isDead =
        match.deadCharacters?.[option.id] === true ||
        character?.statuses?.conditions?.includes("dead") ||
        (typeof character?.stats?.health?.current === "number" &&
          character.stats.health.current <= 0);
      if (!isDead) {
        aliveCount += 1;
      }
    }
    this.playersTabListTitle.setText(`Players (${aliveCount}/${totalPlayers})`);
    const isSelfPlayer = (option: PlayerOption): boolean => {
      if (this.currentUserId && option.id === this.currentUserId) {
        return true;
      }
      return option.label.endsWith(" (You)");
    };

    const sortedPlayers = [...list].sort((a, b) => {
      const aIsSelf = isSelfPlayer(a);
      const bIsSelf = isSelfPlayer(b);
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      return a.label.localeCompare(b.label);
    });

    const rowHeight = PLAYER_ROW_HEIGHT;
    const rowSpacing = PLAYER_ROW_SPACING;
    const containerWidth = Math.max(
      120,
      this.playersTabListBackground.width - 24
    );
    const itemWidth = Math.max(80, containerWidth - 14);
    let y = 0;
    for (const option of sortedPlayers) {
      const button = this.scene.add
        .rectangle(0, y, itemWidth, rowHeight, 0x202b4a, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2f3a5d, 1)
        .setInteractive({ useHandCursor: true });
      const character = match?.playerCharacters?.[option.id];
      const isDead =
        match?.deadCharacters?.[option.id] === true ||
        character?.statuses?.conditions?.includes("dead") ||
        (typeof character?.stats?.health?.current === "number" &&
          character.stats.health.current <= 0);
      const isBot = /^bot\d+$/i.test(option.id);
      const isReady =
        !isDead && (isBot || match?.readyStates?.[option.id] === true);
      const readyIcon = this.scene.add
        .text(itemWidth - PLAYER_LIST_LABEL_PADDING, y + rowHeight / 2, "✓", {
          fontSize: "14px",
          color: "#22c55e"
        })
        .setOrigin(1, 0.5)
        .setVisible(isReady);
      const label = this.scene.add
        .text(PLAYER_LIST_LABEL_PADDING, y + rowHeight / 2, option.label, {
          fontSize: "14px",
          color: "#ffffff"
        })
        .setOrigin(0, 0.5);
      this.fitPlayerListLabelWidth(
        label,
        option.label,
        itemWidth - PLAYER_LIST_LABEL_PADDING * 2 - (isReady ? 20 : 0)
      );
      button.on(Phaser.Input.Events.POINTER_UP, () => {
        this.playersTabSelection = option.id;
        this.applySelectionStyles();
        this.refreshPlayerCard();
      });
      button.on(
        Phaser.Input.Events.POINTER_WHEEL,
        (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
          this.playersTabListScrollPanel.addChildOY?.(-dy * 0.35, true);
        }
      );
      this.playersTabListContent.add(button);
      this.playersTabListContent.add(label);
      this.playersTabListContent.add(readyIcon);
      this.playersTabEntries.push({
        playerId: option.id,
        button,
        label,
        readyIcon
      });
      y += rowHeight + rowSpacing;
    }
    this.playersTabListContent.setPosition(0, 0);
    this.playersTabListContent.setSize(itemWidth, y);
    this.applySelectionStyles();
    this.refreshPlayerCard();

    for (const entry of this.teamsTabEntries) {
      entry.destroy();
    }
    this.teamsTabEntries = [];
    for (const child of [...this.teamsTabListContent.list]) {
      child.destroy();
    }
    this.teamsTabListContent.removeAll(false);

    const teamCounts: Record<string, number> = {};
    if (match.teamCounts) {
      for (const team in match.teamCounts) {
        teamCounts[team] = match.teamCounts[team];
      }
    } else {
      if (Array.isArray(match.teams)) {
        for (const team of match.teams) {
          teamCounts[team] = 0;
        }
      }
      if (match.playerCharacters) {
        for (const id in match.playerCharacters) {
          const char = match.playerCharacters[id];
          const isDead =
            match.deadCharacters?.[id] === true ||
            char?.statuses?.conditions?.includes("dead") ||
            (typeof char?.stats?.health?.current === "number" &&
              char.stats.health.current <= 0);
          if (!isDead) {
            if (char?.teamId) {
              teamCounts[char.teamId] = (teamCounts[char.teamId] ?? 0) + 1;
            }
            if (char?.secretTeamId) {
              teamCounts[char.secretTeamId] =
                (teamCounts[char.secretTeamId] ?? 0) + 1;
            }
          }
        }
      }
    }

    const teamNames = Object.keys(teamCounts);
    const getTeamRank = (name: string) => {
      const lower = name.toLowerCase();
      if (lower === "gemelos") return 1;
      if (lower === "héroe" || lower === "heroe" || lower === "hero") return 2;
      return 0;
    };

    teamNames.sort((a, b) => {
      const rankDiff = getTeamRank(a) - getTeamRank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.localeCompare(b);
    });

    this.teamsTabListTitle.setText(`Teams (${teamNames.length})`);

    let teamY = 0;
    const teamRowHeight = 34;
    const teamRowSpacing = 6;

    for (const teamName of teamNames) {
      const aliveInTeam = teamCounts[teamName] ?? 0;
      const isEliminated = aliveInTeam === 0;

      const bg = this.scene.add
        .rectangle(
          0,
          teamY,
          itemWidth,
          teamRowHeight,
          isEliminated ? 0x24171f : 0x202b4a,
          0.95
        )
        .setOrigin(0, 0)
        .setStrokeStyle(1, isEliminated ? 0x4a2332 : 0x2f3a5d, 1);

      const nameLabel = this.scene.add
        .text(
          PLAYER_LIST_LABEL_PADDING,
          teamY + teamRowHeight / 2,
          `${teamName}:`,
          {
            fontSize: "14px",
            color: isEliminated ? "#94a3d4" : "#ffffff",
            fontStyle: "bold"
          }
        )
        .setOrigin(0, 0.5);

      const countLabel = this.scene.add
        .text(
          itemWidth - PLAYER_LIST_LABEL_PADDING,
          teamY + teamRowHeight / 2,
          `${aliveInTeam}`,
          {
            fontSize: "15px",
            color: isEliminated ? "#ef4444" : "#4ade80",
            fontStyle: "bold"
          }
        )
        .setOrigin(1, 0.5);

      this.teamsTabListContent.add(bg);
      this.teamsTabListContent.add(nameLabel);
      this.teamsTabListContent.add(countLabel);

      this.teamsTabEntries.push(bg, nameLabel, countLabel);
      teamY += teamRowHeight + teamRowSpacing;
    }

    this.teamsTabListContent.setPosition(0, 0);
    this.teamsTabListContent.setSize(itemWidth, teamY);

    this.updateSubtabVisibility();
    this.playersTabListScrollPanel.layout?.();
    this.teamsTabListScrollPanel.layout?.();
  }

  private updateMaskBounds(
    margin: number,
    listTop: number,
    listWidth: number,
    listHeight: number,
    teamsListHeight: number
  ): void {
    const matrix = this.parent.getWorldTransformMatrix();
    const worldX = matrix.tx + margin + 12;
    const worldY = matrix.ty + listTop;

    if (this.playersTabScrollMaskShape) {
      this.playersTabScrollMaskShape.setPosition(worldX, worldY);
      this.playersTabScrollMaskShape.setSize(listWidth, listHeight);
    }
    if (this.teamsTabScrollMaskShape) {
      this.teamsTabScrollMaskShape.setPosition(worldX, worldY);
      this.teamsTabScrollMaskShape.setSize(listWidth, teamsListHeight);
    }
  }

  destroy(): void {
    this.playersTabListScrollPanel?.clearMask?.();
    this.playersTabScrollMask?.destroy();
    this.playersTabScrollMaskShape?.destroy();
    this.playersTabScrollMask = null;
    this.playersTabScrollMaskShape = null;
    this.playersTabListScrollPanel?.destroy();

    this.teamsTabListScrollPanel?.clearMask?.();
    this.teamsTabScrollMask?.destroy();
    this.teamsTabScrollMaskShape?.destroy();
    this.teamsTabScrollMask = null;
    this.teamsTabScrollMaskShape = null;
    this.teamsTabListScrollPanel?.destroy();
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
    this.subtabs.setActiveKey("players", false);
    this.playersTabSelection = normalized;
    this.applySelectionStyles();
    this.refreshPlayerCard();
    this.updateSubtabVisibility();
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
    maxWidth: number
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
      const character = this.currentMatch?.playerCharacters?.[entry.playerId];
      const isDead =
        this.currentMatch?.deadCharacters?.[entry.playerId] === true ||
        character?.statuses?.conditions?.includes("dead") ||
        (typeof character?.stats?.health?.current === "number" &&
          character.stats.health.current <= 0);
      const selected = entry.playerId === this.playersTabSelection;

      if (isDead) {
        entry.button.setFillStyle(selected ? 0x6e2424 : 0x4a1818, 0.95);
        entry.button.setStrokeStyle(selected ? 2 : 1, 0xd65858, 1);
        entry.label.setColor(selected ? "#ffcccc" : "#ff9999");
      } else {
        entry.button.setFillStyle(selected ? 0x2f5e88 : 0x202b4a, 0.95);
        entry.button.setStrokeStyle(selected ? 2 : 1, 0x6ea8d6, 1);
        entry.label.setColor(selected ? "#d8f0ff" : "#ffffff");
      }
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
    const teamId = character?.teamId?.trim() || UNKNOWN_TEAM_LABEL;
    this.playersTabCardTeam.setText(`Team: ${teamId}`);

    const option = this.playerOptions.find((entry) => entry.id === selectedId);
    const texture = option?.texture ?? "char";
    const frame = option?.frame;
    const shouldShowSprite = this.playersTabCardBackground.visible;
    if (this.scene.textures.exists(texture)) {
      this.playersTabCardSprite.setTexture(texture, frame);
    } else {
      this.playersTabCardSprite.setTexture("char");
    }
    this.playersTabCardSprite
      .setDisplaySize(CARD_SPRITE_SIZE, CARD_SPRITE_SIZE)
      .setVisible(shouldShowSprite);
  }
}
