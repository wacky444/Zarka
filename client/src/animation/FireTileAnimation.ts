import Phaser from "phaser";

export type FireTileAnimation = {
  container: Phaser.GameObjects.Container;
  tweens: Phaser.Tweens.Tween[];
};

type FlameShape = {
  offsetX: number;
  height: number;
  width: number;
  color: number;
  delay: number;
};

const FLAME_SHAPES: FlameShape[] = [
  { offsetX: -29, height: 19, width: 12, color: 0xea580c, delay: 110 },
  { offsetX: -16, height: 27, width: 16, color: 0xf97316, delay: 30 },
  { offsetX: 0, height: 34, width: 19, color: 0xff6b00, delay: 170 },
  { offsetX: 16, height: 25, width: 16, color: 0xf97316, delay: 70 },
  { offsetX: 29, height: 18, width: 12, color: 0xea580c, delay: 220 },
  { offsetX: 0, height: 17, width: 8, color: 0xfde68a, delay: 40 },
];

export function createFireTileAnimation(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  depth: number,
): FireTileAnimation {
  const container = scene.add
    .container(x, y + tileHeight * 0.14)
    .setDepth(depth);
  const tweens: Phaser.Tweens.Tween[] = [];

  const groundGlow = scene.add.ellipse(
    0,
    12,
    tileWidth * 0.68,
    tileHeight * 0.3,
    0xf97316,
    0.2,
  );
  container.add(groundGlow);
  tweens.push(
    scene.tweens.add({
      targets: groundGlow,
      alpha: 0.32,
      scaleX: 1.08,
      scaleY: 1.12,
      duration: 620,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    }),
  );

  for (const [index, shape] of FLAME_SHAPES.entries()) {
    const flame = createFlameShape(scene, shape);
    flame.setPosition(shape.offsetX, 10);
    container.add(flame);
    const baseScaleY = flame.scaleY;
    const baseY = flame.y;
    tweens.push(
      scene.tweens.add({
        targets: flame,
        y: baseY - 4 - (index % 2) * 2,
        scaleY: baseScaleY * 1.18,
        scaleX: 0.86,
        alpha: 0.62,
        duration: 330 + index * 55,
        delay: shape.delay,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  return { container, tweens };
}

function createFlameShape(
  scene: Phaser.Scene,
  shape: FlameShape,
): Phaser.GameObjects.Graphics {
  const halfWidth = shape.width / 2;
  const flame = scene.add.graphics();
  flame.fillStyle(shape.color, 0.9);
  flame.beginPath();
  flame.moveTo(-halfWidth, 0);
  flame.lineTo(-halfWidth * 0.65, -shape.height * 0.3);
  flame.lineTo(-halfWidth * 0.25, -shape.height * 0.58);
  flame.lineTo(0, -shape.height);
  flame.lineTo(halfWidth * 0.18, -shape.height * 0.5);
  flame.lineTo(halfWidth * 0.48, -shape.height * 0.72);
  flame.lineTo(halfWidth, 0);
  flame.closePath();
  flame.fillPath();
  return flame;
}
