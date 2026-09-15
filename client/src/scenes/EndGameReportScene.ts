import Phaser from "phaser";
import type { GetMatchReportPayload, MatchReport, MatchReportPlayer, Skin } from "@shared";
import { DEFAULT_SKIN } from "@shared";
import { t } from "../services/i18n";
import type { TurnService } from "../services/turnService";
import { makeButton, type UIButton } from "../ui/button";
import { createSkinContainer } from "../ui/PlayerSkinRenderer";
import { assetPath } from "../utils/assetPath";

interface ScrollablePanel extends Phaser.GameObjects.GameObject {
  layout?: () => void;
  setPosition: (x: number, y: number) => ScrollablePanel;
  setSize?: (width: number, height: number) => ScrollablePanel;
}

export interface EndGameReportSceneData {
  matchId: string;
}

const ACHIEVEMENT_LABELS: Record<string, string> = {
  mvp: "MVP",
  executioner: "Executioner",
  tank: "Tank",
  pacifist: "Pacifist",
  hoarder: "Hoarder",
  scavenger: "Scavenger",
  glutton: "Glutton",
  medic: "Medic",
  runner: "Runner",
};

export class EndGameReportScene extends Phaser.Scene {
  private readonly reportId = "EndGameReportScene";
  private root!: Phaser.GameObjects.Container;
  private scrollPanel!: ScrollablePanel;
  private statusText!: Phaser.GameObjects.Text;
  private report: MatchReport | null = null;
  private turnService: TurnService | null = null;
  private matchId = "";
  private returnButton!: UIButton;

  constructor() {
    super("EndGameReportScene");
  }

  preload() {
    this.load.atlasXML(
      "char",
      assetPath("assets/spritesheets/roguelikeChar_transparent.png"),
      assetPath("assets/spritesheets/roguelikeChar_transparent.xml"),
    );
  }

