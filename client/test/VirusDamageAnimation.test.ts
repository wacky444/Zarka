import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionLibrary, type ReplayPlayerEvent } from "@shared";
import {
  animateVirusDamageEvent,
  VIRUS_DAMAGE_COLOR,
  VIRUS_DAMAGE_TEXT_COLOR,
  VIRUS_DAMAGE_STROKE_COLOR,
} from "../src/animation/replayActions/VirusDamageAnimation";
import { animateInjectVirusEvent } from "../src/animation/replayActions/InjectVirusAnimation";
import { THEME } from "../src/ui/ColorPalette";
import type { MoveReplayContext } from "../src/animation/MoveReplayContext";

interface MockSprite {
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  depth: number;
  tintTopLeft: number;
  tintTopRight: number;
  bottomLeft: number;
  bottomRight: number;
  isTinted: boolean;
  appliedTints: number[];
  clearedTint: boolean;
  setTint(color: number): void;
  clearTint(): void;
  setPosition(x: number, y: number): void;
}

function createMockSprite(options?: { isTinted?: boolean; tint?: number }): MockSprite {
  return {
    x: 100,
    y: 150,
    displayWidth: 40,
    displayHeight: 60,
    depth: 5,
    tintTopLeft: options?.tint ?? 0,
    tintTopRight: options?.tint ?? 0,
    bottomLeft: options?.tint ?? 0,
    bottomRight: options?.tint ?? 0,
    isTinted: options?.isTinted ?? false,
    appliedTints: [],
    clearedTint: false,
    setTint(color: number) {
      this.appliedTints.push(color);
      this.isTinted = true;
    },
    clearTint() {
      this.clearedTint = true;
      this.isTinted = false;
    },
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
    },
  };
}

function createMockContext(sprite: MockSprite) {
  const circles: any[] = [];
  const texts: any[] = [];
  const playedSounds: string[] = [];
  const eventCallbacks: Record<string, Function[]> = {};

  const scene = {
    events: {
      on(event: string, callback: Function) {
        if (!eventCallbacks[event]) eventCallbacks[event] = [];
        eventCallbacks[event].push(callback);
      },
      off(event: string, callback: Function) {
        if (eventCallbacks[event]) {
          eventCallbacks[event] = eventCallbacks[event].filter((cb) => cb !== callback);
        }
      },
    },
    sound: {
      play(key: string) {
        playedSounds.push(key);
      },
    },
    cache: {
      audio: {
        exists() {
          return true;
        },
      },
    },
    add: {
      circle(x: number, y: number, radius: number, color: number, alpha: number) {
        const circleObj = {
          x,
          y,
          radius,
          color,
          alpha,
          depth: 0,
          destroyed: false,
          setDepth(d: number) {
            this.depth = d;
            return this;
          },
          setPosition(nx: number, ny: number) {
            this.x = nx;
            this.y = ny;
          },
          setAlpha(a: number) {
            this.alpha = a;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        circles.push(circleObj);
        return circleObj;
      },
      text(x: number, y: number, text: string, style: any) {
        const textObj = {
          x,
          y,
          text,
          style,
          depth: 0,
          originX: 0,
          originY: 0,
          alpha: 1,
          destroyed: false,
          setOrigin(ox: number, oy: number) {
            this.originX = ox;
            this.originY = oy;
            return this;
          },
          setDepth(d: number) {
            this.depth = d;
            return this;
          },
          setPosition(nx: number, ny: number) {
            this.x = nx;
            this.y = ny;
          },
          setAlpha(a: number) {
            this.alpha = a;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        texts.push(textObj);
        return textObj;
      },
    },
  };

  const tweens = {
    add(config: any) {
      if (typeof config.onUpdate === "function") {
        config.onUpdate();
      }
      if (typeof config.onComplete === "function") {
        config.onComplete();
      }
      return {};
    },
  };

  const context: MoveReplayContext = {
    tweens: tweens as any,
    axialToWorld: () => ({ x: 0, y: 0 }),
    getSprite: (id: string) => (id === "p1" ? (sprite as any) : undefined),
    getLabel: () => undefined,
    positionLabel: () => {},
    currentMatch: null,
    scene: scene as any,
    ignoreUI: () => {},
  };

  return { context, circles, texts, playedSounds, eventCallbacks };
}

test("VIRUS_DAMAGE_COLOR matches purple virus accent token in THEME", () => {
  assert.equal(THEME.colors.virusAccent, 0xa855f7);
  assert.equal(VIRUS_DAMAGE_COLOR, 0xa855f7);
  assert.equal(VIRUS_DAMAGE_TEXT_COLOR, "#f87171");
  assert.equal(VIRUS_DAMAGE_STROKE_COLOR, "#3b0764");
});

test("ActionLibrary defines virus_damage action", () => {
  assert.ok(ActionLibrary.virus_damage);
  assert.equal(ActionLibrary.virus_damage.id, "virus_damage");
  assert.equal(ActionLibrary.virus_damage.name, "Daño por virus");
  assert.equal(ActionLibrary.virus_damage.hidden, true);
  assert.equal(ActionLibrary.virus_damage.frame, "virus.png");
});

test("animateVirusDamageEvent applies purple tint, creates effect & text, and clears tint on untinted sprite", async () => {
  const sprite = createMockSprite({ isTinted: false });
  const { context, circles, texts, playedSounds } = createMockContext(sprite);

  const event: ReplayPlayerEvent = {
    kind: "player",
    actorId: "infected_source",
    action: {
      actionId: "inject_virus",
      damageDealt: 1,
      metadata: { infectionTick: true },
    },
    targets: [{ targetId: "p1", damageTaken: 1 }],
  };

  await animateVirusDamageEvent(context, event);

  // Purple tint was applied during animation
  assert.ok(sprite.appliedTints.includes(VIRUS_DAMAGE_COLOR), "sprite should have been tinted with purple");
  // Original tint was restored (cleared because untinted)
  assert.equal(sprite.clearedTint, true);

  // Circle effect created with purple color and destroyed on complete
  assert.equal(circles.length, 1);
  assert.equal(circles[0].color, VIRUS_DAMAGE_COLOR);
  assert.equal(circles[0].destroyed, true);

  // Damage text created with correct value, colors, stroke, and destroyed
  assert.equal(texts.length, 1);
  assert.equal(texts[0].text, "-1");
  assert.equal(texts[0].style.color, VIRUS_DAMAGE_TEXT_COLOR);
  assert.equal(texts[0].style.stroke, VIRUS_DAMAGE_STROKE_COLOR);
  assert.equal(texts[0].destroyed, true);

  // Sound played
  assert.ok(playedSounds.length > 0);
  assert.equal(playedSounds[0], "hurt");
});

test("animateInjectVirusEvent with infectionTick delegates to virus damage animation", async () => {
  const sprite = createMockSprite({ isTinted: false });
  const { context, circles, texts } = createMockContext(sprite);

  const event: ReplayPlayerEvent = {
    kind: "player",
    actorId: "source_player",
    action: {
      actionId: "inject_virus",
      damageDealt: 2,
      metadata: { infectionTick: true },
    },
    targets: [{ targetId: "p1", damageTaken: 2 }],
  };

  await animateInjectVirusEvent(context, event);

  assert.ok(sprite.appliedTints.includes(VIRUS_DAMAGE_COLOR));
  assert.equal(texts.length, 1);
  assert.equal(texts[0].text, "-2");
});
