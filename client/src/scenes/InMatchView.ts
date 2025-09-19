import Phaser from "phaser";
import { makeButton, addLabeledStepper, StepperHandle, addLabeledToggle, ToggleHandle, addLabeledTimeInput, TimeInputHandle } from "../ui/button";
import { InMatchSettings } from "@shared";

export class InMatchView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private matchIdText!: Phaser.GameObjects.Text;
  private settingsText!: Phaser.GameObjects.Text;
  private creatorText!: Phaser.GameObjects.Text;

  private players = 2;
  private cols = 5;
  private rows = 4;
  private roundTime = "23:00"; // Default time for round forcing
  private autoSkip = true; // Default auto-skip enabled
  private botPlayers = 0; // Default no bot players
  private isHost = false;
  private playersStepper?: StepperHandle;
  private colsStepper?: StepperHandle;
  private rowsStepper?: StepperHandle;
  private roundTimeInput?: TimeInputHandle;
  private autoSkipToggle?: ToggleHandle;
  private botPlayersStepper?: StepperHandle;

  private onLeave?: () => void | Promise<void>;
  private onEndTurn?: () => void | Promise<void>;
  private onSettingsChange?: (s: InMatchSettings) => void | Promise<void>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add
      .container(0, 0)
      .setVisible(false)
      .setActive(false);

    this.title = scene.add.text(10, 10, "In Match", {
      color: "#ffffff",
      fontSize: "20px",
    });
    this.container.add(this.title);

    this.matchIdText = scene.add.text(10, 40, "Match: -", {
      color: "#cccccc",
    });
    this.container.add(this.matchIdText);

    this.creatorText = scene.add.text(300, 60, "Creator: -", {
      color: "#cccccc",
    });
    this.container.add(this.creatorText);

    // Controls
    let y = 80;

    // Leave match
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

    // End turn
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

    y += 40;

    // Players control
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
        // Clamp to 1..100 just in case a custom input sneaks in
        this.players = Phaser.Math.Clamp(v, 1, 100);
        this.emitSettings();
      },
      true, // onlyHost
      this.isHost
    );

    // Columns control
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
      true, // onlyHost
      this.isHost
    );

    // Rows control
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
      true, // onlyHost
      this.isHost
    );

    y += 40;

    // Round Time control
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
      true, // onlyHost
      this.isHost
    );

    // Auto-skip control
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
      true, // onlyHost
      this.isHost
    );

    // Bot Players control
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
      true, // onlyHost
      this.isHost
    );

    y += 60;

    this.settingsText = scene.add.text(10, y, this.settingsSummary(), {
      color: "#a0a0ff",
    });
    this.container.add(this.settingsText);
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

  setMatchInfo(matchId?: string) {
    this.matchIdText.setText(`Match: ${matchId ?? "-"}`);
  }

  setCreator(creatorId?: string, isSelf = false) {
    const label = isSelf ? "You" : creatorId ?? "-";
    this.creatorText.setText(`Creator: ${label}`);
    this.isHost = !!isSelf;
    // Toggle host-only steppers accordingly
    const enabled = this.isHost;
    this.playersStepper?.setEnabled(enabled);
    this.colsStepper?.setEnabled(enabled);
    this.rowsStepper?.setEnabled(enabled);
    this.roundTimeInput?.setEnabled(enabled);
    this.autoSkipToggle?.setEnabled(enabled);
    this.botPlayersStepper?.setEnabled(enabled);
  }

  // Apply settings coming from the server (host changes) and refresh UI fields without re-emitting
  applySettings(partial: { 
    size?: number; 
    cols?: number; 
    rows?: number; 
    roundTime?: string; 
    autoSkip?: boolean; 
    botPlayers?: number; 
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
    // Update summary label
    this.settingsText.setText(this.settingsSummary());
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
      botPlayers: this.botPlayers
    };
  }

  private emitSettings() {
    this.settingsText.setText(this.settingsSummary());
    if (this.onSettingsChange) this.onSettingsChange(this.getSettings());
  }

  private settingsSummary() {
    return `Settings -> Players: ${this.players} | Map: ${this.cols} x ${this.rows} | Round Time: ${this.roundTime} | Auto-skip: ${this.autoSkip ? "ON" : "OFF"} | Bots: ${this.botPlayers}`;
  }
}
