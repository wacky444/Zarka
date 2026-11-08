import assert from "node:assert/strict";
import { test } from "node:test";
import { THEME } from "../src/ui/ColorPalette";
import { getLocale, setLocale, t } from "../src/services/i18n";
import {
  formatHugoCharacterLog,
  formatCharacterTurnLog,
  type HugoCharacterInput,
} from "../src/utils/logFormatter";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import type { ReplayEvent, ReplaySnapshot, PlayerCharacter } from "@shared";

function createMockScene(): any {
  const mockGameObject = () => {
    let textValue = "";
    let colorValue = "";
    const obj: any = {
      x: 0,
      y: 0,
      width: 100,
      height: 24,
      visible: true,
      active: true,
      originX: 0,
      originY: 0,
      scene: null,
      list: [] as any[],
      get text() {
        return textValue;
      },
      set text(v: string) {
        textValue = v;
      },
      get color() {
        return colorValue;
      },
      set color(c: string) {
        colorValue = c;
      },
      setOrigin() {
        return obj;
      },
      setPosition(x: number, y: number) {
        obj.x = x;
        obj.y = y;
        return obj;
      },
      setSize(w: number, h: number) {
        obj.width = w;
        obj.height = h;
        return obj;
      },
      setMinSize() {
        return obj;
      },
      setDisplaySize() {
        return obj;
      },
      setVisible(v: boolean) {
        obj.visible = v;
        return obj;
      },
      setActive(v: boolean) {
        obj.active = v;
        return obj;
      },
      setText(t: string) {
        textValue = t;
        return obj;
      },
      setColor(c: string) {
        colorValue = c;
        return obj;
      },
      setWordWrapWidth() {
        return obj;
      },
      setAlpha() {
        return obj;
      },
      createGeometryMask() {
        return { destroy() {} };
      },
      layout() {
        return obj;
      },
      add(child: any) {
        if (Array.isArray(child)) {
          obj.list.push(...child);
        } else {
          obj.list.push(child);
        }
        return obj;
      },
      remove(child: any) {
        const idx = obj.list.indexOf(child);
        if (idx >= 0) obj.list.splice(idx, 1);
        return obj;
      },
      removeAll() {
        obj.list = [];
        return obj;
      },
      setInteractive() {
        return obj;
      },
      disableInteractive() {
        return obj;
      },
      on() {
        return obj;
      },
      off() {
        return obj;
      },
      destroy() {},
    };
    return obj;
  };

  const scene: any = {
    scale: { width: 1024, height: 768 },
    time: {
      addEvent: () => ({ remove() {} }),
    },
    textures: {
      exists: () => true,
    },
    input: {
      on: () => scene.input,
      off: () => scene.input,
    },
    add: {
      container: () => {
        const c = mockGameObject();
        c.scene = scene;
        c.setScrollFactor = () => c;
        c.setDepth = () => c;
        return c;
      },
      rectangle: () => {
        const r = mockGameObject();
        r.scene = scene;
        r.setScrollFactor = () => r;
        return r;
      },
      text: (_x: number, _y: number, text: string, style?: any) => {
        const tObj = mockGameObject();
        tObj.scene = scene;
        tObj.text = text;
        if (style?.color) tObj.color = style.color;
        tObj.setScrollFactor = () => tObj;
        return tObj;
      },
      image: () => {
        const img = mockGameObject();
        img.scene = scene;
        img.setScrollFactor = () => img;
        return img;
      },
    },
    rexUI: {
      add: {
        roundRectangle: () => {
          const rr = mockGameObject();
          rr.scene = scene;
          return rr;
        },
        scrollablePanel: () => {
          const sp = mockGameObject();
          sp.scene = scene;
          sp.getElement = () => null;
          sp.layout = () => sp;
          return sp;
        },
      },
    },
  };

  return scene;
}

