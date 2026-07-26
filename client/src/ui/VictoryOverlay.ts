import Phaser from "phaser";

export interface VictoryOverlayOptions {
  depth?: number;
  onReturnToMenu: () => void;
}

export type MatchEndResultType = "win" | "loss" | "draw";

export interface VictoryOverlayData {
  result: MatchEndResultType;
  winnerName?: string;
  winnerId?: string;
  turns?: number;
  skin?: import("@shared").Skin;
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
  private particleGraphics: Phaser.GameObjects.Graphics[] = [];
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private isVisible = false;

  constructor(scene: Phaser.Scene, options: VictoryOverlayOptions) {
    this.scene = scene;
    const depth = options.depth ?? 10000;

    const width = scene.scale.width;
    const height = scene.scale.height;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(depth);
    this.container.setScrollFactor(0);
    this.container.setVisible(false);

    this.backdrop = scene.add
      .rectangle(0, 0, width, height, 0x070913, 0.88)
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
      .text(width / 2, height / 2 + 150, "  Return to Main Menu  ", {
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
        options.onReturnToMenu();
      });
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
      this.titleText.setText("VICTORY!");
      this.titleText.setStyle({
        color: "#fbbf24",
        shadow: { blur: 16, color: "#92400e", fill: true }
      });
      this.subtitleText.setText("You are the last character standing!");
      this.rewardBadge.setText("🏆 +1 WIN!");
      this.rewardBadge.setStyle({
        color: "#fef08a",
        backgroundColor: "#854d0e"
      });
      this.rewardBadge.setVisible(true);
      this.createVictoryParticles();
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

    if (typeof data.turns === "number" && data.turns > 0) {
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
  }

  destroy() {
    if (this.pulseTween) {
      this.pulseTween.stop();
    }
    this.clearParticles();
    this.container.destroy();
  }

  private createVictoryParticles() {
    const colors = [0xfbbf24, 0xfef08a, 0xf59e0b, 0x34d399, 0x60a5fa];
    for (let i = 0; i < 30; i++) {
      const g = this.scene.add.graphics();
      const color = colors[i % colors.length];
      const size = Phaser.Math.Between(4, 10);
      g.fillStyle(color, 1);
      g.fillCircle(0, 0, size);

      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.FloatBetween(100, 350);
      const startX = 0;
      const startY = 0;
      const targetX = Math.cos(angle) * speed;
      const targetY = Math.sin(angle) * speed;

      g.setPosition(startX, startY);
      g.setAlpha(1);

      this.emitterContainer.add(g);
      this.particleGraphics.push(g);

      this.scene.tweens.add({
        targets: g,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: Phaser.Math.Between(1200, 2200),
        repeat: -1,
        repeatDelay: Phaser.Math.Between(100, 500),
        ease: "Quad.out"
      });
    }
  }

  private clearParticles() {
    for (const g of this.particleGraphics) {
      g.destroy();
    }
    this.particleGraphics = [];
    this.emitterContainer.removeAll(true);
  }
}
