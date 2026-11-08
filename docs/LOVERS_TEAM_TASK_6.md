# Lovers Team Task 6: Render Lovers Team Status, Partner Highlights, and Turn Log / Banner Notifications

## Goal

Update the in-game Players & Teams panel, Turn Log view, and Top Banner notifications to display the viewer's `Enamorados` secret team alongside their cover team, highlight their Lover partner using centralized `THEME.colors.lovers*` tokens, and format private and public Lovers events.

## Dependencies

Task 3, Task 4, Task 5. Task 7 will add automated tests covering these formatting and UI behaviors.

## Scope

- Modify `client/src/ui/CharacterPanelPlayerListView.ts`:
  - Import `THEME` from `./ColorPalette`.
  - When rendering the selected player card (`refreshPlayerCard`) or the viewer's own entry:
    - If the character is the current viewer and `character.secretTeamId === "Enamorados"` while `character.teamId` is present, display their team label as `${t("Enamorados")} (${t("Cover team")}: ${t(character.teamId)})` and color the team text using `THEME.colors.loversText`.
    - If the selected character is the viewer's confirmed Lover (`viewer?.secretTeamId === "Enamorados"` and `viewer?.revealedTeamIdsByPlayerId?.[selectedId] === "Enamorados"`), display their team label as `${t("Enamorados")} (${t("Lover")})` with `THEME.colors.loversText`, and style the card/row accent using `THEME.colors.loversBackground` and `THEME.colors.loversBorder`.
  - In the **Teams** subtab:
    - When `"Enamorados"` is present in `match.teams` / `match.teamCounts`, render the `"Enamorados"` entry using `THEME.colors.loversText` when the viewer belongs to `"Enamorados"` (or standard team row styling for other players).
- Modify `client/src/ui/CharacterPanelLogView.ts` and `client/src/utils/logFormatter.ts`:
  - Add `"lovers_formed"` and `"lovers_announced"` to `CRITICAL_REPLAY_ACTION_IDS` in `CharacterPanelLogView.ts` so they are classified as `ReplayImportance.Critical` and never hidden by the log importance slider.
  - In `formatReplayEvents` (`CharacterPanelLogView.ts`):
    - Handle `actionId === "lovers_formed"`:
      - Read `partnerPlayerId` and `coverTeamId` from `event.action.metadata`.
      - Format as: `${actor} ${t("fell in love with")} ${partnerName} — ${t("belongs to the team")} ${t("Enamorados")} (${t("Cover team")}: ${t(coverTeamId)})`.
    - Handle `actionId === "lovers_announced"`:
      - Format as: `${t("Two survivors have fallen in love in Zarka")}` (without referencing `actorId`).
    - Handle `actionId === "status_dead"`:
      - When `(event.action.metadata as { wasLover?: unknown; teamId?: unknown } | undefined)?.wasLover === true` or `teamId === "Enamorados"`, append `${t("One of the Lovers has died")}` to the elimination log line and pass `teamId: "Enamorados"` to `this.options.onElimination`.
  - In `formatCharacterTurnLog` / `formatHugoCharacterLog` (`client/src/utils/logFormatter.ts`):
    - Ensure that when exporting/copying a Lover's turn log, if `character.secretTeamId === "Enamorados"` and `character.teamId` is defined, the team header formats as `Equipo Enamorados (Tapadera: ${character.teamId})`, and `visibleEntities` includes entities visible through shared Lover sight in `snapshot`.
- Modify `client/src/scenes/GameScene.ts` / `client/src/ui/TopBanner.ts`:
  - When a turn advances and the replay events include `"lovers_announced"`, `"lovers_formed"`, or a `"status_dead"` event with `wasLover: true`, trigger a notification in `TopBanner` styled with `THEME.colors.loversText` / `THEME.colors.loversAccent` from `ColorPalette.ts`.
- Explicit non-goals:
  - Do not hardcode any hex strings or numeric color literals in `CharacterPanelPlayerListView.ts`, `CharacterPanelLogView.ts`, or `TopBanner.ts`—all colors must come from `THEME.colors` in `client/src/ui/ColorPalette.ts`.

## Acceptance

- A player who becomes a Lover sees `Enamorados (Cover team: <Team>)` in their player card and sees their Lover partner highlighted in the Players list using `THEME.colors.loversBackground`, `THEME.colors.loversBorder`, and `THEME.colors.loversText`.
- On the turn Lovers form, both Lovers see the private `lovers_formed` entry in the Turn Log, and all players in the match see the public `lovers_announced` notice in the Turn Log and Top Banner without the Lovers' names being revealed to outsiders.
- When a Lover dies, all players see the public notice that one of the Lovers has died and see their revealed team as `Enamorados`.
- All Lovers events remain visible even when the Turn Log filter slider is set to `ReplayImportance.Critical`.

## Validation

- Build client: `cd client && npm run build`
- Lint client: `cd client && npm run lint`
- Run client tests: `cd client && npm test`
