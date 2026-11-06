# Match Cleanup Task 3: Unified Match Finalization and Ranked 3-AFK Forfeit, Bot Control, and Sole Human Settlement

## Goal

Consolidate match finalization and `match_ended` signaling in `checkEndGame.ts`, forfeit ranked players who accumulate 3 consecutive AFK turns by switching their character to AI bot control (`forfeited_players`), and immediately finalize the match with full placement and Elo settlement if only one active human player remains.

## Dependencies

Task 1, Task 2.

## Scope

- Refactor `server/modules/src/match/checkEndGame.ts` and `server/modules/src/match/matchReport.ts` to eliminate duplicate termination code:
  - Extract `finalizeMatchWithOutcome(match: MatchRecord, outcome: EndGameOutcome, nk: nkruntime.Nakama, logger: nkruntime.Logger, currentTurnEvents?: ReplayEvent[], resolvedTurn?: number): EndGameOutcome` in `checkEndGame.ts` so `finalizeMatchIfEnded`, Ranked AFK forfeit (Task 3), and Inactivity timeout (Task 4) all share one single implementation for placements, Elo settlement, `match.removed = 1`, `match.started = false`, `MatchReport` persistence, and player account stats.
  - Extract a shared `emitMatchEndedSignal(nkWrapper: NakamaWrapper, match: MatchRecord, outcome?: EndGameOutcome): void` helper in `checkEndGame.ts` and replace the duplicated 40-line `match_ended` signal blocks in `server/modules/src/match/async_turn/loop.ts` and `server/modules/src/rpc/updateReadyState.ts`.
  - Update `buildMatchReport` in `server/modules/src/match/matchReport.ts` to accept an optional `winnerCharacterIdOverride?: string` (from `outcome.winnerId`). When `reason === "last_alive"` and `winnerCharacterIdOverride` is provided, resolve `winningTeamId` from that winner's team even if bot or forfeited characters still have `health > 0`.
- Update `server/modules/src/match/botAI.ts` and `server/modules/src/match/async_turn/loop.ts` to respect forfeited players:
  - In `botAI.ts` (`processBotActions`): replace `if (!isBotId(playerId))` with `if (!isBotControlled(match, playerId))` so forfeited human characters are controlled by `botAI` (with deterministic personality fallback `BotPersonality.Random`) while keeping their original `userId` in `match.players`, `match.playerCharacters`, and `ranked.eloSnapshots`.
  - In `async_turn/loop.ts` (`areOnlyBotsAlive`): replace `if (!isBotId(playerId))` with `if (!isBotControlled(match, playerId))` so matches where all remaining living humans have forfeited advance on the 5-second bot timer.
- Extend `server/modules/src/match/rankedPlacements.ts`:
  - Add `recordRankedTeamForfeit(match: MatchRecord, forfeitedPlayerId: string, resolvedTurn: number): void`: if all members of the player's team are dead or forfeited (`isCharacterDead(char) || isPlayerForfeited(match, memberId)`), record the team as eliminated at `resolvedTurn` with the next available bottom placement.
  - Add `finalizeRankedPlacementsForSoleHumanWinner(match: MatchRecord, winnerPlayerId: string, resolvedTurn: number): void`:
    - Assigns `place: 1, eliminated: false` to the sole remaining active human's team.
    - Assigns sequential placements (`2..K`) to any still-living bot/forfeited teams that were not yet eliminated, ordered ahead of previously eliminated/forfeited teams so `calculateRankedEloDeltas` has a complete `placementByTeam` entry for every team in the match.
- Create `server/modules/src/match/rankedAfkForfeit.ts`:
  - Implement `checkAndProcessRankedAfkForfeits(match: MatchRecord, nk: nkruntime.Nakama, logger: nkruntime.Logger, currentTurnEvents: ReplayEvent[], resolvedTurn: number): { forfeitedPlayerIds: string[]; matchEnded: boolean; outcome?: EndGameOutcome }`:
    - Check only started, non-removed ranked matches (`Boolean(match.metadata?.[RANKED_MATCH_METADATA_KEY])`).
    - Scan `match.players` for active human players with `getConsecutiveAfkTurns(match, playerId) >= 3`:
      - Mark `match.forfeited_players = { ...(match.forfeited_players ?? {}), [playerId]: true }`.
      - Call `recordRankedTeamForfeit(match, playerId, resolvedTurn)`.
    - If at least one forfeit occurred (or after turn resolution in a ranked match with forfeits), count remaining active human players who are still alive (`isActiveHumanPlayer(match, pId) && !isCharacterDead(match.playerCharacters?.[pId])`):
      - **Multiple active humans remaining (`>= 2`)**: match continues normally; forfeited characters are controlled by `botAI` on subsequent turns.
      - **Single active human remaining (`=== 1`)**:
        - Call `finalizeRankedPlacementsForSoleHumanWinner(match, soleHumanId, resolvedTurn)`.
        - Invoke `finalizeMatchWithOutcome(match, { ended: true, reason: "last_alive", winnerId: soleHumanId, aliveCharacterIds: [soleHumanId] }, nk, logger, currentTurnEvents, resolvedTurn)`.
        - This enqueues ranked Elo settlement (`enqueueRankedMatchSettlement`) where the sole remaining human gains Elo and forfeited/eliminated players lose Elo, marks `match.removed = 1`, `match.started = false`, and writes the `MatchReport`.
- Wire into turn resolution:
  - In `server/modules/src/match/turnResolution.ts`:
    - After `advanceTurn(match, resolvedTurn, logger, nk)`, if the match has not already ended (`!match.removed`), call `checkAndProcessRankedAfkForfeits(match, nk, logger, events, resolvedTurn)`.
- Explicit non-goals:
  - Do not apply the 3-AFK forfeit rule to unranked or tutorial matches (they follow the 14-day inactivity timeout rule in Task 4 and Task 5).
  - Do not mutate `match.players` or rename keys in `match.playerCharacters` when converting a forfeited player to bot control.

## Acceptance

- In a ranked match, reaching 3 consecutive AFK turns marks `match.forfeited_players[playerId] = true` and delegates future turns for that character to `botAI` without removing `playerId` from `match.players` or `ranked.eloSnapshots`.
- When 2 or more active human players remain alive after a forfeit, the match continues with the substituted bot controller.
- When only 1 active human player remains alive after a forfeit (even if bot characters or the forfeited player's character still have `health > 0`), the match terminates immediately via `finalizeMatchWithOutcome`, assigns complete ranked placements for all teams, awards 1st place and `winning_team_id` to the surviving human, and enqueues Elo settlement (winner gain, forfeited/eliminated players loss).
- `loop.ts` and `updateReadyState.ts` use the shared `emitMatchEndedSignal` helper without duplicated signal code.
- Unranked games and tutorial matches are untouched by this rule.

## Validation

- Add unit and flow tests in `server/modules/test/ranked-afk-forfeit.test.ts` covering:
  - Player marked forfeited at 3 consecutive AFK turns and controlled by `botAI` on subsequent turns while retaining their `userId` in `match.players`.
  - Multi-human match continues after 1 player is forfeited to bot control.
  - Single remaining human triggers immediate 1st place win, valid `MatchReport` (`winning_team_id` set to the human's team even when bots are still alive), and complete Elo settlement (`calculateRankedEloDeltas` returns non-null deltas with positive delta for winner and negative delta for forfeited leaver).
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
