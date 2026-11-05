# Match Cleanup Task 3: Implement Ranked 3-AFK Forfeit, Bot Swap, and Sole Human Settlement

## Goal

Forfeit ranked players who accumulate 3 consecutive AFK turns by replacing them with an AI bot controller, and immediately finalize the match with standard Elo settlement if only one human player remains.

## Dependencies

Task 1, Task 2.

## Scope

- Create `server/modules/src/match/rankedAfkForfeit.ts`:
  - Implement `checkAndProcessRankedAfkForfeits(match: MatchRecord, nk: nkruntime.Nakama, logger: nkruntime.Logger, nowMs?: number): RankedAfkForfeitResult`.
  - Check only matches containing ranked metadata (`match.metadata?.[RANKED_MATCH_METADATA_KEY]`).
  - Scan participants for `consecutive_afk_turns[playerId] >= 3`:
    - Kick/forfeit the player from human control. Replace their active controller with an AI bot so character placement, stats, and map state remain coherent.
    - Mark the forfeited player as eliminated/forfeited in ranked placements data.
  - Evaluate remaining human participants:
    - Count remaining non-forfeited human participants who are still alive.
    - **Multiple humans remaining (>= 2)**:
      - The match continues normally. Future turns for the kicked player are executed by `botAI`.
    - **Single human remaining (== 1)**:
      - Terminate the match immediately.
      - Declare the sole remaining human player the winner (1st place).
      - Set final team placements: remaining human's team at place 1; all forfeited/eliminated players placed below according to elimination/forfeit order.
      - Invoke ranked Elo settlement via `enqueueRankedMatchSettlement(match, outcome, nk, logger, nowMs)`:
        - Winner receives Elo gain.
        - Forfeited leavers and eliminated players receive Elo loss.
      - Mark the match as ended: `match.removed = 1`, `match.started = false`.
      - Build and store the terminal `MatchReport`.
- Wire into turn resolution:
  - In `server/modules/src/match/turnResolution.ts` and `server/modules/src/match/async_turn/loop.ts`:
    - Call `checkAndProcessRankedAfkForfeits` immediately after auto-advance AFK increments in ranked matches.
- Explicit non-goals:
  - Do not apply the 3-AFK kick rule to unranked or tutorial matches (they follow the 14-day inactivity timeout rule in Task 4 and Task 5).
  - Do not modify matchmaking queues or placement calculation formulas outside the forfeit settlement flow.

## Acceptance

- In a ranked match, reaching 3 consecutive AFK turns forfeits the player and replaces them with an AI bot controller.
- When 2 or more human players remain after a forfeit, the match continues playing with the substituted bot.
- When only 1 human player remains after a forfeit, the match terminates immediately, awards 1st place to the surviving human, processes Elo settlement (winner gain, leavers/losers drop), and writes the final match report.
- Unranked games and tutorial matches are untouched by this rule.

## Validation

- Add unit and flow tests in `server/modules/test/ranked-afk-forfeit.test.ts` covering:
  - Player kicked at exactly 3 consecutive AFK turns and replaced with bot.
  - Multi-human match continues after 1 player is swapped to bot.
  - Single remaining human triggers immediate 1st place win and Elo settlement enqueue.
  - Forfeited player receives Elo delta penalty.
- Run tests:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
