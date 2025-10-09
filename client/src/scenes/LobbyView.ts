import Phaser from "phaser";
import {
  makeButton,
  addLabeledStepper,
  StepperHandle,
  addLabeledToggle,
  ToggleHandle,
  addLabeledTimeInput,
  TimeInputHandle,
  UIButton,
} from "../ui/button";
import { InMatchSettings } from "@shared";

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

  private players = 2;
  private cols = 5;
  private rows = 4;
  private roundTime = "23:00";
  private autoSkip = true;
  private botPlayers = 0;
  private matchName = LobbyView.DEFAULT_MATCH_NAME;
  private isHost = false;
  private playerNames: string[] = [];
  private playersStepper?: StepperHandle;
  private colsStepper?: StepperHandle;
  private rowsStepper?: StepperHandle;
  private roundTimeInput?: TimeInputHandle;
  private autoSkipToggle?: ToggleHandle;
  private botPlayersStepper?: StepperHandle;
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

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.title = scene.add.text(10, 10, "Match Lobby", {
      color: "#ffffff",
      fontSize: "20px",
    });
    this.container.add(this.title);

    this.matchIdText = scene.add.text(10, 40, "Match: -", {
      color: "#cccccc",
    });
    this.container.add(this.matchIdText);

    this.matchNameText = scene.add.text(10, 60, `Name: ${this.matchName}`, {
      color: "#cccccc",
    });
    this.container.add(this.matchNameText);

    this.creatorText = scene.add.text(300, 40, "Creator: -", {
      color: "#cccccc",
    });
    this.container.add(this.creatorText);

    this.renameButton = makeButton(
      scene,
      300,
      58,
      "Rename",
      async () => {
        this.promptRename();
      },
      ["inMatch"]
    );
    this.container.add(this.renameButton);
    this.setRenameEnabled(this.isHost);

    let y = 80;

    const leaveBtn = makeButton(
      scene,
      10,
      y,
      "Leave Match",
      async () => {
        if (this.onLeave) await this.onLeave();
      },
      ["inMatch"]
    );
    this.container.add(leaveBtn);

    const endTurnBtn = makeButton(
      scene,
      150,
      y,
      "End Turn",
      async () => {
        if (this.onEndTurn) await this.onEndTurn();
      },
      ["inMatch"]
    );
    this.container.add(endTurnBtn);

    this.startMatchButton = makeButton(
      scene,
      290,
      y,
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
    this.container.add(this.startMatchButton);

    this.removeMatchButton = makeButton(
      scene,
      450,
      y,
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
    this.container.add(this.removeMatchButton);
    this.setRemoveMatchEnabled(this.isHost);

    y += 40;

    this.playersStepper = addLabeledStepper(
      this.scene,
      this.container,
      10,
      y,
      "Players",
      1,
      100,
      () => this.players,
      (v) => {
        this.players = Phaser.Math.Clamp(v, 1, 100);
        this.refreshPlayerList();
        this.emitSettings();
      },
      true,
      this.isHost
    );

    this.colsStepper = addLabeledStepper(
      this.scene,
      this.container,
      230,
      y,
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
      470,
      y,
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

    y += 40;

    this.roundTimeInput = addLabeledTimeInput(
      this.scene,
      this.container,
      10,
      y,
      "Round Time",
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
      230,
      y,
      "Auto-skip",
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
      470,
      y,
      "Bot Players",
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

    y += 60;

    this.playerListTitle = scene.add.text(10, y, "Players", {
      color: "#a0ffa0",
      fontSize: "18px",
    });
    this.container.add(this.playerListTitle);

    this.playerListText = scene.add.text(10, y + 24, "Waiting for players...", {
      color: "#cccccc",
    });
    this.container.add(this.playerListText);

    this.refreshPlayerList();
    this.updateStartButtonState();

    const cam = scene.cameras.main;
    this.returnToGameButton = makeButton(
      scene,
      cam.width - 100,
      cam.height - 40,
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

  setCreator(creatorId?: string, isSelf = false, creatorName?: string) {
    const normalizedName =
      typeof creatorName === "string"
        ? creatorName.trim().replace(/\s+/g, " ")
        : undefined;
    const label = isSelf
      ? "You"
      : normalizedName && normalizedName.length > 0
      ? normalizedName
      : creatorId ?? "-";
    this.creatorText.setText(`Creator: ${label}`);
    this.isHost = !!isSelf;
    const enabled = this.isHost;
    this.playersStepper?.setEnabled(enabled);
    this.colsStepper?.setEnabled(enabled);
    this.rowsStepper?.setEnabled(enabled);
    this.roundTimeInput?.setEnabled(enabled);
    this.autoSkipToggle?.setEnabled(enabled);
    this.botPlayersStepper?.setEnabled(enabled);
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
    name?: string;
    started?: boolean;
  }) {
    if (typeof partial.size === "number") {
      this.players = Phaser.Math.Clamp(partial.size, 1, 100);
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
    if (typeof partial.name === "string") {
      this.applyMatchName(partial.name);
    }
    if (typeof partial.started === "boolean") {
      this.setMatchStarted(partial.started);
    }
    this.refreshPlayerList();
  }

  show() {
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
      name: this.matchName,
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
    this.playerListTitle.setText(`Players (${playerCount}/${this.players})`);
    if (playerCount === 0) {
      this.playerListText.setText("Waiting for players...");
      return;
    }
    const lines = this.playerNames.map((name, idx) => `${idx + 1}. ${name}`);
    this.playerListText.setText(lines.join("\n"));
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
