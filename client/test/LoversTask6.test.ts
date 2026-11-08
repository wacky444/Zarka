import assert from "node:assert/strict";
import { test } from "node:test";
import { THEME } from "../src/ui/ColorPalette";
import { getLocale, setLocale, t } from "../src/services/i18n";
import {
  formatHugoCharacterLog,
  formatCharacterTurnLog,
  type HugoCharacterInput
} from "../src/utils/logFormatter";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import { CharacterPanelPlayerListView } from "../src/ui/CharacterPanelPlayerListView";
import { TopBanner } from "../src/ui/TopBanner";
import type { ReplayEvent, ReplaySnapshot, MatchRecord } from "@shared";

function createMockScene(): any {
  const mockGameObject = () => {
    let textValue = "";
    let colorValue = "";
    let fillStyleColor: number | null = null;
    let strokeStyleColor: number | null = null;
    let strokeStyleWidth: number | null = null;
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
      get text() { return textValue; },
      set text(v: string) { textValue = v; },
      get color() { return colorValue; },
      set color(c: string) { colorValue = c; },
      get fillStyleColor() { return fillStyleColor; },
      get strokeStyleColor() { return strokeStyleColor; },
      get strokeStyleWidth() { return strokeStyleWidth; },
      setOrigin() { return obj; },
      setPosition(x: number, y: number) { obj.x = x; obj.y = y; return obj; },
      setSize(w: number, h: number) { obj.width = w; obj.height = h; return obj; },
      setMinSize() { return obj; },
      setDisplaySize() { return obj; },
      setVisible(v: boolean) { obj.visible = v; return obj; },
      setActive(v: boolean) { obj.active = v; return obj; },
      setText(t: string) { textValue = t; return obj; },
      setColor(c: string) { colorValue = c; return obj; },
      setFillStyle(color: number) { fillStyleColor = color; return obj; },
      setStrokeStyle(w?: number, color?: number) {
        strokeStyleWidth = w ?? null;
        strokeStyleColor = color ?? null;
        return obj;
      },
      setWordWrapWidth() { return obj; },
      setAlpha() { return obj; },
      createGeometryMask() { return { destroy() {} }; },
      getWorldTransformMatrix() { return { tx: 0, ty: 0 }; },
      setMouseWheelScrollerEnable() {},
      setScrollerEnable() {},
      layout() { return obj; },
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
      removeAll() { obj.list = []; return obj; },
      setInteractive() { return obj; },
      disableInteractive() { return obj; },
      setTexture() { return obj; },
      on() { return obj; },
      off() { return obj; },
      destroy() {}
    };
    return obj;
  };

  const scene: any = {
    scale: { width: 1024, height: 768 },
    time: {
      addEvent: () => ({ remove() {} })
    },
    textures: {
      exists: () => true
    },
    input: {
      on: () => scene.input,
      off: () => scene.input
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
      }
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
        }
      }
    }
  };

  return scene;
}

test("formatHugoCharacterLog and formatCharacterTurnLog format Lovers team with cover team", () => {
  const input: HugoCharacterInput = {
    name: "Alice",
    secretTeamId: "Enamorados",
    teamId: "Banda Calavera",
    skills: [],
    speed: 3,
    status: [],
    inventory: []
  };

  const formatted = formatHugoCharacterLog(input);
  const lines = formatted.split("\n");
  assert.equal(lines[1], "Equipo Enamorados (Tapadera: Banda Calavera)");

  const charTurnLog = formatCharacterTurnLog(
    {
      id: "alice",
      name: "Alice",
      secretTeamId: "Enamorados",
      teamId: "Banda Calavera",
      position: { coord: { q: 1, r: 1 } },
      stats: { baseViewRange: 3, speed: 3 }
    } as any,
    undefined,
    1
  );
  const turnLines = charTurnLog.split("\n");
  assert.equal(turnLines[1], "Equipo Enamorados (Tapadera: Banda Calavera)");
});

