import assert from "node:assert/strict";
import { test } from "node:test";
import { THEME } from "../src/ui/ColorPalette";
import { getLocale, setLocale, t } from "../src/services/i18n";
import { LobbyView } from "../src/scenes/LobbyView";

function createMockScene(): any {
  const mockGameObject = () => {
    let textValue = "";
    let alphaValue = 1;
    let interactive = false;
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
      sys: { sys: true },
      get text() { return textValue; },
      set text(v: string) { textValue = v; },
      get alpha() { return alphaValue; },
      get isInteractive() { return interactive; },
      setOrigin() { return obj; },
      setPosition(x: number, y: number) { obj.x = x; obj.y = y; return obj; },
      setSize(w: number, h: number) { obj.width = w; obj.height = h; return obj; },
      setMinSize() { return obj; },
      setDisplaySize() { return obj; },
      setVisible(v: boolean) { obj.visible = v; return obj; },
      setActive(v: boolean) { obj.active = v; return obj; },
      setText(t: string) { textValue = t; return obj; },
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
      setAlpha(a: number) { alphaValue = a; return obj; },
      setInteractive() { interactive = true; return obj; },
      disableInteractive() { interactive = false; return obj; },
      on() { return obj; },
      off() { return obj; },
      destroy() {}
    };
    return obj;
  };

  const scene: any = {
    add: {
      container: () => {
        const c = mockGameObject();
        c.scene = scene;
        return c;
      },
      text: (_x: number, _y: number, text: string) => {
        const t = mockGameObject();
        t.scene = scene;
        t.text = text;
        return t;
      },
      rectangle: () => {
        const r = mockGameObject();
        r.scene = scene;
        return r;
      },
      image: () => {
        const img = mockGameObject();
        img.scene = scene;
        return img;
      },
      graphics: () => {
        const g = mockGameObject();
        g.scene = scene;
        return g;
      },
      existing: (item: any) => item,
      zone: () => {
        const z = mockGameObject();
        z.scene = scene;
        return z;
      }
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

test("THEME.colors exports lovers tokens", () => {
  assert.equal(THEME.colors.loversAccent, 0xf43f5e);
  assert.equal(THEME.colors.loversText, "#fb7185");
  assert.equal(THEME.colors.loversBackground, 0x3b182f);
  assert.equal(THEME.colors.loversBorder, 0xe11d48);
});

test("Lovers translation keys resolve properly in both English and Spanish", () => {
  const originalLocale = getLocale();

  try {
    // English
    setLocale("en");
    assert.equal(t("Enamorados"), "Lovers");
    assert.equal(t("Lovers"), "Lovers");
    assert.equal(t("Lovers Team"), "Lovers Team");
    assert.equal(t("Equipo Enamorados"), "Lovers Team");
    assert.equal(t("Enable Lovers Team"), "Enable Lovers Team");
    assert.equal(t("Activar equipo Enamorados"), "Enable Lovers Team");
    assert.equal(t("Cover team"), "Cover team");
    assert.equal(t("Equipo tapadera"), "Cover team");
    assert.equal(t("Lover"), "Lover");
    assert.equal(t("Enamorado/a"), "Lover");
    assert.equal(t("fell in love with"), "fell in love with");
    assert.equal(t("se ha enamorado de"), "fell in love with");
    assert.equal(
      t("Two survivors have fallen in love in Zarka"),
      "Two survivors have fallen in love in Zarka"
    );
    assert.equal(
      t("Dos supervivientes se han enamorado en Zarka"),
      "Two survivors have fallen in love in Zarka"
    );
    assert.equal(
      t("One of the Lovers has died"),
      "One of the Lovers has died"
    );
    assert.equal(
      t("Ha muerto uno de los Enamorados"),
      "One of the Lovers has died"
    );

    // Spanish
    setLocale("es");
    assert.equal(t("Enamorados"), "Enamorados");
    assert.equal(t("Lovers"), "Enamorados");
    assert.equal(t("Lovers Team"), "Equipo Enamorados");
    assert.equal(t("Equipo Enamorados"), "Equipo Enamorados");
    assert.equal(t("Enable Lovers Team"), "Activar equipo Enamorados");
    assert.equal(t("Activar equipo Enamorados"), "Activar equipo Enamorados");
    assert.equal(t("Cover team"), "Equipo tapadera");
    assert.equal(t("Equipo tapadera"), "Equipo tapadera");
    assert.equal(t("Lover"), "Enamorado/a");
    assert.equal(t("Enamorado/a"), "Enamorado/a");
    assert.equal(t("fell in love with"), "se ha enamorado de");
    assert.equal(t("se ha enamorado de"), "se ha enamorado de");
    assert.equal(
      t("Two survivors have fallen in love in Zarka"),
      "Dos supervivientes se han enamorado en Zarka"
    );
    assert.equal(
      t("Dos supervivientes se han enamorado en Zarka"),
      "Dos supervivientes se han enamorado en Zarka"
    );
    assert.equal(
      t("One of the Lovers has died"),
      "Ha muerto uno de los Enamorados"
    );
    assert.equal(
      t("Ha muerto uno de los Enamorados"),
      "Ha muerto uno de los Enamorados"
    );
  } finally {
    setLocale(originalLocale);
  }
});

test("LobbyView initializes with loversMode: true and applies settings", () => {
  const scene = createMockScene();
  const lobby = new LobbyView(scene);

  const initialSettings = lobby.getSettings();
  assert.equal(initialSettings.loversMode, true);

  // Apply settings with loversMode: false
  lobby.applySettings({ loversMode: false });
  assert.equal(lobby.getSettings().loversMode, false);

  // Apply settings with loversMode: true
  lobby.applySettings({ loversMode: true });
  assert.equal(lobby.getSettings().loversMode, true);

  // Reset to defaults sets loversMode back to true
  lobby.applySettings({ loversMode: false });
  assert.equal(lobby.getSettings().loversMode, false);
  lobby.resetToDefaults();
  assert.equal(lobby.getSettings().loversMode, true);
});

test("LobbyView disables loversMode toggle when not host or when match is started", () => {
  const scene = createMockScene();
  const lobby = new LobbyView(scene);

  // As non-host
  lobby.setCreator("other_player", false, "Other");
  // Set started
  lobby.setMatchStarted(true);
  assert.equal(lobby.getSettings().loversMode, true);

  // As host before start
  lobby.setMatchStarted(false);
  lobby.setCreator("my_id", true, "Me");
  assert.equal(lobby.getSettings().loversMode, true);

  // When match starts for host
  lobby.setMatchStarted(true);
  assert.equal(lobby.getSettings().loversMode, true);
});