test("THEME.colors in ColorPalette.ts defines loversAccent, loversText, loversBackground, and loversBorder", () => {
  assert.equal(typeof THEME.colors.loversAccent, "number");
  assert.equal(typeof THEME.colors.loversText, "string");
  assert.equal(typeof THEME.colors.loversBackground, "number");
  assert.equal(typeof THEME.colors.loversBorder, "number");

  assert.equal(THEME.colors.loversAccent, 0xf43f5e);
  assert.equal(THEME.colors.loversText, "#fb7185");
  assert.equal(THEME.colors.loversBackground, 0x3b182f);
  assert.equal(THEME.colors.loversBorder, 0xe11d48);
});

test("formatCharacterTurnLog formats Lovers team with cover team and shared partner visibility", () => {
  // 1: Team header formatting with cover team
  const loverChar: PlayerCharacter = {
    id: "alice",
    name: "Alice",
    secretTeamId: "Enamorados",
    teamId: "Banda Calavera",
    position: { coord: { q: 1, r: 1 }, tileId: "tile_1_1" },
    stats: { baseViewRange: 2, speed: 3 } as any,
    relationships: { confirmedTeammates: ["bob"] },
    revealedTeamIdsByPlayerId: { bob: "Enamorados" },
  } as any;

  const charTurnLog = formatCharacterTurnLog(loverChar as any, undefined, 1);
  const turnLines = charTurnLog.split("\n");
  assert.equal(turnLines[1], "Equipo Enamorados (Tapadera: Banda Calavera)");

  // 2: Shared partner sight in snapshot
  const partnerChar: PlayerCharacter = {
    id: "bob",
    name: "Bob",
    secretTeamId: "Enamorados",
    teamId: "Equipo Azul",
    position: { coord: { q: 10, r: 10 }, tileId: "tile_10_10" },
    stats: { baseViewRange: 2, speed: 3 } as any,
    relationships: { confirmedTeammates: ["alice"] },
    revealedTeamIdsByPlayerId: { alice: "Enamorados" },
    discoveredItemIds: ["item_remote_pistol"],
  } as any;

  const enemyChar: PlayerCharacter = {
    id: "charlie",
    name: "Charlie",
    position: { coord: { q: 11, r: 10 }, tileId: "tile_11_10" },
    stats: { baseViewRange: 2 } as any,
  } as any;

  const snapshot: ReplaySnapshot = {
    turn: 5,
    matchId: "m_lovers_log",
    playerCharacters: {
      alice: loverChar,
      bob: partnerChar,
      charlie: enemyChar,
    },
    items: [
      { id: "item_remote_pistol", itemId: "pistol", coord: { q: 11, r: 11 } } as any,
    ],
  };

  const sharedSightLog = formatCharacterTurnLog(
    loverChar as any,
    undefined,
    5,
    undefined,
    snapshot
  );
  assert.ok(
    sharedSightLog.includes("Charlie"),
    `Expected 'Charlie' in visible entities via shared partner sight: ${sharedSightLog}`
  );
  assert.ok(
    sharedSightLog.includes("pistol"),
    `Expected 'pistol' in visible entities via shared partner sight: ${sharedSightLog}`
  );
});

