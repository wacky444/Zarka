import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import type { ReplayEvent } from "@shared";

function createMockElement() {
  return {
    setPosition() {
      return this;
    },
    setSize() {
      return this;
    },
    setDisplaySize() {
      return this;
    },
    setVisible() {
      return this;
    },
    setWordWrapWidth() {
      return this;
    },
    setInteractive() {
      return this;
    },
    disableInteractive() {
      return this;
    },
    setAlpha() {
      return this;
    },
    setColor() {
      return this;
    },
    on() {
      return this;
    },
    text: "",
    setText(value: string) {
      this.text = value;
      return this;
    },
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    scene: {
      input: {
        on() {
          return this;
        }
      }
    }
  };
}

test("setReplay does not trigger onElimination and preserves maxTurn when loading turn with dead character", () => {
  let eliminationCalled = false;
  const turnLabel = createMockElement();

  const logView = new CharacterPanelLogView({
    elements: {
      prevButton: createMockElement() as any,
      nextButton: createMockElement() as any,
      playButton: createMockElement() as any,
      filterTrack: createMockElement() as any,
      filterKnob: createMockElement() as any,
      filterLabel: createMockElement() as any,
      turnLabel: turnLabel as any,
      statusText: createMockElement() as any,
      eventsBox: createMockElement() as any,
      eventsText: createMockElement() as any
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
