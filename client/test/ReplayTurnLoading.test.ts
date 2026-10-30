import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import type { ReplayEvent } from "@shared";

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
    add: { container: gameObject, rectangle: gameObject },
    rexUI: { add: { roundRectangle: gameObject, scrollablePanel: gameObject } }
  };
}

function createMockElement(scene: ReturnType<typeof createMockScene>) {
  return {
    setPosition() { return this; },
    setSize() { return this; },
    setDisplaySize() { return this; },
    setVisible() { return this; },
    setWordWrapWidth() { return this; },
    setInteractive() { return this; },
    disableInteractive() { return this; },
    setAlpha() { return this; },
    setColor() { return this; },
    on() { return this; },
    off() { return this; },
    text: "",
    setText(value: string) { this.text = value; return this; },
    x: 0, y: 0, width: 10, height: 10,
    scene
  };
}

test("setReplay does not trigger onElimination and preserves maxTurn when loading turn with dead character", () => {
  let eliminationCalled = false;
  const scene = createMockScene();
  const turnLabel = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: turnLabel as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: createMockElement(scene) as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => id,
    onElimination: () => {
      eliminationCalled = true;
    }
  });

  const events: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "bot10",
      action: {
        actionId: "status_dead",
        metadata: { teamId: "Leo" }
      }
    }
  ];

  logView.setReplay(8, 33, events);

  assert.equal(eliminationCalled, false);
  assert.equal(logView.getMaxTurn(), 33);
  assert.equal(logView.getSelectedTurn(), 8);
  assert.match(turnLabel.text, /8 \/ 33/);
});
