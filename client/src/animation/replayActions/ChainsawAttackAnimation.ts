import Phaser from "phaser";
import { ReplayActionEffect, type ReplayPlayerEvent } from "@shared";
import type { MoveReplayContext } from "../MoveReplayContext";
import { hasEffect, showGuardOverlay } from "./GuardOverlay";
import { playRandomSound } from "../soundPlayer";

const CHAINSAW_ATTACK_SOUNDS = ["weapon_drop"];

export async function animateChainsawAttackEvent(
  context: MoveReplayContext,
  event: ReplayPlayerEvent
): Promise<void> {
  const targets = event.targets ?? [];
  if (!targets || targets.length === 0) {
    return;
  }

  const attackerSprite = context.getSprite(event.actorId) ?? null;
  const attackerLabel = context.getLabel(event.actorId) ?? null;
  const scene = context.scene;

  playRandomSound(scene, CHAINSAW_ATTACK_SOUNDS);

  const animations: Array<Promise<void>> = [];
  const guardedIds: string[] = [];

  for (const target of targets) {
    if (!target?.targetId) {
      continue;
    }
    const targetSprite = context.getSprite(target.targetId);
    if (!targetSprite) {
      continue;
    }
    const targetLabel = context.getLabel(target.targetId) ?? null;
    if (hasEffect(target.effects, ReplayActionEffect.Guard)) {
      guardedIds.push(target.targetId);
    }

    animations.push(
      new Promise<void>((resolve) => {
        const targetStartX = targetSprite.x;
        const targetStartY = targetSprite.y;
        const attackerStartX = attackerSprite ? attackerSprite.x : targetStartX;
        const attackerStartY = attackerSprite ? attackerSprite.y : targetStartY;

        let dirX = targetStartX - attackerStartX;
        let dirY = targetStartY - attackerStartY;
        const dist = Math.sqrt(dirX * dirX + dirY * dirY);
        if (dist > 0.001) {
          dirX /= dist;
          dirY /= dist;
        } else {
          dirX = 1;
          dirY = 0;
        }

        const lungeDist = dist > 10 ? Math.min(dist * 0.65, 36) : 18;
        const lungeTargetX = attackerStartX + dirX * lungeDist;
        const lungeTargetY = attackerStartY + dirY * lungeDist;

        if (attackerSprite) {
          context.tweens.add({
            targets: attackerSprite,
            x: lungeTargetX,
            y: lungeTargetY,
            duration: 130,
            ease: "Back.easeOut",
            onUpdate: () => {
              const jitter = (Math.random() * 2 - 1) * 3;
              attackerSprite.x = lungeTargetX + jitter;
              attackerSprite.y = lungeTargetY + jitter;
              if (attackerLabel) {
                context.positionLabel(attackerLabel, attackerSprite);
              }
            },
            onComplete: () => {
              context.tweens.add({
                targets: attackerSprite,
                x: attackerStartX,
                y: attackerStartY,
                duration: 220,
                ease: "Sine.easeInOut",
                onUpdate: () => {
                  if (attackerLabel) {
                    context.positionLabel(attackerLabel, attackerSprite);
                  }
                },
                onComplete: () => {
                  attackerSprite.setPosition(attackerStartX, attackerStartY);
                  if (attackerLabel) {
                    context.positionLabel(attackerLabel, attackerSprite);
                  }
                }
              });
            }
          });
        }

        const impactX = targetStartX;
        const impactY = targetStartY;

        scene.time.delayedCall(120, () => {
          scene.cameras.main.shake(220, 0.009);

          let chainsawIcon: Phaser.GameObjects.Image | null = null;
          if (scene.textures.exists("board_icon_chainsaw")) {
            chainsawIcon = scene.add.image(
              impactX - dirX * 16,
              impactY - dirY * 16,
              "board_icon_chainsaw"
            );
            chainsawIcon.setDepth((targetSprite.depth || 10) + 5);
            chainsawIcon.setScale(0.7);
            chainsawIcon.setAngle(-25);

            context.tweens.add({
              targets: chainsawIcon,
              angle: 45,
              scale: 0.85,
              x: impactX + dirX * 8,
              y: impactY + dirY * 8,
              duration: 220,
              ease: "Expo.easeOut",
              yoyo: true,
              onComplete: () => {
                chainsawIcon?.destroy();
              }
            });
          }

          const graphics = scene.add.graphics();
          graphics.setDepth((targetSprite.depth || 10) + 6);

          const slashAngle = Math.atan2(dirY, dirX) + Math.PI / 2;
          const slashLen = 38;
          const perpX = Math.cos(slashAngle) * slashLen;
          const perpY = Math.sin(slashAngle) * slashLen;

          graphics.lineStyle(5, 0xff2200, 0.9);
          graphics.lineBetween(
            impactX - perpX,
            impactY - perpY,
            impactX + perpX,
            impactY + perpY
          );

          graphics.lineStyle(2, 0xfff0aa, 1.0);
          graphics.lineBetween(
            impactX - perpX * 0.85,
            impactY - perpY * 0.85,
            impactX + perpX * 0.85,
            impactY + perpY * 0.85
          );

          context.tweens.add({
            targets: graphics,
            alpha: 0,
            duration: 320,
            ease: "Power2",
            onComplete: () => {
              graphics.destroy();
            }
          });

          const particles: Phaser.GameObjects.Arc[] = [];
          for (let i = 0; i < 14; i++) {
            const spark = scene.add.circle(
              impactX + (Math.random() * 12 - 6),
              impactY + (Math.random() * 12 - 6),
              Phaser.Math.Between(2, 4),
              i % 2 === 0 ? 0xff2200 : 0xffbb00,
              1
            );
            spark.setDepth((targetSprite.depth || 10) + 7);
            particles.push(spark);

            const spreadAngle =
              Math.atan2(dirY, dirX) + (Math.random() * 1.8 - 0.9);
            const speed = Phaser.Math.Between(35, 85);
            context.tweens.add({
              targets: spark,
              x: spark.x + Math.cos(spreadAngle) * speed,
              y: spark.y + Math.sin(spreadAngle) * speed,
              scale: 0.1,
              alpha: 0,
              duration: Phaser.Math.Between(240, 380),
              ease: "Cubic.easeOut",
              onComplete: () => {
                spark.destroy();
              }
            });
          }

          const tintInfo = {
            topLeft: targetSprite.tintTopLeft,
            topRight: targetSprite.tintTopRight,
            bottomLeft: targetSprite.tintBottomLeft,
            bottomRight: targetSprite.tintBottomRight,
            tinted: targetSprite.isTinted
          };
          targetSprite.setTint(0xff1111);

          const knockbackX = targetStartX + dirX * 18;
          const knockbackY = targetStartY + dirY * 18;

          context.tweens.add({
            targets: targetSprite,
            x: knockbackX,
            y: knockbackY,
            duration: 160,
            ease: "Back.easeOut",
            yoyo: true,
            onUpdate: () => {
              const jx = (Math.random() * 2 - 1) * 3;
              const jy = (Math.random() * 2 - 1) * 3;
              targetSprite.x += jx;
              targetSprite.y += jy;
              if (targetLabel) {
                context.positionLabel(targetLabel, targetSprite);
              }
            },
            onComplete: () => {
              targetSprite.setPosition(targetStartX, targetStartY);
              if (tintInfo.tinted) {
                targetSprite.setTint(
                  tintInfo.topLeft,
                  tintInfo.topRight,
                  tintInfo.bottomLeft,
                  tintInfo.bottomRight
                );
              } else {
                targetSprite.clearTint();
              }
              if (targetLabel) {
                context.positionLabel(targetLabel, targetSprite);
              }
              resolve();
            }
          });
        });
      })
    );
  }

  if (animations.length === 0) {
    return;
  }

  const guardPromise =
    guardedIds.length > 0 ? showGuardOverlay(context, guardedIds, 420) : null;
  if (guardPromise) {
    await Promise.all([...animations, guardPromise]);
  } else {
    await Promise.all(animations);
  }
}
