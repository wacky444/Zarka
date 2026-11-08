# Lovers Team Task 7: Add Comprehensive Automated Tests for Lovers Team Mechanics and UI Formatting

## Goal

Add automated server and client unit/integration tests covering the full lifecycle of the Lovers (*Enamorados*) team: secret trigger turn initialization, start-of-turn co-location formation, Twin/same-team exclusions, Detective cover-team preservation, shared partner sight, end-game victory, and client log formatting.

## Dependencies

Task 2, Task 3, Task 4, Task 5, Task 6.

## Scope

- Create `server/modules/test/lovers-team.test.ts`:
  - **Test 1 — Secret Trigger Turn Initialization**:
    - Verify `startMatchRecord` rolls `match.loversTriggerTurn` within `[4, 20]` when `loversMode` is `true` (or omitted) and at least two opposing teams exist.
    - Verify `match.loversTriggerTurn` is `undefined` when `loversMode === false` or in tutorial matches.
  - **Test 2 — Pre-Trigger and Rollover Window (Turns 4–20)**:
    - With `match.loversTriggerTurn = 7`, verify that two opposing non-Twin players sharing a cell on Turn 5 or Turn 6 do not become Lovers.
    - Verify that if no opposing players share a cell on Turn 7, the trigger rolls over and forms the `Enamorados` team on Turn 9 when two opposing non-Twin players first share a cell.
    - Verify that after Turn 20 (`resolvedTurn = 21`), `resolveLoversFormation` never forms Lovers even if `loversTriggerTurn` was not triggered earlier.
  - **Test 3 — Eligibility Exclusions (`Gemelos` & Same-Team Pairs)**:
    - Verify that a character with `secretTeamId === "Gemelos"` sharing a cell with any other player never triggers `Enamorados`.
    - Verify that two players with the same `teamId` sharing a cell never trigger `Enamorados`.
    - Verify that once `match.loverPlayerIds` is populated, a second pair of players cannot form a second Lovers team on later turns.
  - **Test 4 — Same-Turn Cooperative Action Unlock (`Enamoramiento` Order of Events)**:
    - Verify that when Player A and Player B become Lovers at the start of Turn `t`, Player A's planned `give` or `use_bandage` action targeting Player B on Turn `t` succeeds because `Enamoramiento` runs before action execution and adds both players to `confirmedTeammates`.
  - **Test 5 — Detective Cover Team Preservation**:
    - Verify `buyShopItemRpc` with `shop_id: "detective"` against a Lover (`secretTeamId: "Enamorados"`, `teamId: "Equipo Azul"`) reveals `"Equipo Azul"`, stores `"Equipo Azul"` in `actor.revealedTeamIdsByPlayerId`, and grants 10 pending Zarkans based on cover-team comparison.
  - **Test 6 — Shared Partner Visibility & Redaction in `tailorMatchForPlayer`**:
    - Verify `tailorMatchForPlayer` strips `loversTriggerTurn`, `loversFormedTurn`, and `loverPlayerIds` for normal viewers.
    - Verify a living Lover receives their partner's character state and any enemy character or discovered item inside their partner's view range, even when outside the viewer's own view range.
  - **Test 7 — Lover Death Event & `Enamorados` Victory**:
    - Verify that when a Lover dies, the `status_dead` replay event contains `metadata: { teamId: "Enamorados", wasLover: true }` and `getEliminatedTeamsByPlayerId` maps the dead Lover to `"Enamorados"`.
    - Verify that when the last surviving character(s) belong to `secretTeamId === "Enamorados"`, `finalizeMatchIfEnded` concludes the match and includes both Lovers (living and deceased) in `winnerIds`.
- Add or extend client tests in `client/test/` (following `client/scripts/test-all.mjs` conventions):
  - Verify `formatCharacterTurnLog` and `CharacterPanelLogView` formatting of `lovers_formed`, `lovers_announced`, and `status_dead` (`wasLover: true`) in English and Spanish.
  - Verify `THEME.colors` in `client/src/ui/ColorPalette.ts` defines `loversAccent`, `loversText`, `loversBackground`, and `loversBorder`.
- Explicit non-goals:
  - Do not introduce new gameplay rules beyond those specified in Tasks 1–6.

## Acceptance

- All 7 server test scenarios in `server/modules/test/lovers-team.test.ts` pass deterministically.
- Client unit tests for Lovers log formatting and `THEME.colors` tokens pass.
- Full repository build, lint, and test suites pass in both `server/modules/` and `client/`.

## Validation

- Run new server test suite: `cd server/modules && npx tsx --test test/lovers-team.test.ts`
- Run full server test suite & build: `cd server/modules && npm test && npm run build`
- Run full client test suite, lint, & build: `cd client && npm test && npm run lint && npm run build`
