import Phaser from "phaser";
import type {
  GetMatchReportPayload,
  MatchReport,
  MatchReportPlayer,
  Skin
} from "@shared";
import { DEFAULT_SKIN } from "@shared";
import { t } from "../services/i18n";
import type { TurnService } from "../services/turnService";
import { makeButton, type UIButton } from "../ui/button";
import { createSkinContainer } from "../ui/PlayerSkinRenderer";
import { assetPath } from "../utils/assetPath";
import { SessionManager } from "../services/sessionManager";

interface ScrollablePanel extends Phaser.GameObjects.GameObject {
  layout?: () => void;
  setOrigin: (x: number, y: number) => ScrollablePanel;
  setPosition: (x: number, y: number) => ScrollablePanel;
  setSize?: (width: number, height: number) => ScrollablePanel;
}

export interface EndGameReportSceneData {
  matchId: string;
  userId?: string;
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
  runner: "Runner"
};

export class EndGameReportScene extends Phaser.Scene {
  private readonly reportId = "EndGameReportScene";
  private root!: Phaser.GameObjects.Container;
  private scrollPanel!: ScrollablePanel;
  private statusText!: Phaser.GameObjects.Text;
  private report: MatchReport | null = null;
  private turnService: TurnService | null = null;
  private matchId = "";
  private currentUserId: string | null = null;
  private returnButton!: UIButton;

  constructor() {
    super("EndGameReportScene");
  }

  preload() {
    this.load.atlasXML(
      "char",
      assetPath("assets/spritesheets/roguelikeChar_transparent.png"),
      assetPath("assets/spritesheets/roguelikeChar_transparent.xml")
    );
  }

