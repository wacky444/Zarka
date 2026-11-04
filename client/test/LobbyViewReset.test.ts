import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MAP_COLS,
  DEFAULT_MAP_ROWS,
  DEFAULT_NORMAL_MATCH_SIZE,
  DEFAULT_SKIN
} from "@shared";
import { LobbyView } from "../src/scenes/LobbyView";

function createMockScene(): any {
  const mockGameObject = () => {
    const obj: any = {
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      visible: true,
      active: true,
      text: "",
      originX: 0,
      originY: 0,
      setOrigin() { return obj; },
      setPosition(x: number, y: number) { obj.x = x; obj.y = y; return obj; },
      setSize(w: number, h: number) { obj.width = w; obj.height = h; return obj; },
      setMinSize() { return obj; },
      setDisplaySize() { return obj; },
      setVisible(v: boolean) { obj.visible = v; return obj; },
      setActive(v: boolean) { obj.active = v; return obj; },
      setText(t: string) { obj.text = t; return obj; },
      setWordWrapWidth() { return obj; },
      setMouseWheelScrollerEnable() {},
      setScrollerEnable() {},
      setT() {},
      layout() { return obj; },
      add() { return obj; },
      remove() { return obj; },
      hide() { return obj; },
      show() { return obj; },
      setFixedSize() { return obj; },
      setPadding() { return obj; },
      setStrokeStyle() { return obj; },
      setColor() { return obj; },
      setStyle() { return obj; },
      fillStyle() { return obj; },
      fillRectShape() { return obj; },
      fillCircle() { return obj; },
      lineStyle() { return obj; },
      lineBetween() { return obj; },
      strokeCircle() { return obj; },
      clear() { return obj; },
      setAlpha() { return obj; },
      setInteractive() { return obj; },
      disableInteractive() { return obj; },
      on() { return obj; },
      off() { return obj; },
      destroy() {}
    };
    return obj;
  };

  const scene: any = {
    add: {
      container: () => mockGameObject(),
      text: (_x: number, _y: number, text: string) => {
        const t = mockGameObject();
        t.text = text;
        return t;
      },
      rectangle: () => mockGameObject(),
      image: () => mockGameObject(),
      graphics: () => mockGameObject(),
      existing: (item: any) => item,
      zone: () => mockGameObject()
    },
    scale: {
      width: 800,
      height: 600,
      on() { return this; },
      off() { return this; }
    },
    rexUI: {
      add: {
        scrollablePanel: () => mockGameObject(),
        roundRectangle: () => mockGameObject(),
        fixWidthSizer: () => mockGameObject()
      }
    },
    sys: {
      sys: true,
      game: { device: { os: { android: false, iOS: false } } },
      events: { on() {}, off() {} }
    },
    textures: {
      exists: () => false,
      get: () => ({})
    },
    events: { on() {}, off() {}, once() {} },
    input: { on() {}, off() {} }
  };
  return scene;
}

test("LobbyView initializes with default match settings", () => {
  const scene = createMockScene();
  const lobby = new LobbyView(scene);
  const settings = lobby.getSettings();

  assert.equal(settings.players, DEFAULT_NORMAL_MATCH_SIZE);
  assert.equal(settings.cols, DEFAULT_MAP_COLS);
  assert.equal(settings.rows, DEFAULT_MAP_ROWS);
  assert.equal(settings.roundTime, "23:00");
  assert.equal(settings.autoSkip, true);
  assert.equal(settings.botPlayers, 5);
  assert.equal(settings.turnsToBeAt1Tile, 30);
  assert.equal(settings.name, "Zarka game");
  assert.equal(settings.gameMasterMode, false);
  assert.equal(settings.controlledCharacterRoster, undefined);
});

test("LobbyView.resetToDefaults resets modified match fields back to initial match state", () => {
  const scene = createMockScene();
  const lobby = new LobbyView(scene);

  // Simulate user changing fields during a previous match
  lobby.applySettings({
    size: 8,
    cols: 10,
    rows: 8,
    roundTime: "10:00",
    autoSkip: false,
    botPlayers: 2,
    turnsToBeAt1Tile: 15,
    name: "Custom Match 123",
    gameMasterMode: true,
    controlledCharacterRoster: [
      { id: "char_1", name: "Alpha", skin: DEFAULT_SKIN },
      { id: "char_2", name: "Beta", skin: DEFAULT_SKIN }
    ]
  });

  const modified = lobby.getSettings();
  assert.equal(modified.players, 8);
  assert.equal(modified.cols, 10);
  assert.equal(modified.rows, 8);
  assert.equal(modified.roundTime, "10:00");
  assert.equal(modified.autoSkip, false);
  assert.equal(modified.botPlayers, 2);
  assert.equal(modified.turnsToBeAt1Tile, 15);
  assert.equal(modified.name, "Custom Match 123");
  assert.equal(modified.gameMasterMode, true);
  assert.equal(modified.controlledCharacterRoster?.length, 2);

  // Now reset to defaults (as when creating a new game)
  lobby.resetToDefaults();

  const reset = lobby.getSettings();
  assert.equal(reset.players, DEFAULT_NORMAL_MATCH_SIZE);
  assert.equal(reset.cols, DEFAULT_MAP_COLS);
  assert.equal(reset.rows, DEFAULT_MAP_ROWS);
  assert.equal(reset.roundTime, "23:00");
  assert.equal(reset.autoSkip, true);
  assert.equal(reset.botPlayers, 5);
  assert.equal(reset.turnsToBeAt1Tile, 30);
  assert.equal(reset.name, "Zarka game");
  assert.equal(reset.gameMasterMode, false);
  assert.equal(reset.controlledCharacterRoster, undefined);
});