test("formatCharacterTurnLog includes entities visible through shared Lover sight in snapshot", () => {
  const charA = {
    id: "playerA",
    name: "Alice",
    secretTeamId: "Enamorados",
    teamId: "Equipo Rojo",
    position: { coord: { q: 0, r: 0 } },
    stats: { baseViewRange: 2, speed: 3 },
    relationships: { confirmedTeammates: ["playerB"] },
    revealedTeamIdsByPlayerId: { playerB: "Enamorados" }
  };

  const charB = {
    id: "playerB",
    name: "Bob",
    secretTeamId: "Enamorados",
    teamId: "Equipo Azul",
    position: { coord: { q: 10, r: 10 } },
    stats: { baseViewRange: 2, speed: 3 },
    relationships: { confirmedTeammates: ["playerA"] },
    revealedTeamIdsByPlayerId: { playerA: "Enamorados" },
    discoveredItemIds: ["item_remote_1"]
  };

  const enemyC = {
    id: "playerC",
    name: "Charlie",
    position: { coord: { q: 11, r: 10 } }, // Distance 1 from Bob (in Bob's view range), but far from Alice
    stats: { baseViewRange: 2 }
  };

  const snapshot: ReplaySnapshot = {
    turn: 5,
    matchId: "m1",
    playerCharacters: {
      playerA: charA as any,
      playerB: charB as any,
      playerC: enemyC as any
    },
    items: [
      { id: "item_remote_1", itemId: "pistol", coord: { q: 11, r: 11 } }
    ] as any
  };

  const result = formatCharacterTurnLog(charA as any, undefined, 5, undefined, snapshot);
  assert.ok(result.includes("Charlie"), `Expected 'Charlie' in visible entities: ${result}`);
  assert.ok(result.includes("pistol"), `Expected 'pistol' in visible entities: ${result}`);
});

test("CharacterPanelLogView formatReplayEvents handles lovers_formed, lovers_announced, and status_dead (wasLover: true)", () => {
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
        scene
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
          eventsText: mockEl() as any
        },
        onElimination: (elimination: any) => {
          eliminatedList.push(elimination);
        }
      });

      const events: ReplayEvent[] = [
        {
          kind: "player",
          actorId: "char1",
          importance: 1,
          action: {
            actionId: "lovers_formed",
            metadata: {
              partnerPlayerId: "char2",
              coverTeamId: "Banda Calavera"
            }
          }
        },
        {
          kind: "player",
          actorId: "",
          importance: 1,
          action: {
            actionId: "lovers_announced"
          }
        },
        {
          kind: "player",
          actorId: "char1",
          importance: 1,
          action: {
            actionId: "status_dead",
            metadata: {
              wasLover: true,
              teamId: "Enamorados"
            }
          }
        }
      ];

      const lines = logView.formatReplayEvents(events);

      // Verify lovers_formed line
      const formedExpected = `${t("fell in love with")}`;
      const coverExpected = `${t("Cover team")}: ${t("Banda Calavera")}`;
      assert.ok(lines[0].includes(formedExpected), `[${locale}] Missing '${formedExpected}' in: ${lines[0]}`);
      assert.ok(lines[0].includes(coverExpected), `[${locale}] Missing '${coverExpected}' in: ${lines[0]}`);
      assert.ok(lines[0].includes(t("Enamorados")), `[${locale}] Missing team in: ${lines[0]}`);

      // Verify lovers_announced line
      const announceExpected = t("Two survivors have fallen in love in Zarka");
      assert.ok(lines[1].includes(announceExpected), `[${locale}] Missing '${announceExpected}' in: ${lines[1]}`);

      // Verify status_dead line with Lover notice
      const deadLoverExpected = t("One of the Lovers has died");
      assert.ok(lines[2].includes(t("was eliminated")), `[${locale}] Missing elimination in: ${lines[2]}`);
      assert.ok(lines[2].includes(deadLoverExpected), `[${locale}] Missing '${deadLoverExpected}' in: ${lines[2]}`);

      // Verify onElimination callback received teamId: "Enamorados"
      logView.notifyEliminationEvents(1, events);
      assert.equal(eliminatedList.length, 1);
      assert.equal(eliminatedList[0].playerId, "char1");
      assert.equal(eliminatedList[0].teamId, "Enamorados");
    }
  } finally {
    setLocale(originalLocale);
  }
});

