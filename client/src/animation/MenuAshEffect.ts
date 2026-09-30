import Phaser from "phaser";
import { isMobile } from "../utils/isMobile";

const ASH_TEXTURE = "menu-ash-flake";
const EMBER_TEXTURE = "menu-ash-ember";
const EDGE_MARGIN = 64;

type Airflow = {
  width: number;
  height: number;
  clock: number;
  wind: number;
  pointerX: number;
  pointerY: number;
  currentX: number;
  currentY: number;
};

class AshAirflowProcessor extends Phaser.GameObjects.Particles.ParticleProcessor {
  private readonly airflow: Airflow;

  constructor(airflow: Airflow) {
    super();
    this.airflow = airflow;
  }

  override update(
    particle: Phaser.GameObjects.Particles.Particle,
    _delta: number,
    step: number,
  ): void {
    const air = this.airflow;
    const seconds = Math.min(step, 0.05);
    const flutter = Math.sin(air.clock * 1.4 + particle.life * 0.013);
    const drift = air.wind + flutter * 12;
    const fallSpeed = 24 + Math.min(particle.scaleX, 1) * 24;
    const drag = 1 - Math.exp(-seconds * 1.4);
    particle.velocityX += (drift - particle.velocityX) * drag;
    particle.velocityY += (fallSpeed - particle.velocityY) * drag;

    const dx = particle.x - air.pointerX;
    const dy = particle.y - air.pointerY;
    const radius = 150;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < radius * radius) {
      const influence = (1 - Math.sqrt(distanceSquared) / radius) ** 2;
      const currentStrength = Math.hypot(air.currentX, air.currentY);
      const swirl = currentStrength * influence * 0.5;
      particle.velocityX +=
        (air.currentX * influence * 3 - (dy / radius) * swirl) * seconds;
      particle.velocityY +=
        (air.currentY * influence * 3 + (dx / radius) * swirl) * seconds;
    }
    particle.velocityX = Phaser.Math.Clamp(particle.velocityX, -220, 220);
    particle.velocityY = Phaser.Math.Clamp(particle.velocityY, -160, 180);
    particle.angle += flutter * seconds * 35;

    if (particle.x < -EDGE_MARGIN) {
      particle.x = air.width + EDGE_MARGIN;
    } else if (particle.x > air.width + EDGE_MARGIN) {
      particle.x = -EDGE_MARGIN;
    }
    if (particle.y > air.height + EDGE_MARGIN) {
      particle.kill();
    }
  }
}

export class MenuAshEffect {
  private readonly scene: Phaser.Scene;
  private readonly emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private readonly airflow: Airflow;
  private enabled = true;
  private windTarget = 18;
  private windChangeIn = 4;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastPointerId: number | null = null;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.airflow = {
      width: scene.scale.width,
      height: scene.scale.height,
      clock: 0,
      wind: 0,
      pointerX: -1000,
      pointerY: -1000,
      currentX: 0,
      currentY: 0,
    };
    this.createTextures();

