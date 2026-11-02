import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatAbilityMultipliers,
  formatAllMatchTurnLog,
  formatCharacterTurnLog,
  formatHugoCharacterLog,
  isZarkanIncomeAction
} from "../src/utils/logFormatter";
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

test("isZarkanIncomeAction correctly identifies zarkan income variants", () => {
  assert.equal(isZarkanIncomeAction("Zarkan income"), true);
  assert.equal(isZarkanIncomeAction("zarkan income"), true);
  assert.equal(isZarkanIncomeAction("zarkan_income"), true);
  assert.equal(isZarkanIncomeAction("Hugo ha recibido 1 zarkans diarios"), true);
  assert.equal(isZarkanIncomeAction("Hugo received 1 daily zarkans"), true);
  assert.equal(isZarkanIncomeAction("Buscar"), false);
  assert.equal(isZarkanIncomeAction("Entrenar"), false);
  assert.equal(isZarkanIncomeAction("Moneda de 3 zarkans"), false);
});

test("formatHugoCharacterLog excludes Zarkan income from turnActions and recentTurnsHistory", () => {
  const result = formatHugoCharacterLog({
    name: "Hugo",
    turnActions: [
      "Encuentras comida",
      "Zarkan income",
      "Hugo ha recibido 1 zarkans diarios"
    ],
    recentTurnsHistory: [
      { turn: 1, actions: ["Buscar", "Zarkan income"] },
      { turn: 2, actions: ["Entrenar", "zarkan_income"] }
    ]
  });

  assert.ok(result.includes("Encuentras comida"));
  assert.ok(!result.includes("Zarkan income"));
  assert.ok(!result.includes("zarkan_income"));
  assert.ok(!result.includes("zarkans diarios"));
  assert.ok(result.includes("1: Buscar"));
  assert.ok(result.includes("2: Entrenar"));
});

test("formatCharacterTurnLog and formatAllMatchTurnLog filter out Zarkan income", () => {
  const charLog = formatCharacterTurnLog(
    { name: "Hugo", zarkans: 5 },
    "Verde",
    1,
    [
      "Disparo",
      "Zarkan income",
      "Hugo received 1 daily zarkans"
    ],
    null,
    [{ turn: 1, actions: ["Disparo", "Zarkan income"] }]
  );

  assert.ok(charLog.includes("Zarkans: 5"));
  assert.ok(charLog.includes("Disparo"));
  assert.ok(!charLog.includes("Zarkan income"));
  assert.ok(!charLog.includes("daily zarkans"));

  const allLog = formatAllMatchTurnLog("match-1", 1, [
    "Player1 Disparo",
    "Player1 received 1 daily zarkans",
    "Zarkan income"
  ]);

  assert.ok(allLog.includes("Player1 Disparo"));
  assert.ok(!allLog.includes("daily zarkans"));
  assert.ok(!allLog.includes("Zarkan income"));
});

test("CharacterPanelLogView getFormattedTurnLog does not include Zarkan income", () => {
  const scene = createMockScene();
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
      eventsText: createMockElement(scene) as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => {
      const spaced = id.replace(/[_-]+/g, " ");
      return spaced.slice(0, 1).toUpperCase() + spaced.slice(1);
    }
  });

  logView.setPlayerCharacters({
    p1: {
      id: "p1",
      name: "Hugo",
      teamId: "Verde",
      economy: { zarkans: 10 }
    } as any
  });
  logView.setUsernames({ p1: "Hugo" });

  const events: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "p1",
      action: {
        actionId: "search" as any,
        metadata: {}
      }
    },
    {
      kind: "player",
      actorId: "p1",
      action: {
        actionId: "zarkan_income" as any,
        metadata: { zarkansReceived: 1 }
      }
    }
  ];

  logView.setReplay(1, 1, events);

  const formattedAll = logView.getFormattedTurnLog();
  assert.ok(!formattedAll.includes("Zarkan income"));
  assert.ok(!formattedAll.includes("daily zarkans"));
  assert.ok(!formattedAll.includes("zarkans diarios"));

  logView.setSelectedCharacter("p1");
  const formattedHugo = logView.getFormattedTurnLog();
  assert.ok(!formattedHugo.includes("Zarkan income"));
  assert.ok(!formattedHugo.includes("daily zarkans"));
  assert.ok(!formattedHugo.includes("zarkans diarios"));
  assert.ok(formattedHugo.includes("1: Buscar"));
});

test("formatCharacterTurnLog uses display name in first row instead of player id", () => {
  const charLog = formatCharacterTurnLog(
    { id: "uuid-1234", name: "uuid-1234", skills: ["strength1"] } as any,
    "Verde",
    1,
    ["Buscar"],
    null,
    [],
    "Hugo"
  );
  const firstRow = charLog.split("\n")[0];
  assert.equal(firstRow, "Hugo Fuerza 1");
  assert.ok(!firstRow.includes("uuid-1234"));
});

test("formatAbilityMultipliers and formatHugoCharacterLog use new format 'PlayerName Fuerza 2(x3), Agilidad 2'", () => {
  const formattedFromIds = formatAbilityMultipliers([
    "strength2",
    "strength2",
    "strength2",
    "agility2"
  ]);
  assert.equal(formattedFromIds, "Fuerza 2(x3), Agilidad 2");

  const formattedFromObjects = formatAbilityMultipliers([
    { code: "F", level: 2, multiplier: 3 },
    { code: "A", level: 2 }
  ]);
  assert.equal(formattedFromObjects, "Fuerza 2(x3), Agilidad 2");

  const formattedFromFullNames = formatAbilityMultipliers([
    { code: "Fuerza", level: 2, multiplier: 3 },
    { code: "Agilidad", level: 2 }
  ]);
  assert.equal(formattedFromFullNames, "Fuerza 2(x3), Agilidad 2");

  const formattedFromShorthand = formatAbilityMultipliers([
    "F2",
    "F2",
    "F2",
    "A2"
  ]);
  assert.equal(formattedFromShorthand, "Fuerza 2(x3), Agilidad 2");

  const hugoLog = formatHugoCharacterLog({
    name: "PlayerName",
    abilities: ["strength2", "strength2", "strength2", "agility2"]
  });
  const firstRow = hugoLog.split("\n")[0];
  assert.equal(firstRow, "PlayerName Fuerza 2(x3), Agilidad 2");
});

test("formatCharacterTurnLog falls back to usernames map when character name matches id", () => {
  const charLog = formatCharacterTurnLog(
    { id: "uuid-5678", name: "uuid-5678" } as any,
    "Azul",
    1,
    [],
    null,
    [],
    undefined,
    { "uuid-5678": "Lucia" }
  );
  const firstRow = charLog.split("\n")[0];
  assert.equal(firstRow, "Lucia");
});

test("CharacterPanelLogView getFormattedTurnLog outputs display name in first row", () => {
  const scene = createMockScene();
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
      eventsText: createMockElement(scene) as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => id
  });

  logView.setPlayerCharacters({
    "user-abc": {
      id: "user-abc",
      name: "user-abc",
      teamId: "Rojo"
    } as any
  });
  logView.setPlayerOptions([
    {
      id: "user-abc",
      name: "SuperHugo",
      label: "SuperHugo",
      bodyTexture: "",
      shoesTexture: ""
    }
  ]);

  logView.setSelectedCharacter("user-abc");
  const formatted = logView.getFormattedTurnLog();
  const firstRow = formatted.split("\n")[0];
  assert.equal(firstRow, "SuperHugo");
  assert.ok(!firstRow.includes("user-abc"));
});