test("CharacterPanelPlayerListView renders viewer Lovers status and partner highlight", () => {
  const scene = createMockScene();
  const parent = scene.add.container();
  const view = new CharacterPanelPlayerListView(scene, parent, {
    margin: 10,
    boxWidth: 400,
    top: 50,
    height: 500
  });

  const match: MatchRecord = {
    match_id: "m1",
    current_turn: 5,
    teams: ["Equipo Azul", "Equipo Rojo", "Enamorados"],
    teamCounts: { "Equipo Azul": 2, "Equipo Rojo": 2, "Enamorados": 2 },
    playerCharacters: {
      viewerId: {
        id: "viewerId",
        name: "LoverA",
        secretTeamId: "Enamorados",
        teamId: "Equipo Azul",
        revealedTeamIdsByPlayerId: { partnerId: "Enamorados" },
        relationships: { confirmedTeammates: ["partnerId"] }
      } as any,
      partnerId: {
        id: "partnerId",
        name: "LoverB",
        secretTeamId: "Enamorados",
        teamId: "Equipo Rojo",
        revealedTeamIdsByPlayerId: { viewerId: "Enamorados" },
        relationships: { confirmedTeammates: ["viewerId"] }
      } as any,
      otherId: {
        id: "otherId",
        name: "OtherC",
        teamId: "Equipo Azul"
      } as any
    }
  };

  const players = [
    { id: "viewerId", label: "LoverA" },
    { id: "partnerId", label: "LoverB" },
    { id: "otherId", label: "OtherC" }
  ];

  view.update(match, players, "viewerId");

  // Open viewer's card
  view.openPlayerCard("viewerId");
  const cardTeam = (view as any).playersTabCardTeam;
  assert.ok(
    cardTeam.text.includes("Enamorados"),
    `Expected Enamorados in viewer team text: ${cardTeam.text}`
  );
  assert.ok(
    cardTeam.text.includes("Equipo Azul"),
    `Expected cover team in viewer team text: ${cardTeam.text}`
  );
  assert.equal(cardTeam.color, THEME.colors.loversText);

  // Open partner's card
  view.openPlayerCard("partnerId");
  assert.ok(
    cardTeam.text.includes("Enamorados"),
    `Expected Enamorados in partner team text: ${cardTeam.text}`
  );
  assert.ok(
    cardTeam.text.includes(t("Lover")),
    `Expected Lover in partner team text: ${cardTeam.text}`
  );
  assert.equal(cardTeam.color, THEME.colors.loversText);

  const cardBg = (view as any).playersTabCardBackground;
  assert.equal(cardBg.fillStyleColor, THEME.colors.loversBackground);
  assert.equal(cardBg.strokeStyleColor, THEME.colors.loversBorder);

  // Check partner row in the players list
  const entries = (view as any).playersTabEntries;
  const partnerEntry = entries.find((e: any) => e.playerId === "partnerId");
  assert.ok(partnerEntry, "Partner entry should exist in players tab list");
  assert.equal(partnerEntry.button.fillStyleColor, THEME.colors.loversBackground);
  assert.equal(partnerEntry.button.strokeStyleColor, THEME.colors.loversBorder);
  assert.equal(partnerEntry.label.color, THEME.colors.loversText);
});

test("TopBanner supports styling with loversText and loversAccent tokens", () => {
  const scene = createMockScene();
  const banner = new TopBanner(scene);

  banner.show({
    text: "Two survivors have fallen in love in Zarka",
    textColor: THEME.colors.loversText,
    accentColor: THEME.colors.loversAccent,
    backgroundColor: THEME.colors.loversBackground
  });

  const label = (banner as any).label;
  const bg = (banner as any).background;

  assert.equal(label.text, "Two survivors have fallen in love in Zarka");
  assert.equal(label.color, THEME.colors.loversText);
  assert.equal(bg.fillStyleColor, THEME.colors.loversBackground);
  assert.equal(bg.strokeStyleColor, THEME.colors.loversAccent);
});
