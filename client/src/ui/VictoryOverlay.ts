import Phaser from "phaser";
import { t } from "../services/i18n";

const FIREWORK_TEXTURE = "endgame-firework-spark";
const FIREWORK_COLORS = [0xfbbf24, 0xfef08a, 0xf59e0b, 0x34d399, 0x60a5fa];

export interface VictoryOverlayOptions {
  depth?: number;
  onTransitionComplete: () => void;
}

export type MatchEndResultType = "win" | "loss" | "draw";

export interface VictoryOverlayData {
  result: MatchEndResultType;
  winnerName?: string;
  winnerId?: string;
  turns?: number;
  skin?: import("@shared").Skin;
  tutorial?: boolean;
}

export class VictoryOverlay {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly rewardBadge: Phaser.GameObjects.Text;
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly menuButton: Phaser.GameObjects.Text;
  private readonly emitterContainer: Phaser.GameObjects.Container;
  private readonly onTransitionComplete: () => void;
  private fireworkEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private fireworkTimer: Phaser.Time.TimerEvent | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private isVisible = false;
  private reportTransitionStarted = false;

  constructor(scene: Phaser.Scene, options: VictoryOverlayOptions) {
    this.scene = scene;
    this.onTransitionComplete = options.onTransitionComplete;
    const depth = options.depth ?? 10000;

    const width = scene.scale.width;
    const height = scene.scale.height;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(depth);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.backdrop = scene.add
      .rectangle(0, 0, width, height, 0x070913, 0.62)
      .setOrigin(0, 0)
      .setInteractive();
    this.container.add(this.backdrop);

    this.emitterContainer = scene.add.container(width / 2, height / 2 - 40);
    this.container.add(this.emitterContainer);

    this.titleText = scene.add
      .text(width / 2, height / 2 - 120, "", {
        fontSize: "64px",
        fontStyle: "900",
        fontFamily: "Arial, sans-serif"
      })
      .setOrigin(0.5, 0.5);
    this.container.add(this.titleText);

    this.subtitleText = scene.add
      .text(width / 2, height / 2 - 45, "", {
        fontSize: "22px",
        fontStyle: "bold",
        fontFamily: "Arial, sans-serif",
        color: "#e2e8f0"
      })
      .setOrigin(0.5, 0.5);
    this.container.add(this.subtitleText);

    this.rewardBadge = scene.add
      .text(width / 2, height / 2 + 15, "", {
        fontSize: "32px",
        fontStyle: "bold",
        fontFamily: "Arial, sans-serif",
        color: "#4ade80",
        backgroundColor: "#064e3b",
        padding: { x: 20, y: 10 }
      })
      .setOrigin(0.5, 0.5);
    this.container.add(this.rewardBadge);

    this.statsText = scene.add
      .text(width / 2, height / 2 + 75, "", {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#94a3b8"
      })
      .setOrigin(0.5, 0.5);
    this.container.add(this.statsText);

    this.menuButton = scene.add
      .text(width / 2, height / 2 + 150, t("Continue to Report"), {
        fontSize: "20px",
        fontStyle: "bold",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        backgroundColor: "#2563eb",
        padding: { x: 24, y: 14 }
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        this.menuButton.setStyle({ backgroundColor: "#1d4ed8", color: "#fbbf24" });
      })
      .on("pointerout", () => {
        this.menuButton.setStyle({ backgroundColor: "#2563eb", color: "#ffffff" });
      })
      .on("pointerdown", () => {
        this.continueToReport();
      });
    this.menuButton.disableInteractive();
    this.container.add(this.menuButton);
  }

