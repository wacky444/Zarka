# Lovers Team Task 5: Add Centralized Color Palette Tokens, Localization Keys, and Lobby Match Option UI

## Goal

Define all *Enamorados* UI color tokens in `client/src/ui/ColorPalette.ts`, add English and Spanish localization entries in `client/src/services/i18n.ts`, and expose the **Lovers Team (*Enamorados*)** toggle in the lobby match settings UI.

## Dependencies

Task 1, Task 2. Task 6 will consume the centralized `THEME.colors.lovers*` tokens and localization keys in the in-game player list, turn log, and banner notifications.

## Scope

- Modify `client/src/ui/ColorPalette.ts`:
  - Add semantic tokens for the Lovers (*Enamorados*) team inside `THEME.colors`:
    - `loversAccent: 0xf43f5e` — numeric rose accent for strokes, indicators, and badges.
    - `loversText: "#fb7185"` — CSS hex string for Lover team status text, partner labels, and log/banner text highlights.
    - `loversBackground: 0x3b182f` — numeric fill color for highlighting the confirmed Lover partner row/card.
    - `loversBorder: 0xe11d48` — numeric stroke color for Lover card borders.
  - All UI components introduced or updated in Task 5 and Task 6 must import `THEME` from `client/src/ui/ColorPalette.ts` and reference `THEME.colors.lovers*` instead of inline color literals.
- Modify `client/src/services/i18n.ts`:
  - Add bilingual English and Spanish entries for:
    - `"Enamorados"` -> EN: `"Lovers"` / ES: `"Enamorados"`
    - `"Lovers Team"` -> EN: `"Lovers Team"` / ES: `"Equipo Enamorados"`
    - `"Enable Lovers Team"` -> EN: `"Enable Lovers Team"` / ES: `"Activar equipo Enamorados"`
    - `"Cover team"` -> EN: `"Cover team"` / ES: `"Equipo tapadera"`
    - `"Lover"` -> EN: `"Lover"` / ES: `"Enamorado/a"`
    - `"fell in love with"` -> EN: `"fell in love with"` / ES: `"se ha enamorado de"`
    - `"Two survivors have fallen in love in Zarka"` -> EN: `"Two survivors have fallen in love in Zarka"` / ES: `"Dos supervivientes se han enamorado en Zarka"`
    - `"One of the Lovers has died"` -> EN: `"One of the Lovers has died"` / ES: `"Ha muerto uno de los Enamorados"`
- Modify `client/src/scenes/LobbyView.ts` and `client/src/scenes/MainScene.ts`:
  - Add private state `private loversMode = true;` and `private loversModeToggle?: ToggleHandle;` in `LobbyView`.
  - Instantiate `this.loversModeToggle = addLabeledToggle(scene, 0, 0, t("Lovers Team"), this.loversMode, (val) => { ... })` in `LobbyView` alongside `autoSkipToggle`, triggering `scheduleSettingsUpdate()`.
  - Include `loversMode: this.loversMode` in the `InMatchSettings` object passed to `onSettingsChange` and synchronize `this.loversModeToggle` when receiving match state or `OPCODE_SETTINGS_UPDATE` in `MainScene.ts` / `LobbyView.ts`.
  - Disable editing of `loversModeToggle` for non-hosts or once `this.started` is `true`.
- Explicit non-goals:
  - Do not modify `CharacterPanelPlayerListView.ts`, `CharacterPanelLogView.ts`, or `logFormatter.ts` in this task (belongs to Task 6).

## Acceptance

- `THEME.colors` in `client/src/ui/ColorPalette.ts` exports `loversAccent`, `loversText`, `loversBackground`, and `loversBorder`.
- All new translation keys resolve properly in both English (`en`) and Spanish (`es`) locales via `t(...)`.
- In the match lobby, the host can toggle **Lovers Team** (`loversMode`), which persists via `update_settings` RPC and updates non-host lobby views via `OPCODE_SETTINGS_UPDATE`.
- Non-host players see the current state of the **Lovers Team** toggle in read-only mode.

## Validation

- Build client: `cd client && npm run build`
- Lint client: `cd client && npm run lint`
- Run client tests: `cd client && npm test`
