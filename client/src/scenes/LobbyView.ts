import Phaser from "phaser";
import {
  makeButton,
  addLabeledStepper,
  StepperHandle,
  addLabeledToggle,
  ToggleHandle,
  addLabeledTimeInput,
  TimeInputHandle,
  UIButton
} from "../ui/button";
import { InMatchSettings } from "@shared";

type FixWidthSizerInstance = Phaser.GameObjects.GameObject & {
  width: number;
  height: number;
  setPosition: (x: number, y: number) => Phaser.GameObjects.GameObject;
  setSize: (width: number, height: number) => Phaser.GameObjects.GameObject;
  setMinSize: (width: number, height: number) => Phaser.GameObjects.GameObject;
  layout: () => Phaser.GameObjects.GameObject;
  add: (
    child: Phaser.GameObjects.GameObject,
    config?: Record<string, unknown>
  ) => FixWidthSizerInstance;
};

export class LobbyView {
  private static readonly MAX_NAME_LENGTH = 64;
  private static readonly DEFAULT_MATCH_NAME = "Zarka game";
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private matchIdText!: Phaser.GameObjects.Text;
  private matchNameText!: Phaser.GameObjects.Text;
  private creatorText!: Phaser.GameObjects.Text;
  private playerListTitle!: Phaser.GameObjects.Text;
  private playerListText!: Phaser.GameObjects.Text;
  private headerSizer!: FixWidthSizerInstance;
  private actionSizer!: FixWidthSizerInstance;
  private settingsSizer!: FixWidthSizerInstance;

  private players = 2;
  private cols = 5;
  private rows = 4;
  private roundTime = "23:00";
  private autoSkip = true;
  private botPlayers = 0;
  private turnsToBeAt1Tile = 30;
  private matchName = LobbyView.DEFAULT_MATCH_NAME;
  private maxPlayers = 2;
  private isHost = false;
  private playerNames: string[] = [];
  private playersStepper?: StepperHandle;
  private colsStepper?: StepperHandle;
  private rowsStepper?: StepperHandle;
  private roundTimeInput?: TimeInputHandle;
  private autoSkipToggle?: ToggleHandle;
  private botPlayersStepper?: StepperHandle;
  private turnsToBeAt1TileStepper?: StepperHandle;
  private renameButton?: UIButton;
  private startMatchButton?: UIButton;
  private removeMatchButton?: UIButton;
  private returnToGameButton?: UIButton;

  private onLeave?: () => void | Promise<void>;
  private onEndTurn?: () => void | Promise<void>;
  private onSettingsChange?: (s: InMatchSettings) => void | Promise<void>;
  private onStartMatch?: () => void | Promise<void>;
  private onRemoveMatch?: () => void | Promise<void>;

  private started = false;
  private startMatchBusy = false;

  private static readonly CONTENT_MAX_WIDTH = 920;
  private static readonly HORIZONTAL_PADDING = 24;
  private static readonly SECTION_GAP = 16;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.title = scene.add.text(0, 0, "Match Lobby", {
      color: "#ffffff",
      fontSize: "20px"
    });
    this.container.add(this.title);

    this.matchIdText = scene.add.text(0, 0, "Match: -", {
      color: "#cccccc"
    });

    this.matchNameText = scene.add.text(0, 0, `Name: ${this.matchName}`, {
      color: "#cccccc"
    });

    this.creatorText = scene.add.text(0, 0, "Creator: -", {
      color: "#cccccc"
    });

    this.headerSizer = scene.rexUI.add.fixWidthSizer({
      width: 1,
      height: 1,
      space: { item: 12, line: 8 }
    }) as FixWidthSizerInstance;
    this.container.add(this.headerSizer);
    this.headerSizer.add(this.matchIdText, { padding: 2 });
    this.headerSizer.add(this.matchNameText, { padding: 2 });
    this.headerSizer.add(this.creatorText, { padding: 2 });

