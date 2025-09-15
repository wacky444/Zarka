import Phaser from "phaser";
import { makeButton, addLabeledStepper } from "../ui/button";
import { InMatchSettings } from "@shared";

export class InMatchView {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private matchIdText!: Phaser.GameObjects.Text;
  private settingsText!: Phaser.GameObjects.Text;

  private players = 2;
  private cols = 5;
  private rows = 4;

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
    addLabeledStepper(
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
      }
    );

    // Columns control
    addLabeledStepper(
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
      }
    );

    // Rows control
    addLabeledStepper(
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
      }
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

  show() {
    this.container.setVisible(true).setActive(true);
  }

  hide() {
    this.container.setVisible(false).setActive(false);
  }

  getSettings(): InMatchSettings {
    return { players: this.players, cols: this.cols, rows: this.rows };
  }

  private emitSettings() {
    this.settingsText.setText(this.settingsSummary());
    if (this.onSettingsChange) this.onSettingsChange(this.getSettings());
  }

  private settingsSummary() {
    return `Settings -> Players: ${this.players} | Map: ${this.cols} x ${this.rows}`;
  }
}