    const mobile = isMobile(scene.scale.width);
    const layers = [
      {
        texture: ASH_TEXTURE,
        count: mobile ? 65 : 125,
        scale: { min: 0.16, max: 0.4 },
        ember: false,
      },
      {
        texture: ASH_TEXTURE,
        count: mobile ? 12 : 24,
        scale: { min: 0.55, max: 1 },
        ember: false,
      },
      {
        texture: EMBER_TEXTURE,
        count: mobile ? 16 : 28,
        scale: { min: 0.18, max: 0.38 },
        ember: true,
      },
    ];
    for (const layer of layers) {
      const emitter = scene.add.particles(0, 0, layer.texture, {
        x: () =>
          Phaser.Math.FloatBetween(-EDGE_MARGIN, this.airflow.width + EDGE_MARGIN),
        y: -24,
        lifespan: () => (this.airflow.height + EDGE_MARGIN * 2) / 24 * 1000,
        speedX: { min: -12, max: 12 },
        speedY: { min: 24, max: 48 },
        scale: layer.scale,
        rotate: { min: -180, max: 180 },
        alpha: {
          onEmit: () => 0,
          onUpdate: (particle, _key, t) => {
            const fade = Math.min(1, t * 35, (1 - t) * 8);
            const flicker = layer.ember
              ? 0.72 + Math.sin(this.airflow.clock * 5 + particle.life * 0.01) * 0.22
              : 0.46;
            return fade * flicker;
          },
        },
        tint: layer.ember
          ? [0xffa35c, 0xff6a2b, 0xffcd86]
          : [0xa6a4a1, 0xd4cebf, 0x737782],
        blendMode: layer.ember ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
        frequency: (this.airflow.height + EDGE_MARGIN * 2) / 36 / layer.count * 1000,
        maxAliveParticles: layer.count + 8,
        reserve: layer.count + 8,
      });
      emitter.setDepth(-10).setScrollFactor(0);
      emitter.addParticleProcessor(new AshAirflowProcessor(this.airflow));
      for (let index = 0; index < layer.count; index += 1) {
        emitter.emitParticleAt(
          Phaser.Math.FloatBetween(0, this.airflow.width),
          Phaser.Math.FloatBetween(0, this.airflow.height),
        );
      }
      this.emitters.push(emitter);
    }

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.on(Phaser.Scenes.Events.SLEEP, this.resetPointer, this);
    scene.events.on(Phaser.Scenes.Events.WAKE, this.resetPointer, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    this.resetPointer();
    for (const emitter of this.emitters) {
      emitter.setVisible(enabled).setActive(enabled);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.SLEEP, this.resetPointer, this);
    this.scene.events.off(Phaser.Scenes.Events.WAKE, this.resetPointer, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
    for (const emitter of this.emitters) {
      emitter.destroy();
    }
    this.emitters.length = 0;
  }

  private update(_time: number, delta: number): void {
    if (!this.enabled) {
      return;
    }
    const seconds = Math.min(delta / 1000, 0.05);
    if (seconds <= 0) {
      return;
    }
    this.airflow.clock += seconds;
    this.windChangeIn -= seconds;
    if (this.windChangeIn <= 0) {
      this.windTarget = Phaser.Math.FloatBetween(-36, 36);
      this.windChangeIn = Phaser.Math.FloatBetween(3, 7);
    }
    this.airflow.wind +=
      (this.windTarget - this.airflow.wind) * (1 - Math.exp(-seconds * 0.6));
    const decay = Math.exp(-seconds * 5);
    this.airflow.currentX *= decay;
    this.airflow.currentY *= decay;

    const pointer = this.scene.input.activePointer;
    if (
      !pointer ||
      (pointer.wasTouch && !pointer.isDown) ||
      pointer.x < 0 ||
      pointer.y < 0 ||
      pointer.x > this.airflow.width ||
      pointer.y > this.airflow.height
    ) {
      this.lastPointerId = null;
      return;
    }
    if (this.lastPointerId === pointer.id) {
      const velocityX = Phaser.Math.Clamp(
        (pointer.x - this.lastPointerX) / seconds,
        -700,
        700,
      );
      const velocityY = Phaser.Math.Clamp(
        (pointer.y - this.lastPointerY) / seconds,
        -700,
        700,
      );
      const response = 1 - Math.exp(-seconds * 12);
      this.airflow.currentX += (velocityX - this.airflow.currentX) * response;
      this.airflow.currentY += (velocityY - this.airflow.currentY) * response;
    }
    this.airflow.pointerX = pointer.x;
    this.airflow.pointerY = pointer.y;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
    this.lastPointerId = pointer.id;
  }

  private resetPointer(): void {
    this.lastPointerId = null;
    this.airflow.currentX = 0;
    this.airflow.currentY = 0;
  }

  private resize(): void {
    this.airflow.width = this.scene.scale.width;
    this.airflow.height = this.scene.scale.height;
    this.resetPointer();
  }

  private createTextures(): void {
    if (!this.scene.textures.exists(ASH_TEXTURE)) {
      const texture = this.scene.textures.createCanvas(ASH_TEXTURE, 12, 12);
      if (texture) {
        const context = texture.context;
        context.fillStyle = "#ffffff";
        context.beginPath();
        context.moveTo(3, 2);
        context.lineTo(9, 4);
        context.lineTo(8, 9);
        context.lineTo(4, 10);
        context.lineTo(2, 6);
        context.closePath();
        context.fill();
        texture.refresh();
      }
    }
    if (!this.scene.textures.exists(EMBER_TEXTURE)) {
      const texture = this.scene.textures.createCanvas(EMBER_TEXTURE, 32, 32);
      if (texture) {
        const context = texture.context;
        const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(0.12, "rgba(255,255,255,0.95)");
        glow.addColorStop(0.35, "rgba(255,255,255,0.3)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, 32, 32);
        texture.refresh();
      }
    }
  }
}