  async create(data?: EndGameReportSceneData) {
    this.matchId = data?.matchId ?? "";
    this.turnService = this.registry.get("turnService") as TurnService | null;
    this.createLayout();

    if (!this.matchId || !this.turnService) {
      this.showError(t("Report unavailable"));
      return;
    }

    this.statusText.setText(t("Loading end-game report..."));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.turnService.getMatchReport(this.matchId);
        const raw = (response as unknown as { payload?: unknown }).payload;
        const payload = (
          typeof raw === "string" ? JSON.parse(raw) : raw
        ) as GetMatchReportPayload | undefined;
        if (payload?.ok && payload.report) {
          this.report = payload.report;
          this.renderReport(payload.report);
          return;
        }
      } catch (error) {
        console.warn("Failed to load end-game report", error);
      }
      if (attempt < 2) {
        await new Promise((resolve) => this.time.delayedCall(500, resolve));
      }
    }
    this.showError(t("Report unavailable"));
  }

  private createLayout() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.cameras.main.setBackgroundColor("#070913");

    this.statusText = this.add
      .text(width / 2, 22, t("Loading end-game report..."), {
        color: "#cbd5e1",
        fontSize: "16px",
        align: "center",
      })
      .setOrigin(0.5, 0);

    this.root = this.add.container(0, 0);
    this.scrollPanel = this.rexUI.add.scrollablePanel({
      x: 0,
      y: 54,
      width,
      height: Math.max(120, height - 110),
      scrollMode: 0,
      panel: {
        child: this.root,
        mask: true,
      },
      slider: {
        track: this.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: this.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6),
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true,
      },
      mouseWheelScroller: {
        focus: 2,
        speed: 0.5,
      },
      space: { left: 12, right: 12, top: 8, bottom: 8, panel: 8 },
    }) as unknown as ScrollablePanel;
    this.scrollPanel.setPosition(0, 54);
    this.scrollPanel.layout?.();

    this.returnButton = makeButton(
      this,
      width / 2,
      height - 32,
      t("Back to Menu"),
      () => this.returnToMenu(),
      ["report"],
    ).setOrigin(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
  }

  private handleResize() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.statusText.setPosition(width / 2, 22);
    this.scrollPanel.setSize?.(width, Math.max(120, height - 110));
    this.returnButton.setPosition(width / 2, height - 32);
    this.scrollPanel.layout?.();
    if (this.report) {
      this.renderReport(this.report);
    }
  }

  private renderReport(report: MatchReport) {
    this.root.removeAll(true);
    const width = Math.max(280, this.scale.width - 48);
    let y = 16;

    const title = report.winning_team_id
      ? t("Victory!")
      : t("Match Draw");
    const titleText = this.add
      .text(width / 2, y, title, {
        color: report.winning_team_id ? "#fbbf24" : "#38bdf8",
        fontSize: "34px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.root.add(titleText);
    y += 48;

    const matchName = report.name ? `${report.name} · ` : "";
    const summary = this.add
      .text(width / 2, y, `${matchName}${t("Turns")}: ${report.turns}`, {
        color: "#cbd5e1",
        fontSize: "16px",
      })
      .setOrigin(0.5, 0);
    this.root.add(summary);
    y += 36;

    y = this.addSectionTitle(width, y, t("Team Leaderboard"));
    for (const team of report.teams) {
      const teamText = `${team.rank}. ${team.team_id}${team.won ? ` · ${t("Winner")}` : ""}\n${t("Damage")}: ${team.total_damage_dealt}   ${t("Received")}: ${team.total_damage_received}   ${t("Kills")}: ${team.kills}`;
      y = this.addCard(width, y, teamText, team.won ? "#854d0e" : "#172554");
    }

    if (report.winning_character_ids.length > 0) {
      y = this.addSectionTitle(width, y + 8, t("Winning Characters"));
      const winners = report.players.filter((player) =>
        report.winning_character_ids.indexOf(player.character_id) !== -1,
      );
      y = this.addWinnerRow(width, y, winners);
    }

    y = this.addSectionTitle(width, y + 12, t("Player Statistics"));
    for (const player of report.players) {
      const playerText = `${player.player_name} · ${player.character_name}\n${t("Damage")}: ${player.damage_dealt}   ${t("Received")}: ${player.damage_received}   ${t("Kills")}: ${player.players_killed}\n${t("Actions")}: ${player.actions_used}   ${t("Items")}: ${player.items_collected}   ${t("Average weight")}: ${player.average_weight_carried.toFixed(1)}   ${player.alive ? t("Alive") : t("Eliminated")}`;
      y = this.addCard(width, y, playerText, player.alive ? "#14532d" : "#3f1d2e");
    }

    y = this.addSectionTitle(width, y + 12, t("Achievements"));
    if (report.achievements.length === 0) {
      y = this.addCard(width, y, t("No achievements awarded"), "#172554");
    } else {
      for (const achievement of report.achievements) {
        const player = report.players.find(
          (entry) => entry.player_id === achievement.player_id,
        );
        const label = t(
          ACHIEVEMENT_LABELS[achievement.id] ?? achievement.id,
        );
        const value =
          typeof achievement.value === "number"
            ? ` · ${achievement.value.toFixed(1)}`
            : "";
        y = this.addCard(
          width,
          y,
          `${label}${value}\n${player?.player_name ?? t("Unknown")}`,
          "#422006",
        );
      }
    }

    this.root.setSize(width, y + 24);
    this.statusText.setText("");
    this.scrollPanel.layout?.();
  }

  private addSectionTitle(width: number, y: number, text: string): number {
    const title = this.add
      .text(width / 2, y, text, {
        color: "#f8fafc",
        fontSize: "22px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.root.add(title);
    return y + 36;
  }

  private addCard(width: number, y: number, text: string, color: string): number {
    const lines = text.split("\n").length;
    const height = lines > 1 ? 70 : 48;
    const background = this.add
      .rectangle(width / 2, y + height / 2, width, height, parseInt(color.slice(1), 16), 1)
      .setOrigin(0.5);
    const label = this.add
      .text(16, y + height / 2, text, {
        color: "#f8fafc",
        fontSize: "15px",
        lineSpacing: 5,
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0, 0.5);
    this.root.add([background, label]);
    return y + height + 8;
  }

  private addWinnerRow(
    width: number,
    y: number,
    winners: MatchReportPlayer[],
  ): number {
    const rowHeight = 86;
    const row = this.add.container(0, y);
    for (let index = 0; index < winners.length; index += 1) {
      const player = winners[index];
      const x = 50 + index * Math.min(100, (width - 60) / Math.max(1, winners.length));
      const skin: Skin = player.skin ?? DEFAULT_SKIN;
      const sprite = createSkinContainer(this, x, rowHeight / 2 - 8, skin, 3);
      row.add(sprite);
      const label = this.add
        .text(x, rowHeight - 12, player.character_name, {
          color: "#fef3c7",
          fontSize: "12px",
          align: "center",
          wordWrap: { width: 90 },
        })
        .setOrigin(0.5, 1);
      row.add(label);
    }
    this.root.add(row);
    return y + rowHeight;
  }

  private showError(message: string) {
    this.statusText.setText(message);
  }

  private returnToMenu() {
    this.scene.stop(this.reportId);
    const mainScene = this.scene.get("MainScene") as {
      showMyMatchesView?: () => void;
    } | undefined;
    if (mainScene?.showMyMatchesView) {
      if (this.scene.isSleeping("MainScene")) {
        this.scene.wake("MainScene");
      }
      mainScene.showMyMatchesView();
    } else {
      this.scene.start("MainScene");
    }
  }
}