    this.renameButton = makeButton(
      scene,
      0,
      0,
      "Rename",
      async () => {
        this.promptRename();
      },
      ["inMatch"]
    );
    this.headerSizer.add(this.renameButton, { padding: 2 });
    this.setRenameEnabled(this.isHost);

    this.actionSizer = scene.rexUI.add.fixWidthSizer({
      width: 1,
      height: 1,
      space: { item: 12, line: 10 }
    }) as FixWidthSizerInstance;
    this.container.add(this.actionSizer);

    const leaveBtn = makeButton(
      scene,
      0,
      0,
      "Leave Match",
      async () => {
        if (this.onLeave) await this.onLeave();
      },
      ["inMatch"]
    );
    this.actionSizer.add(leaveBtn, { padding: 2 });

    const endTurnBtn = makeButton(
      scene,
      0,
      0,
      "End Turn",
      async () => {
        if (this.onEndTurn) await this.onEndTurn();
      },
      ["inMatch"]
    );
    this.actionSizer.add(endTurnBtn, { padding: 2 });

    this.startMatchButton = makeButton(
      scene,
      0,
      0,
      "Start Match",
      async () => {
        if (this.started || this.startMatchBusy) return;
        if (!this.onStartMatch) return;
        const confirmed = window.confirm(
          "Are you sure you want to start the match? Players will no longer be able to join."
        );
        if (!confirmed) return;
        this.setStartMatchBusy(true);
        try {
          await this.onStartMatch();
        } finally {
          this.setStartMatchBusy(false);
        }
      },
      ["inMatch"]
    );
    this.actionSizer.add(this.startMatchButton, { padding: 2 });

    this.removeMatchButton = makeButton(
      scene,
      0,
      0,
      "Remove Match",
      async () => {
        if (!this.onRemoveMatch) return;
        const confirmed = window.confirm(
          "Are you sure you want to remove this match? This action cannot be undone."
        );
        if (confirmed) {
          await this.onRemoveMatch();
        }
      },
      ["inMatch"]
    );
    this.actionSizer.add(this.removeMatchButton, { padding: 2 });
    this.setRemoveMatchEnabled(this.isHost);

    this.settingsSizer = scene.rexUI.add.fixWidthSizer({
      width: 1,
      height: 1,
      space: { item: 12, line: 12 }
    }) as FixWidthSizerInstance;
    this.container.add(this.settingsSizer);

