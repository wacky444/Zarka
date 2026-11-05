# Match Cleanup Task 2: Instrument Roster and Human Gameplay Activity Clocks

## Goal

Maintain durable UTC epoch timestamps for lobby roster mutations and accepted human gameplay actions, and track per-player consecutive AFK turns across turn advancement.

## Dependencies

Task 1.

## Scope

- Extend `server/modules/src/utils/activityClock.ts` with mutation helpers:
  - `recordRosterActivity(match: MatchRecord, nowSeconds?: number): void`: sets `match.last_roster_activity_at = nowSeconds ?? Math.floor(Date.now() / 1000)`.
  - `recordHumanGameplayActivity(match: MatchRecord, playerId: string, nowSeconds?: number): void`:
    - Checks that `playerId` is not a bot (`!isBotId(playerId)`).
    - Sets `match.last_human_action_at = nowSeconds ?? Math.floor(Date.now() / 1000)`.
    - Resets `match.consecutive_afk_turns[playerId] = 0`.
- Instrument match creation and roster mutations:
  - `server/modules/src/rpc/createMatch.ts` and `server/modules/src/rpc/createTutorialMatch.ts`: initialize `last_roster_activity_at: Math.floor(Date.now() / 1000)`.
  - `server/modules/src/services/rankedMatchFactory.ts`: initialize `last_roster_activity_at: Math.floor(nowMs / 1000)`.
  - `server/modules/src/rpc/joinMatch.ts`: on successful roster addition of a human participant, invoke `recordRosterActivity(match)`. Duplicate or rejected joins must not update the clock.
  - `server/modules/src/rpc/leaveMatch.ts`: on successful roster removal, invoke `recordRosterActivity(match)`.
- Instrument human gameplay actions:
  - Call `recordHumanGameplayActivity(match, ctx.userId)` upon authoritative acceptance in:
    - `server/modules/src/rpc/updateMainAction.ts`
    - `server/modules/src/rpc/updateSecondaryAction.ts`
    - `server/modules/src/rpc/updateReadyState.ts` (when setting `requestedReady === true`)
    - `server/modules/src/rpc/upgradeSkill.ts`
    - `server/modules/src/rpc/buyShopItem.ts`
    - `server/modules/src/rpc/donateZarkans.ts`
    - `server/modules/src/rpc/updateTestament.ts`
    - `server/modules/src/rpc/submitTurn.ts`
  - Explicitly exclude bot actions (`isBotId(userId)`), tutorial bot chatter, read queries (`getState`, `listMyMatches`), presence pings, and background turn advancement from updating `last_human_action_at`.
- Track consecutive AFK turns on auto-advance:
  - In `server/modules/src/match/turnResolution.ts` and `server/modules/src/match/afkActions.ts` (or `server/modules/src/match/async_turn/loop.ts`):
    - Identify human players who did not submit an action or mark ready prior to auto-advance.
    - Increment their entry: `consecutive_afk_turns[playerId] = (consecutive_afk_turns[playerId] ?? 0) + 1`.
    - Ensure players who did submit an action or were marked ready maintain `consecutive_afk_turns[playerId] === 0`.
- Explicit non-goals:
  - Do not kick ranked players or swap them to bots yet (deferred to Task 3).
  - Do not terminate matches or expire lobbies in this task (deferred to Task 4 and Task 5).

## Acceptance

- Creating a match, or a player joining or leaving, updates `last_roster_activity_at`. Failed joins or unmutated leave attempts do not update it.
- Submitting any valid human gameplay action sets `last_human_action_at` to the current UTC epoch seconds and sets `consecutive_afk_turns[playerId]` to 0.
- When a turn auto-advances, any unready human player has their `consecutive_afk_turns` counter incremented by 1.
- Automated bot actions, AFK action generation, read RPCs, and reconnects never refresh `last_human_action_at`.

## Validation

- Add unit tests in `server/modules/test/activity-clock.test.ts` verifying:
  - Timestamp initialization on match creation.
  - Roster timestamp updates on join and leave.
  - Human action submission resets AFK turn counter and updates `last_human_action_at`.
  - Auto-advance increments AFK turn counter for unready human players.
  - Bots do not update `last_human_action_at`.
- Run tests and compile:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