  show(data: VictoryOverlayData) {
    this.isVisible = true;
    this.container.setVisible(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.layout(width, height);

    this.clearParticles();

    if (data.result === "win") {
      if (data.tutorial) {
        this.subtitleText.setStyle({ fontSize: "18px", align: "center" });
        this.subtitleText.setWordWrapWidth(Math.max(240, width - 40), true);
        this.statsText.setStyle({ align: "center" });
        this.statsText.setWordWrapWidth(Math.max(240, width - 40), true);
        this.rewardBadge.setText(`✓ ${t("Tutorial complete")}`);
        this.rewardBadge.setStyle({
          fontSize: "26px",
          fontStyle: "bold",
          color: "#4ade80",
          backgroundColor: "",
          padding: { x: 0, y: 0 }
        });
      } else {
        this.subtitleText.setStyle({ fontSize: "22px", align: "center" });
        this.subtitleText.setWordWrapWidth(0);
        this.statsText.setStyle({ align: "center" });
        this.statsText.setWordWrapWidth(0);
        this.rewardBadge.setText("🏆 +1 WIN!");
        this.rewardBadge.setStyle({
          fontSize: "32px",
          fontStyle: "bold",
          color: "#fef08a",
          backgroundColor: "#854d0e",
          padding: { x: 20, y: 10 }
        });
      }
      this.titleText.setText("VICTORY!");
      this.titleText.setStyle({
        color: "#fbbf24",
        shadow: { blur: 16, color: "#92400e", fill: true }
      });
      this.subtitleText.setText(
        data.tutorial
          ? t("You won by combining information, preparation, positioning, and timing.")
          : "You are the last character standing!"
      );
      this.rewardBadge.setVisible(true);
    } else if (data.result === "loss") {
      this.titleText.setText("DEFEAT");
      this.titleText.setStyle({
        color: "#ef4444",
        shadow: { blur: 16, color: "#7f1d1d", fill: true }
      });
      const winner = data.winnerName ? `Winner: ${data.winnerName}` : "Defeated in battle";
      this.subtitleText.setText(winner);
      this.rewardBadge.setVisible(false);
    } else {
      this.titleText.setText("MATCH DRAW");
      this.titleText.setStyle({
        color: "#38bdf8",
        shadow: { blur: 16, color: "#075985", fill: true }
      });
      this.subtitleText.setText("All fighters were eliminated.");
      this.rewardBadge.setVisible(false);
    }

    this.createVictoryFireworks();

    if (data.tutorial && data.result === "win") {
      this.statsText.setText(
        t("You learned to inspect, prepare, verify, and plan ahead.")
      );
      this.statsText.setVisible(true);
    } else if (typeof data.turns === "number" && data.turns > 0) {
      this.statsText.setText(`Match completed in ${data.turns} turns`);
      this.statsText.setVisible(true);
    } else {
      this.statsText.setVisible(false);
    }

    this.titleText.setScale(0);
    this.scene.tweens.add({
      targets: this.titleText,
      scaleX: 1,
      scaleY: 1,
      duration: 700,
      ease: "Back.out"
    });

    if (this.rewardBadge.visible) {
      this.rewardBadge.setScale(0);
      this.scene.tweens.add({
        targets: this.rewardBadge,
        scaleX: 1,
        scaleY: 1,
        duration: 500,
        delay: 350,
        ease: "Back.out"
      });
    }

    this.reportTransitionStarted = false;
    this.menuButton.setText(t("Continue to Report"));
    this.menuButton.setInteractive({ useHandCursor: true });
    this.menuButton.setScale(0.8);
    this.menuButton.setAlpha(0);
    this.scene.tweens.add({
      targets: this.menuButton,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 400,
      delay: 500,
      ease: "Cubic.out"
    });

    if (this.pulseTween) {
      this.pulseTween.stop();
    }
    this.pulseTween = this.scene.tweens.add({
      targets: this.titleText,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 700
    });

  }

  hide() {
    this.isVisible = false;
    this.container.setVisible(false);
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
    }
    this.reportTransitionStarted = false;
    this.clearParticles();
  }

  isShowing(): boolean {
    return this.isVisible;
  }

  layout(width: number, height: number) {
    this.backdrop.setSize(width, height);
    this.emitterContainer.setPosition(width / 2, height / 2 - 40);
    this.titleText.setPosition(width / 2, height / 2 - 120);
    this.subtitleText.setPosition(width / 2, height / 2 - 45);
    this.rewardBadge.setPosition(width / 2, height / 2 + 15);
    this.statsText.setPosition(width / 2, height / 2 + 75);
    this.menuButton.setPosition(width / 2, height / 2 + 150);
  }

  ignoreCamera(camera: Phaser.Cameras.Scene2D.Camera) {
    camera.ignore(this.container);
    if (this.fireworkEmitter) {
      camera.ignore(this.fireworkEmitter);
    }
  }

  destroy() {
    if (this.pulseTween) {
      this.pulseTween.stop();
    }
    this.clearParticles();
    this.container.destroy();
  }

  private continueToReport(): void {
    if (!this.isVisible || this.reportTransitionStarted) {
      return;
    }
    this.reportTransitionStarted = true;
    this.menuButton.disableInteractive();
    this.onTransitionComplete();
  }

  private createVictoryFireworks() {
    if (!this.scene.textures.exists(FIREWORK_TEXTURE)) {
      const texture = this.scene.textures.createCanvas(FIREWORK_TEXTURE, 24, 24);
      if (texture) {
        const glow = texture.context.createRadialGradient(12, 12, 0, 12, 12, 12);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(0.25, "rgba(255,255,255,0.95)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        texture.context.fillStyle = glow;
        texture.context.fillRect(0, 0, 24, 24);
        texture.refresh();
      }
    }
    if (!this.scene.textures.exists(FIREWORK_TEXTURE)) {
      return;
    }
    const emitter = this.scene.add.particles(0, 0, FIREWORK_TEXTURE, {
      lifespan: { min: 700, max: 1250 },
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      gravityY: 90,
      scale: { start: 0.9, end: 0.04 },
      alpha: { start: 1, end: 0 },
      tint: FIREWORK_COLORS,
      blendMode: Phaser.BlendModes.ADD,
      frequency: -1,
      maxAliveParticles: 360,
      reserve: 360,
    });
    emitter.setScrollFactor(0).setDepth(this.container.depth - 1);
    this.fireworkEmitter = emitter;
    this.scene.cameras.main.ignore(emitter);
    this.fireworkTimer = this.scene.time.addEvent({
      delay: 650,
      loop: true,
      callback: () => {
        if (!this.isVisible || !emitter.active) {
          return;
        }
        const width = this.scene.scale.width;
        const height = this.scene.scale.height;
        emitter.explode(
          Phaser.Math.Between(36, 56),
          Phaser.Math.Between(64, Math.max(65, width - 64)),
          Phaser.Math.Between(70, Math.max(71, Math.floor(height * 0.62)))
        );
      },
    });
  }

  private clearParticles() {
    this.fireworkTimer?.remove(false);
    this.fireworkTimer = null;
    this.fireworkEmitter?.destroy();
    this.fireworkEmitter = null;
    this.emitterContainer.removeAll(true);
  }
}
