import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  ReplayActionEffect,
  type ReplayPlayerEvent,
} from "@shared";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import { setLocale, t } from "../src/services/i18n";

function createMockScene() {
  const mask = { destroy() {} };
  const gameObject = () => ({
    visible: true,
    setOrigin() { return this; },
    setScrollFactor() { return this; },
    setPosition() { return this; },
    setSize() { return this; },
    setMinSize() {},
    setMask() { return this; },
    clearMask() { return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setMouseWheelScrollerEnable() {},
    setScrollerEnable() {},
    layout() {},
    add() { return this; },
    destroy() {},
    createGeometryMask() { return mask; },
    getWorldTransformMatrix() { return { tx: 0, ty: 0 }; }
  });
  const input = { on() { return this; }, off() { return this; } };
  return {
    input,
    add: { container: gameObject, rectangle: gameObject, zone: gameObject, text: gameObject, image: gameObject },
    rexUI: { add: { roundRectangle: gameObject, scrollablePanel: gameObject } }
  };
}

function createMockElement(scene: ReturnType<typeof createMockScene>) {
  return {
    setPosition(x?: number, y?: number) {
      if (typeof x === "number") this.x = x;
      if (typeof y === "number") this.y = y;
      return this;
    },
    setX(x: number) { this.x = x; return this; },
    setY(y: number) { this.y = y; return this; },
    setSize(w: number, h: number) { this.width = w; this.height = h; return this; },
    setDisplaySize(w: number, h: number) { this.width = w; this.height = h; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setSelectorWidth(w: number) { this.width = w; return this; },
    setValue() { return this; },
    setWordWrapWidth() { return this; },
    setButtonSize(w: number, h: number) { this.width = w; this.height = h; return this; },
    getWorldTransformMatrix() { return { tx: 0, ty: 0 }; },
    setInteractive() { return this; },
    disableInteractive() { return this; },
    setAlpha() { return this; },
    setColor() { return this; },
    on() { return this; },
    off() { return this; },
    text: "",
    setText(value: string) { this.text = value; return this; },
    x: 0, y: 0, width: 10, height: 10,
    visible: true,
    scene
  };
}

test("CharacterPanelLogView formats protect targeting another character in English and Spanish", () => {
  const scene = createMockScene();
  const eventsText = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: createMockElement(scene) as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: eventsText as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => ActionLibrary[id as keyof typeof ActionLibrary]?.name ?? id
  });

  logView.setPlayerCharacters({
    p1: { id: "p1", name: "Hugo", teamId: "Red" } as any,
    p2: { id: "p2", name: "Roberto", teamId: "Blue" } as any
  });

  const protectEvent: ReplayPlayerEvent = {
    kind: "player",
    importance: 1,
    actorId: "p1",
    action: {
      actionId: "protect"
    },
    targets: [
      { targetId: "p1", effects: ReplayActionEffect.Guard },
      { targetId: "p2", effects: ReplayActionEffect.Guard }
    ]
  };

  setLocale("en");
  logView.setReplay(1, 1, [protectEvent]);
  assert.equal(eventsText.text, "Hugo protects Roberto");

  setLocale("es");
  logView.setReplay(1, 1, [protectEvent]);
  assert.equal(eventsText.text, "Hugo protege a Roberto");
});

test("CharacterPanelLogView formats protect targeting only self in English and Spanish", () => {
  const scene = createMockScene();
  const eventsText = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: createMockElement(scene) as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: eventsText as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => ActionLibrary[id as keyof typeof ActionLibrary]?.name ?? id
  });

  logView.setPlayerCharacters({
    p1: { id: "p1", name: "Hugo", teamId: "Red" } as any
  });

  const selfProtectEvent: ReplayPlayerEvent = {
    kind: "player",
    importance: 1,
    actorId: "p1",
    action: {
      actionId: "protect"
    },
    targets: [
      { targetId: "p1", effects: ReplayActionEffect.Guard }
    ]
  };

  setLocale("en");
  logView.setReplay(1, 1, [selfProtectEvent]);
  assert.equal(eventsText.text, "Hugo used Protect");

  setLocale("es");
  logView.setReplay(1, 1, [selfProtectEvent]);
  assert.equal(eventsText.text, "Hugo usó Proteger");
});

test("protect action description translates correctly in English and Spanish", () => {
  const desc = ActionLibrary.protect.effects[0].description;
  assert.ok(desc.includes("siempre protege al propio personaje"));
  assert.ok(desc.includes("si se selecciona un objetivo, protege a ambos"));

  setLocale("en");
  const enDesc = t(desc);
  assert.ok(enDesc.includes("always protects your own character"));
  assert.ok(enDesc.includes("if a target is selected, protects both"));

  setLocale("es");
  const esDesc = t(desc);
  assert.equal(esDesc, desc);
});