    this.playersStepper = addLabeledStepper(
      this.scene,
      this.container,
      0,
      0,
      "Players",
      1,
      100,
      () => this.players,
      (v) => {
        this.players = Phaser.Math.Clamp(v, 1, 100);
        this.maxPlayers = this.players;
        this.refreshPlayerList();
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.colsStepper = addLabeledStepper(
      this.scene,
      this.container,
      0,
      0,
      "Columns",
      1,
      100,
      () => this.cols,
      (v) => {
        this.cols = Phaser.Math.Clamp(v, 1, 100);
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.rowsStepper = addLabeledStepper(
      this.scene,
      this.container,
      0,
      0,
      "Rows",
      1,
      100,
      () => this.rows,
      (v) => {
        this.rows = Phaser.Math.Clamp(v, 1, 100);
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.roundTimeInput = addLabeledTimeInput(
      this.scene,
      this.container,
      0,
      0,
      "Skip Time",
      () => this.roundTime,
      (v) => {
        this.roundTime = v;
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.autoSkipToggle = addLabeledToggle(
      this.scene,
      this.container,
      0,
      0,
      "Skip",
      () => this.autoSkip,
      (v) => {
        this.autoSkip = v;
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.botPlayersStepper = addLabeledStepper(
      this.scene,
      this.container,
      0,
      0,
      "Bots",
      0,
      10,
      () => this.botPlayers,
      (v) => {
        this.botPlayers = Phaser.Math.Clamp(v, 0, 10);
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.turnsToBeAt1TileStepper = addLabeledStepper(
      this.scene,
      this.container,
      0,
      0,
      "Destroy",
      5,
      200,
      () => this.turnsToBeAt1Tile,
      (v) => {
        this.turnsToBeAt1Tile = Phaser.Math.Clamp(v, 5, 200);
        this.emitSettings();
      },
      true,
      this.isHost
    );

    const settingsControls = [
      this.playersStepper.container,
      this.colsStepper.container,
      this.rowsStepper.container,
      this.roundTimeInput.container,
      this.autoSkipToggle.container,
      this.botPlayersStepper.container,
      this.turnsToBeAt1TileStepper.container
    ];
    for (const control of settingsControls) {
      this.container.remove(control, false);
      this.settingsSizer.add(control, { padding: 2 });
    }

    this.playerListTitle = scene.add.text(0, 0, "Players", {
      color: "#a0ffa0",
      fontSize: "18px"
    });
    this.container.add(this.playerListTitle);

    this.playerListText = scene.add.text(0, 0, "Waiting for players...", {
      color: "#cccccc"
    });
    this.container.add(this.playerListText);

    this.refreshPlayerList();
    this.updateStartButtonState();

    this.returnToGameButton = makeButton(
      scene,
      0,
      0,
      "← Return",
      () => {
        scene.scene.sleep("MainScene");
        scene.scene.run("GameScene");
      },
      ["inMatch"]
    );
    this.returnToGameButton.setScrollFactor(0);
    this.container.add(this.returnToGameButton);
    this.returnToGameButton.setVisible(false);

    this.layout();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(): void {
    const viewportWidth = this.scene.scale.width;
    const viewportHeight = this.scene.scale.height;
    const contentWidth = Math.min(
      LobbyView.CONTENT_MAX_WIDTH,
      Math.max(
        280,
        viewportWidth - LobbyView.HORIZONTAL_PADDING * 2
      )
    );
    const contentLeft = (viewportWidth - contentWidth) / 2;
    const contentTop = LobbyView.HORIZONTAL_PADDING;

    this.container.setPosition(contentLeft, contentTop);
    this.title.setPosition(0, 0);

    const metadataWidth = Math.min(240, contentWidth);
    this.matchIdText.setFixedSize(metadataWidth, 24);
    this.matchNameText.setFixedSize(metadataWidth, 24);
    this.creatorText.setFixedSize(metadataWidth, 24);
    this.matchIdText.setWordWrapWidth(metadataWidth, true);
    this.matchNameText.setWordWrapWidth(metadataWidth, true);
    this.creatorText.setWordWrapWidth(metadataWidth, true);

    let cursorY = this.title.height + 12;
    const layoutSizer = (sizer: FixWidthSizerInstance) => {
      sizer.setPosition(0, cursorY);
      sizer.setMinSize(contentWidth, 0);
      sizer.setSize(contentWidth, 0);
      sizer.layout();
      cursorY += sizer.height + LobbyView.SECTION_GAP;
    };

    layoutSizer(this.headerSizer);
    layoutSizer(this.actionSizer);
    layoutSizer(this.settingsSizer);

    this.playerListTitle.setPosition(0, cursorY);
    cursorY += this.playerListTitle.height + 6;
    this.playerListText.setWordWrapWidth(contentWidth, true);
    this.playerListText.setPosition(0, cursorY);

    if (this.returnToGameButton) {
      this.returnToGameButton.setPosition(
        Math.max(0, contentWidth - this.returnToGameButton.width),
        Math.max(
          cursorY + this.playerListText.height + 20,
          viewportHeight - contentTop - this.returnToGameButton.height - 16
        )
      );
    }
  }

  setOnLeave(handler: () => void | Promise<void>) {
    this.onLeave = handler;
  }

  setOnEndTurn(handler: () => void | Promise<void>) {
    this.onEndTurn = handler;
  }

  setOnSettingsChange(handler: (s: InMatchSettings) => void | Promise<void>) {
    this.onSettingsChange = handler;
  }

  setOnStartMatch(handler: () => void | Promise<void>) {
    this.onStartMatch = handler;
    this.updateStartButtonState();
  }

  setOnRemoveMatch(handler: () => void | Promise<void>) {
    this.onRemoveMatch = handler;
  }

  setMatchInfo(matchId?: string, matchName?: string) {
    this.matchIdText.setText(`Match: ${matchId ?? "-"}`);
    if (typeof matchName === "string") {
      this.setMatchName(matchName);
    }
    if (!matchId) {
      this.setMatchStarted(false);
    }
  }

  setMatchName(matchName?: string) {
    this.applyMatchName(matchName);
  }

  setCreator(creatorId?: string, isSelf?: boolean, creatorName?: string) {
    const normalizedName =
      typeof creatorName === "string"
        ? creatorName.trim().replace(/\s+/g, " ")
        : undefined;
    const label = isSelf
      ? "You"
      : normalizedName && normalizedName.length > 0
        ? normalizedName
        : (creatorId ?? "-");
    this.creatorText.setText(`Creator: ${label}`);
    this.isHost = !!isSelf;
    const enabled = this.isHost;
    this.playersStepper?.setEnabled(enabled);
    this.colsStepper?.setEnabled(enabled);
    this.rowsStepper?.setEnabled(enabled);
    this.roundTimeInput?.setEnabled(enabled);
    this.autoSkipToggle?.setEnabled(enabled);
    this.botPlayersStepper?.setEnabled(enabled);
    this.turnsToBeAt1TileStepper?.setEnabled(enabled);
    this.setRenameEnabled(enabled);
    this.setRemoveMatchEnabled(enabled);
    this.updateStartButtonState();
  }

  applySettings(partial: {
    size?: number;
    cols?: number;
    rows?: number;
    roundTime?: string;
    autoSkip?: boolean;
    botPlayers?: number;
    turnsToBeAt1Tile?: number;
    name?: string;
    started?: boolean;
  }) {
    if (typeof partial.size === "number") {
      this.players = Phaser.Math.Clamp(partial.size, 1, 100);
      this.maxPlayers = this.players;
      this.playersStepper?.setDisplayValue(this.players);
    }
    if (typeof partial.cols === "number") {
      this.cols = Phaser.Math.Clamp(partial.cols, 1, 100);
      this.colsStepper?.setDisplayValue(this.cols);
    }
    if (typeof partial.rows === "number") {
      this.rows = Phaser.Math.Clamp(partial.rows, 1, 100);
      this.rowsStepper?.setDisplayValue(this.rows);
    }
    if (typeof partial.roundTime === "string") {
      this.roundTime = partial.roundTime;
      this.roundTimeInput?.setDisplayValue(this.roundTime);
    }
    if (typeof partial.autoSkip === "boolean") {
      this.autoSkip = partial.autoSkip;
      this.autoSkipToggle?.setDisplayValue(this.autoSkip);
    }
    if (typeof partial.botPlayers === "number") {
      this.botPlayers = Phaser.Math.Clamp(partial.botPlayers, 0, 10);
      this.botPlayersStepper?.setDisplayValue(this.botPlayers);
    }
    if (typeof partial.turnsToBeAt1Tile === "number") {
      this.turnsToBeAt1Tile = Phaser.Math.Clamp(
        partial.turnsToBeAt1Tile,
        5,
        200
      );
      this.turnsToBeAt1TileStepper?.setDisplayValue(this.turnsToBeAt1Tile);
    }
    if (typeof partial.name === "string") {
      this.applyMatchName(partial.name);
    }
    if (typeof partial.started === "boolean") {
      this.setMatchStarted(partial.started);
    }
    this.refreshPlayerList();
  }

  show() {
    this.layout();
    this.container.setVisible(true).setActive(true);
  }

  hide() {
    this.container.setVisible(false).setActive(false);
  }

  getSettings(): InMatchSettings {
    return {
      players: this.players,
      cols: this.cols,
      rows: this.rows,
      roundTime: this.roundTime,
      autoSkip: this.autoSkip,
      botPlayers: this.botPlayers,
      turnsToBeAt1Tile: this.turnsToBeAt1Tile,
      name: this.matchName
    };
  }

  private emitSettings() {
    if (this.onSettingsChange) this.onSettingsChange(this.getSettings());
  }

  private normalizeMatchName(value?: string): string {
    if (typeof value !== "string") return LobbyView.DEFAULT_MATCH_NAME;
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (!trimmed) return LobbyView.DEFAULT_MATCH_NAME;
    return trimmed.slice(0, LobbyView.MAX_NAME_LENGTH);
  }

  private applyMatchName(name?: string): boolean {
    const normalized = this.normalizeMatchName(name ?? this.matchName);
    if (normalized === this.matchName) {
      if (this.matchNameText) {
        this.matchNameText.setText(`Name: ${this.matchName}`);
      }
      return false;
    }
    this.matchName = normalized;
    if (this.matchNameText) {
      this.matchNameText.setText(`Name: ${this.matchName}`);
    }
    return true;
  }

  private promptRename() {
    if (!this.isHost) return;
    const input = window.prompt("Match name", this.matchName);
    if (input === null) return;
    const changed = this.applyMatchName(input);
    if (changed) {
      this.emitSettings();
    }
  }

  private setRenameEnabled(enabled: boolean) {
    if (!this.renameButton) return;
    if (enabled) {
      this.renameButton.setAlpha(1);
      this.renameButton.setInteractive({ useHandCursor: true });
    } else {
      this.renameButton.setAlpha(0.5);
      this.renameButton.disableInteractive();
    }
    this.isHost = enabled;
  }

  private setRemoveMatchEnabled(enabled: boolean) {
    if (!this.removeMatchButton) return;
    if (enabled) {
      this.removeMatchButton.setAlpha(1);
      this.removeMatchButton.setInteractive({ useHandCursor: true });
    } else {
      this.removeMatchButton.setAlpha(0.5);
      this.removeMatchButton.disableInteractive();
    }
  }

  setMatchStarted(started: boolean) {
    this.started = started;
    if (started) {
      this.startMatchBusy = false;
    }
    this.updateStartButtonState();
    if (this.returnToGameButton) {
      this.returnToGameButton.setVisible(started);
    }
    this.layout();
  }

  setPlayers(usernames: string[]) {
    const sanitized = Array.isArray(usernames)
      ? usernames
          .map((name) =>
            typeof name === "string" ? name.trim().replace(/\s+/g, " ") : ""
          )
          .filter((name) => name.length > 0)
      : [];
    this.playerNames = sanitized;
    this.refreshPlayerList();
  }

  private refreshPlayerList() {
    if (!this.playerListTitle || !this.playerListText) return;
    const playerCount = this.playerNames.length;
    const capacity = Math.max(this.maxPlayers, 1);
    this.playerListTitle.setText(`Players (${playerCount}/${capacity})`);
    if (playerCount === 0) {
      this.playerListText.setText("Waiting for players...");
      this.layout();
      return;
    }
    const lines = this.playerNames.map((name, idx) => `${idx + 1}. ${name}`);
    this.playerListText.setText(lines.join("\n"));
    this.layout();
  }

  private updateStartButtonState() {
    if (!this.startMatchButton) return;
    const canStart = this.isHost && !this.started && !this.startMatchBusy;
    if (canStart) {
      this.startMatchButton.setAlpha(1);
      this.startMatchButton.setText(
        this.startMatchBusy ? "[ Starting... ]" : "[ Start Match ]"
      );
      this.startMatchButton.setInteractive({ useHandCursor: true });
    } else {
      const label = this.started
        ? "[ Match Started ]"
        : this.startMatchBusy
          ? "[ Starting... ]"
          : "[ Start Match ]";
      this.startMatchButton.setText(label);
      this.startMatchButton.setAlpha(this.started ? 0.6 : 0.5);
      this.startMatchButton.disableInteractive();
    }
  }

  private setStartMatchBusy(busy: boolean) {
    this.startMatchBusy = busy;
    if (this.startMatchButton) {
      this.startMatchButton.setText(
        busy ? "[ Starting... ]" : "[ Start Match ]"
      );
    }
    this.updateStartButtonState();
  }
}
