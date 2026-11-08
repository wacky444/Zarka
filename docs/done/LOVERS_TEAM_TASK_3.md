# Lovers Team Task 3: Implement Start-of-Turn Lovers Formation (Enamoramiento) and Death Metadata

## Goal

Implement the start-of-turn `Enamoramiento` resolution logic (`resolveLoversFormation`) so two co-located, non-Twin players from different teams form the `Enamorados` secret team on or after `loversTriggerTurn` (within Turns 4–20), automatically confirm each other for friendly actions, and emit formation and death replay events.

## Dependencies

Task 1, Task 2. Task 4 will handle Detective cover-team checks and shared partner sight, and Task 6 will format the new replay events in the client UI.

## Scope

- Create `server/modules/src/match/lovers.ts`:
  - Export `ENAMORADOS_TEAM_ID = "Enamorados"`.
  - Export `resolveLoversFormation(match: MatchRecord, resolvedTurn: number, logger?: nkruntime.Logger): ReplayEvent[]`:
    - Return `[]` if `match.loversMode === false` or `Boolean(match.metadata?.[TUTORIAL_MATCH_METADATA_KEY])`.
    - Return `[]` if `resolvedTurn < 4 || resolvedTurn > 20`.
    - Return `[]` if `Array.isArray(match.loverPlayerIds) && match.loverPlayerIds.length === 2` (at most one Lovers pair per match).
    - Return `[]` if `typeof match.loversTriggerTurn !== "number" || resolvedTurn < match.loversTriggerTurn`.
    - Group all living, non-dead characters (`!isCharacterDead(char)` and valid `char.position?.coord`) by tile coordinate (`${coord.q},${coord.r}`).
    - Collect all candidate pairs `[charA, charB]` sharing the same tile coordinate where:
      - Neither character has `secretTeamId === "Gemelos"` or `secretTeamId === "Enamorados"`.
      - Both characters have an assigned team (`charA.teamId` and `charB.teamId`), and their effective teams differ (`(charA.secretTeamId?.trim() || charA.teamId?.trim()) !== (charB.secretTeamId?.trim() || charB.teamId?.trim())`).
    - If no eligible pairs exist on `resolvedTurn`, return `[]` (leaving `match.loverPlayerIds` unset so the check rolls over to subsequent turns up to Turn 20).
    - If one or more eligible pairs exist, select one pair using `Math.floor(Math.random() * eligiblePairs.length)`.
    - Mutate both selected characters (`charA` and `charB`):
      - Preserve `charA.teamId` and `charB.teamId` as their cover teams.
      - Set `charA.secretTeamId = ENAMORADOS_TEAM_ID` and `charB.secretTeamId = ENAMORADOS_TEAM_ID`.
      - Add `charB.id` to `charA.relationships.confirmedTeammates` (if not already present) and `charA.id` to `charB.relationships.confirmedTeammates`, keeping any previously confirmed teammates intact.
      - Set `charA.revealedTeamIdsByPlayerId = { ...(charA.revealedTeamIdsByPlayerId ?? {}), [charB.id]: ENAMORADOS_TEAM_ID }` and symmetrically for `charB`.
    - Update `match`:
      - Set `match.loverPlayerIds = [charA.id, charB.id]` and `match.loversFormedTurn = resolvedTurn`.
      - Append `ENAMORADOS_TEAM_ID` to `match.teams` if not already included.
    - Return three `ReplayPlayerEvent` items:
      1. Private event for `charA`: `actionId: "lovers_formed"`, `importance: ReplayImportance.Critical`, `actorId: charA.id`, `metadata: { teamId: ENAMORADOS_TEAM_ID, coverTeamId: charA.teamId, partnerPlayerId: charB.id }`, `visibility: { scope: "limited", playerIds: [charA.id] }`.
      2. Private event for `charB`: `actionId: "lovers_formed"`, `importance: ReplayImportance.Critical`, `actorId: charB.id`, `metadata: { teamId: ENAMORADOS_TEAM_ID, coverTeamId: charB.teamId, partnerPlayerId: charA.id }`, `visibility: { scope: "limited", playerIds: [charB.id] }`.
      3. Public town announcement event: `actionId: "lovers_announced"`, `importance: ReplayImportance.Critical`, `actorId: ""`, `visibility: { scope: "all" }`.
- Modify `server/modules/src/match/advanceTurn.ts`:
  - Call `replayEvents.push(...resolveLoversFormation(match, resolvedTurn, logger))` at the start of turn resolution before the `for (const action of actions)` loop so `Enamoramiento` executes first in the Order of Events and newly confirmed Lovers can execute friendly actions on the same turn.
- Modify `server/modules/src/match/actions/utils.ts` and `server/modules/src/match/replay/tailorReplay.ts`:
  - In `createDeathReplayEvent` (`server/modules/src/match/actions/utils.ts`), include `wasLover: true` in `metadata` when `character.secretTeamId?.trim() === "Enamorados"` (alongside `teamId: "Enamorados"`).
  - In `tailorReplayEvents` (`server/modules/src/match/replay/tailorReplay.ts`), preserve `wasLover: true` in the tailored `status_dead` event metadata when present, and ensure `lovers_announced` is passed through with `actorId: ""` so the Lovers' identities are never leaked in public replay payloads.
- Explicit non-goals:
  - Do not change `buyShopItem.ts` Detective logic or `matchView.ts` sight sharing in this task (belongs to Task 4).
  - Do not modify client UI or log formatting files in this task (belongs to Task 5 and Task 6).

## Acceptance

- `resolveLoversFormation` runs at the start of `advanceTurn` before any planned player actions execute.
- Co-located players on the same team or belonging to `"Gemelos"` never become Lovers.
- When triggered on `resolvedTurn` (`loversTriggerTurn <= resolvedTurn <= 20`), both Lovers have `secretTeamId === "Enamorados"`, retain their original `teamId`, have each other in `confirmedTeammates` and `revealedTeamIdsByPlayerId`, and can execute teammate-restricted actions (`give`, `feed`, `use_bandage`, `use_medicine`, `protect`, `use_antidote`, `inject_vaccine`) targeting each other on that same turn.
- Only one Lovers pair can form per match.
- When a Lover dies, the emitted `status_dead` event includes `metadata: { teamId: "Enamorados", wasLover: true }`.
- When the only remaining living players have `secretTeamId === "Enamorados"`, `checkEndGame.ts` resolves the winning team as `"Enamorados"` and includes both Lovers in `winnerIds`.

## Validation

- Build server modules: `cd server/modules && npm run build`
- Run server tests: `cd server/modules && npm test`