  async create(data?: EndGameReportSceneData) {
    this.matchId = data?.matchId ?? "";
    this.currentUserId =
      data?.userId ??
      (this.registry.get("currentUserId") as string | null) ??
      SessionManager.getStoredSession()?.user_id ??
      null;
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
        const payload = (typeof raw === "string" ? JSON.parse(raw) : raw) as
          | GetMatchReportPayload
          | undefined;
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
        align: "center"
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
        mask: true
      },
      slider: {
        track: this.rexUI.add.roundRectangle(0, 0, 4, 120, 2, 0x1f2a4a),
        thumb: this.rexUI.add.roundRectangle(0, 0, 6, 36, 3, 0x3b82f6)
      },
      scroller: {
        threshold: 10,
        rectBoundsInteractive: true,
        slidingDeceleration: 5000,
        backDeceleration: 2000,
        pointerOutRelease: true
      },
      mouseWheelScroller: {
        focus: 2,
        speed: 0.5
      },
      space: { left: 12, right: 12, top: 8, bottom: 8, panel: 8 }
    }) as unknown as ScrollablePanel;
    this.scrollPanel.setOrigin(0, 0);
    this.scrollPanel.setPosition(0, 54);
    this.scrollPanel.layout?.();

    this.returnButton = makeButton(
      this,
      width / 2,
      height - 32,
      t("Back to Menu"),
      () => this.returnToMenu(),
      ["report"]
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

    const isDraw = !report.winning_team_id || report.reason === "all_dead";
    const userId =
      this.currentUserId ??
      (this.registry.get("currentUserId") as string | null) ??
      SessionManager.getStoredSession()?.user_id ??
      null;

    const player = userId
      ? report.players.find((p) => p.player_id === userId)
      : undefined;
    const isParticipant =
      Boolean(player) ||
      (Boolean(userId) &&
        report.teams.some((team) => team.player_ids.includes(userId!)));

    let title: string;
    let titleColor: string;

    if (isDraw) {
      title = t("Match Draw");
      titleColor = "#38bdf8";
    } else if (isParticipant) {
      const winningTeam = report.teams.find((team) => team.won);
      const isWinner = Boolean(
        (winningTeam && userId && winningTeam.player_ids.includes(userId)) ||
        (player &&
          report.winning_team_id &&
          player.team_id === report.winning_team_id) ||
        (player && report.winning_character_ids.includes(player.character_id))
      );

      if (isWinner) {
        title = t("Victory!");
        titleColor = "#fbbf24";
      } else {
        title = t("Defeat");
        titleColor = "#ef4444";
      }
    } else {
      title = t("End Game Report");
      titleColor = "#f8fafc";
    }

    const titleText = this.add
      .text(width / 2, y, title, {
        color: titleColor,
        fontSize: "34px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    this.root.add(titleText);
    y += 48;

    const matchName = report.name ? `${report.name} · ` : "";
    const summary = this.add
      .text(width / 2, y, `${matchName}${t("Turns")}: ${report.turns}`, {
        color: "#cbd5e1",
        fontSize: "16px"
      })
      .setOrigin(0.5, 0);
    this.root.add(summary);
    y += 36;

    const viewReplayButton = makeButton(
      this,
      width / 2,
      y,
      t("View replay"),
      () => this.openReplay(),
      ["report"]
    ).setOrigin(0.5, 0);
    this.root.add(viewReplayButton);
    y += viewReplayButton.height + 20;

    y = this.addSectionTitle(width, y, t("Team Leaderboard"));
    for (const team of report.teams) {
      let teamName = t(team.team_id);
      if (team.team_id.startsWith("solo_")) {
        const soloId = team.team_id.replace(/^solo_/, "");
        const soloPlayer = report.players.find((p) => p.player_id === soloId);
        if (soloPlayer) {
          teamName = soloPlayer.player_name;
        }
      }
      const titleText = `${team.rank}. ${teamName}${team.won ? ` · ${t("Winner")}` : ""}`;
      const statsText = `${t("Damage")}: ${team.total_damage_dealt}   ${t("Received")}: ${team.total_damage_received}   ${t("Kills")}: ${team.kills}`;
      const teamPlayers = report.players.filter(
        (player) => team.player_ids.indexOf(player.player_id) !== -1
      );
      y = this.addTeamCard(
        width,
        y,
        titleText,
        teamPlayers,
        statsText,
        team.won ? "#854d0e" : "#172554"
      );
    }

    y = this.addSectionTitle(width, y + 12, t("Player Statistics"));
    for (const player of report.players) {
      const playerText = `${player.player_name}\n${t("Damage")}: ${player.damage_dealt}   ${t("Received")}: ${player.damage_received}   ${t("Kills")}: ${player.players_killed}\n${t("Actions")}: ${player.actions_used}   ${t("Items")}: ${player.items_collected}   ${t("Average weight")}: ${player.average_weight_carried.toFixed(1)}   ${player.alive ? t("Alive") : t("Eliminated")}`;
      y = this.addCard(
        width,
        y,
        playerText,
        player.alive ? "#14532d" : "#3f1d2e"
      );
    }

    y = this.addSectionTitle(width, y + 12, t("Achievements"));
    if (report.achievements.length === 0) {
      y = this.addCard(width, y, t("No achievements awarded"), "#172554");
    } else {
      for (const achievement of report.achievements) {
        const player = report.players.find(
          (entry) => entry.player_id === achievement.player_id
        );
        const label = t(ACHIEVEMENT_LABELS[achievement.id] ?? achievement.id);
        const value =
          typeof achievement.value === "number"
            ? ` · ${achievement.value.toFixed(1)}`
            : "";
        y = this.addCard(
          width,
          y,
          `${label}${value}\n${player?.player_name ?? t("Unknown")}`,
          "#422006"
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
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    this.root.add(title);
    return y + 36;
  }

  private addCard(
    width: number,
    y: number,
    text: string,
    color: string
  ): number {
    const lines = text.split("\n").length;
    const height = lines > 1 ? 70 : 48;
    const background = this.add
      .rectangle(
        width / 2,
        y + height / 2,
        width,
        height,
        parseInt(color.slice(1), 16),
        1
      )
      .setOrigin(0.5);
    const label = this.add
      .text(16, y + height / 2, text, {
        color: "#f8fafc",
        fontSize: "15px",
        lineSpacing: 5,
        wordWrap: { width: width - 32 }
      })
      .setOrigin(0, 0.5);
    this.root.add([background, label]);
    return y + height + 8;
  }

  private addTeamCard(
    width: number,
    y: number,
    titleText: string,
    teamPlayers: MatchReportPlayer[],
    statsText: string,
    color: string
  ): number {
    const hasPlayers = teamPlayers.length > 0;
    const title = this.add
      .text(16, y + 12, titleText, {
        color: "#f8fafc",
        fontSize: "16px",
        fontStyle: "bold",
        wordWrap: { width: width - 32 }
      })
      .setOrigin(0, 0);

    const titleBottom = y + 12 + title.height;
    const elements: Phaser.GameObjects.GameObject[] = [title];

    let currentY = titleBottom;

    if (hasPlayers) {
      const spriteY = currentY + 28;
      const nameY = spriteY + 24;
      const count = teamPlayers.length;
      const spacing = Math.min(100, (width - 80) / Math.max(1, count));

      let maxNameBottom = nameY + 16;
      for (let index = 0; index < count; index += 1) {
        const player = teamPlayers[index];
        const x = 50 + index * spacing;
        const skin: Skin = player.skin ?? DEFAULT_SKIN;
        const sprite = createSkinContainer(this, x, spriteY, skin, 3);
        elements.push(sprite);

        const nameLabel = this.add
          .text(x, nameY, player.player_name, {
            color: "#fef3c7",
            fontSize: "12px",
            align: "center",
            wordWrap: { width: Math.max(70, spacing - 4) }
          })
          .setOrigin(0.5, 0);
        elements.push(nameLabel);
        maxNameBottom = Math.max(maxNameBottom, nameY + nameLabel.height);
      }
      currentY = maxNameBottom + 10;
    } else {
      currentY += 8;
    }

    const stats = this.add
      .text(16, currentY, statsText, {
        color: "#cbd5e1",
        fontSize: "14px",
        lineSpacing: 4,
        wordWrap: { width: width - 32 }
      })
      .setOrigin(0, 0);
    elements.push(stats);

    const cardBottom = currentY + stats.height + 12;
    const height = cardBottom - y;

    const background = this.add
      .rectangle(
        width / 2,
        y + height / 2,
        width,
        height,
        parseInt(color.slice(1), 16),
        1
      )
      .setOrigin(0.5);

    this.root.add([background, ...elements]);
    return y + height + 8;
  }

  private showError(message: string) {
    this.statusText.setText(message);
  }

  private openReplay(): void {
    this.scene.start("GameScene", {
      matchId: this.matchId,
      reportReplay: true,
      userId: this.currentUserId ?? undefined,
    });
  }

  private returnToMenu() {
    this.scene.stop(this.reportId);
    const mainScene = this.scene.get("MainScene") as
      | {
          showMyMatchesView?: () => void;
        }
      | undefined;
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