test("CharacterPanelLogView and formatCharacterTurnLog format lovers_formed, lovers_announced, and status_dead (wasLover: true) in English and Spanish", () => {
  const originalLocale = getLocale();
  try {
    for (const locale of ["en", "es"] as const) {
      setLocale(locale);

      const eliminatedList: Array<{ playerId?: string; teamId?: string }> = [];
      const scene = createMockScene();
      const mockEl = () => ({
        setPosition() { return this; },
        setX() { return this; },
        setY() { return this; },
        setSize() { return this; },
        setDisplaySize() { return this; },
        setVisible() { return this; },
        setSelectorWidth() { return this; },
        setValue() { return this; },
        setWordWrapWidth() { return this; },
        setButtonSize() { return this; },
        getWorldTransformMatrix() { return { tx: 0, ty: 0 }; },
        setInteractive() { return this; },
        disableInteractive() { return this; },
        setAlpha() { return this; },
        setColor() { return this; },
        on() { return this; },
        off() { return this; },
        text: "",
        setText(v: string) { this.text = v; return this; },
        x: 0, y: 0, width: 10, height: 10,
        visible: true,
        scene,
      });

      const logView = new CharacterPanelLogView({
        panel: { add() {} } as any,
        elements: {
          prevButton: mockEl() as any,
          nextButton: mockEl() as any,
          playButton: mockEl() as any,
          filterTrack: mockEl() as any,
          filterKnob: mockEl() as any,
          filterLabel: mockEl() as any,
          turnLabel: mockEl() as any,
          statusText: mockEl() as any,
          eventsBox: mockEl() as any,
          eventsText: mockEl() as any,
        },
        onElimination: (elimination: any) => {
          eliminatedList.push(elimination);
        },
      });

      const replayEvents: ReplayEvent[] = [
        {
          kind: "player",
          actorId: "alice",
          importance: 1,
          action: {
            actionId: "lovers_formed",
            metadata: {
              partnerPlayerId: "bob",
              coverTeamId: "Banda Calavera",
            },
          },
        },
        {
          kind: "player",
          actorId: "",
          importance: 1,
          action: {
            actionId: "lovers_announced",
          },
        },
        {
          kind: "player",
          actorId: "alice",
          importance: 1,
          action: {
            actionId: "status_dead",
            metadata: {
              wasLover: true,
              teamId: "Enamorados",
            },
          },
        },
      ];

      const lines = logView.formatReplayEvents(replayEvents);

      // Verify lovers_formed line
      const formedExpected = t("fell in love with");
      const coverExpected = `${t("Cover team")}: ${t("Banda Calavera")}`;
      assert.ok(
        lines[0].includes(formedExpected),
        `[${locale}] Missing '${formedExpected}' in: ${lines[0]}`
      );
      assert.ok(
        lines[0].includes(coverExpected),
        `[${locale}] Missing '${coverExpected}' in: ${lines[0]}`
      );
      assert.ok(
        lines[0].includes(t("Enamorados")),
        `[${locale}] Missing team in: ${lines[0]}`
      );

      // Verify lovers_announced line
      const announceExpected = t("Two survivors have fallen in love in Zarka");
      assert.ok(
        lines[1].includes(announceExpected),
        `[${locale}] Missing '${announceExpected}' in: ${lines[1]}`
      );

      // Verify status_dead line with Lover notice
      const deadLoverExpected = t("One of the Lovers has died");
      assert.ok(
        lines[2].includes(t("was eliminated")),
        `[${locale}] Missing elimination in: ${lines[2]}`
      );
      assert.ok(
        lines[2].includes(deadLoverExpected),
        `[${locale}] Missing '${deadLoverExpected}' in: ${lines[2]}`
      );

      // Verify onElimination callback received teamId: "Enamorados"
      logView.notifyEliminationEvents(1, replayEvents);
      assert.equal(eliminatedList.length, 1);
      assert.equal(eliminatedList[0].playerId, "alice");
      assert.equal(eliminatedList[0].teamId, "Enamorados");

      // Verify formatCharacterTurnLog with formatted event lines
      const charLog = formatCharacterTurnLog(
        {
          id: "alice",
          name: "Alice",
          secretTeamId: "Enamorados",
          teamId: "Banda Calavera",
          position: { coord: { q: 1, r: 1 } },
          stats: { baseViewRange: 2 },
        } as any,
        undefined,
        4,
        lines
      );
      assert.ok(
        charLog.includes(formedExpected),
        `[${locale}] Expected turn log to include '${formedExpected}': ${charLog}`
      );
      assert.ok(
        charLog.includes(announceExpected),
        `[${locale}] Expected turn log to include '${announceExpected}': ${charLog}`
      );
      assert.ok(
        charLog.includes(deadLoverExpected),
        `[${locale}] Expected turn log to include '${deadLoverExpected}': ${charLog}`
      );
    }
  } finally {
    setLocale(originalLocale);
  }
});
