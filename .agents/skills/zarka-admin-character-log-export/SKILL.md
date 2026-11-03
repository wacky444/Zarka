---
name: zarka-admin-character-log-export
description: Architecture, rules, and workflows for Zarka's admin character log filtering, map POV switching, clipboard export, and turn download features.
---

# Zarka Admin Character Log Export

## Core Rules

1. **Conditional Display**: The character selector row and character-tailored filtering are visible only when the match has ended (full replay mode) or when the caller has admin view enabled (`isAdminViewEnabled()`).
2. **Server-Side Enforcement**: Log filtering and fog-of-war tailoring are strictly enforced by the server (`get_log` / `get_replay` RPC). Regular players in ongoing matches cannot query other players' logs or snapshots.
3. **Single Component Reuse**: Reuse the existing `PlayerSelector` component (with the `"All"` option enabled) rather than building a custom dropdown.
4. **POV Synchronization**: Selecting a character in the log panel simultaneously tailors the replay event log and shifts the game map (tiles, items, players) to that character's point of view.

## Modes & Visibility

- **Standard Player (Ongoing Match)**:
  - Character selector row is hidden.
  - Log box occupies default full height (`CharacterPanelLogView.layout()`).
  - Player receives only their own tailored replay events.
- **Admin or Ended Match (`isAdminViewEnabled() || reportReplayMode`)**:
  - Character filter row is displayed between current turn controls and the log scroll panel.
  - Log panel height is reduced via `calculateLogBoxHeight()` to maintain layout boundaries.
  - Character selector lists all match characters plus `"All"`.
  - Copy log and export turn buttons are available in the row under the character selector.

## Key Files

### Shared
- `shared/src/Payloads.ts`: `GetLogRequestPayload` and `GetLogPayload` contracts supporting optional `character?: string`.
- `shared/src/Replay.ts`: `ReplayEvent`, `ReplaySnapshot`, `ReplayImportance` definitions.

### Server
- `server/modules/src/main.ts`: Registers `"get_log"` RPC alongside `"get_replay"`.
- `server/modules/src/rpc/getReplay.ts`: RPC implementation that checks admin/ended match permissions, tailoring replay events (`tailorReplayEvents`) and map snapshots (`tailorReplaySnapshot`) for character POV or returning full untailored data when `"all"` is requested.

### Client
- `client/src/ui/CharacterPanelLogView.ts`: Header controls (`copyLogButton`, `exportButton`), selector row integration, dynamic box height calculation, and event triggers (`onSelectCharacter`, `onCopyLog`, `onExportTurn`, `onShowNotification`).
- `client/src/ui/PlayerSelector.ts`: Player selector dropdown supporting the `"All"` selection.
- `client/src/ui/panel/CharacterPanel.ts`: Container and bridge emitting events (`log-character-select`, `log-copy`, `log-export`, `banner-notification`).
- `client/src/scenes/GameScene.ts`: Preloads icons, handles `log-character-select`, queries tailored turn data via `turnService.getReplay()`, updates board POV via `applyReplaySnapshot()`, and manages composite cache keys.
- `client/src/utils/logFormatter.ts`: Formats Hugo-style Spanish turn logs (abilities notation `Fuerza 2(x3), Agilidad 2`, attributes, Spanish status translations, item quantities via `ItemLibrary`, `Ves: ...` entity visibility, and recent turns) or combined match logs.
- `client/src/utils/clipboard.ts`: Cross-browser clipboard copy with fallback textarea.
- `client/src/utils/fileDownload.ts`: Browser `.txt` file download trigger.
- `client/src/services/turnService.ts`: Client RPC caller passing `character` parameter.

## Technical Invariants

1. **Replay Cache Keying**:
   - Replay caches must key by turn and character (`${turn}:${characterId ?? "all"}`) via `generateReplayCacheKey()`. Reusing bare turn keys causes stale snapshots when toggling between characters.
2. **Map POV Synchronization**:
   - When receiving tailored turn data, `GameScene.applyReplaySnapshot()` must be invoked with `cached.preTurnSnapshot ?? cached.snapshot` so the board tiles, dropped items, and visible players match the character's perception.
3. **Log Panel Height Recalibration**:
   - When the filter row is visible, `CharacterPanelLogView` must use `calculateLogBoxHeight(baseHeight, hasFilterRow)` to reduce the scroll panel height and avoid overflowing the panel tabs.
4. **Clipboard Toast Feedback**:
   - Copying a log must invoke `onShowNotification` with `getBannerNotificationText(playerName)` (`"{player_name} log copied"` or `"All log copied"`), displaying the message on `TopBanner`.
5. **Assets**:
   - Icons must be preloaded in `GameScene.preload()` from `assets/images/replay-icons/`:
     - `card_tap_outline_up.png` (copy button)
     - `export.png` (export button)

## Hugo-Style Log Format Reference

```text
Hugo Fuerza 2(x3), Agilidad 2
Equipo Verde
Rapidez: 1
Estado: Bien
Localización: (7,0) Farmacia
Puntos habilidad: 2
Experiencia: 5/10
Zarkans: 10
Peso: 16/25
Objetos: comidax2, virus, bebidax2, veneno, antídoto
Vida: 12/12
Esfuerzo: 5/20

Acciones: 
Encuentras antídoto, comidax3, bebida, molotov, madera, cuchillo. 
Player2 turned on chainsaw 
Entrenas

Ves: Player2, Player4, Player7, bebida

5: Detectar - Desayunar
6: Entrenar - Buscar
7: Coger
```
