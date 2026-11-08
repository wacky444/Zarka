# Lovers Team Task 2: Implement Match Creation, Lobby Settings RPC, and Secret Trigger Turn Initialization

## Goal

Persist the `loversMode` configuration option across match creation and lobby settings RPCs, and secretly roll `loversTriggerTurn` in `[4, 20]` when initializing a match with at least two opposing teams.

## Dependencies

Task 1. Task 3 will read `loversMode` and `loversTriggerTurn` during turn resolution, and Task 5 will connect the lobby toggle UI to these RPC fields.

## Scope

- Modify `server/modules/src/rpc/createMatch.ts`:
  - Parse optional `loversMode` boolean from the `create_match` JSON payload, defaulting to `true` when omitted.
  - Include `loversMode: String(loversMode)` in `params` passed to `nkWrapper.matchCreate` and store `loversMode` on the initial `MatchRecord` written to storage.
  - Return `loversMode` in `CreateMatchPayload`.
- Modify `server/modules/src/rpc/createTutorialMatch.ts`:
  - Explicitly set `loversMode: false` on tutorial `MatchRecord` instances so tutorial matches never roll or trigger the Lovers team.
- Modify `server/modules/src/rpc/updateSettings.ts`:
  - Parse `const newLoversMode = typeof settings.loversMode === "boolean" ? settings.loversMode : undefined;`.
  - When `typeof newLoversMode === "boolean"` and `!match.started`, update `match.loversMode = newLoversMode`.
  - Include `loversMode: match.loversMode` in the `update_settings` match signal payload and in the returned `UpdateSettingsPayload`.
- Modify `server/modules/src/services/matchCardSummary.ts` (and `listMyMatches.ts` if applicable):
  - Map `loversMode: match.loversMode` onto `MyMatchCardSummary`.
- Modify `server/modules/src/match/teams.ts` and `server/modules/src/match/startMatchRecord.ts`:
  - In `distributeTeams` (or `startMatchRecord` immediately after `distributeTeams`), check if `match.loversMode !== false`, `!match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]`, and `Object.keys(result.teams).filter((t) => t !== "Gemelos").length >= 2`.
  - When eligible, roll a secret integer `loversTriggerTurn` in `[4, 20]` inclusive (`4 + Math.floor(Math.random() * 17)`) and assign `match.loversTriggerTurn = loversTriggerTurn`.
  - If `match.loversMode === false` or fewer than two opposing teams exist, leave `match.loversTriggerTurn` undefined.
- Explicit non-goals:
  - Do not execute mid-match Lovers formation during turn resolution yet (belongs to Task 3).
  - Do not redact `loversTriggerTurn` in `matchView.ts` yet (belongs to Task 4).
  - Do not add the lobby toggle control in `client/src/scenes/LobbyView.ts` yet (belongs to Task 5).

## Acceptance

- Creating a normal match defaults `match.loversMode` to `true`, while `loversMode: false` in the `create_match` or `update_settings` payload persists `false`.
- Creating a tutorial match always sets `match.loversMode` to `false` and never sets `loversTriggerTurn`.
- Starting a match with `loversMode !== false` and at least 2 opposing teams sets `match.loversTriggerTurn` to an integer `t` satisfying `4 <= t <= 20`.
- Starting a match with `loversMode === false` leaves `match.loversTriggerTurn` undefined.

## Validation

- Build server modules: `cd server/modules && npm run build`
- Run server unit tests: `cd server/modules && npm test`
- Run team assignment tests specifically: `cd server/modules && npx tsx --test test/team-assignment.test.ts`
