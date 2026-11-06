# Match Cleanup Task 2: Instrument Roster and Human Gameplay Activity Clocks and Deduplicate AFK Turn Tracking

## Goal

Maintain durable UTC epoch timestamps for lobby roster mutations, match start, and accepted human gameplay actions, and track per-player consecutive AFK turns in a single authoritative turn-resolution point without duplicate `assignAfkActions` calls.

## Dependencies

Task 1.

## Scope

- Extend `server/modules/src/utils/activityClock.ts` with mutation helpers:
  - `recordRosterActivity(match: MatchRecord, nowSeconds?: number): void`: sets `match.last_roster_activity_at = nowSeconds ?? Math.floor(Date.now() / 1000)`.
  - `recordHumanGameplayActivity(match: MatchRecord, playerId: string, nowSeconds?: number): void`:
    - Checks that `isActiveHumanPlayer(match, playerId)` is true (ignores bots and forfeited players).
    - Sets `match.last_human_action_at = nowSeconds ?? Math.floor(Date.now() / 1000)`.
    - Initializes `match.consecutive_afk_turns = match.consecutive_afk_turns ?? {}` and resets `match.consecutive_afk_turns[playerId] = 0`.
  - `incrementAutoAdvanceAfkCounters(match: MatchRecord): string[]`:
    - Iterates `match.players` for active human players (`isActiveHumanPlayer(match, playerId)`).
    - Skips dead or incapacitated characters (`isCharacterDead(char) || isCharacterIncapacitated(char)`).
    - A human player is considered AFK on an auto-advanced turn if `match.readyStates?.[playerId] !== true` and their character has no human-planned action (`!char?.actionPlan?.main?.actionId && !char?.actionPlan?.secondary?.actionId && !char?.actionPlan?.extraSecondary?.actionId`).
    - For each AFK human player, increments `match.consecutive_afk_turns[playerId] = (match.consecutive_afk_turns[playerId] ?? 0) + 1`; for active human players who marked ready or planned an action, resets `match.consecutive_afk_turns[playerId] = 0`.
    - Returns the list of `playerId`s whose AFK counter was incremented.
- Instrument match creation, lobby mutations, and match start:
  - `server/modules/src/rpc/createMatch.ts` and `server/modules/src/rpc/createTutorialMatch.ts`: initialize `last_roster_activity_at: Math.floor(Date.now() / 1000)`.
  - `server/modules/src/services/rankedMatchFactory.ts`: initialize `last_roster_activity_at` and `last_human_action_at` to `Math.floor(nowMs / 1000)`.
  - `server/modules/src/match/startMatchRecord.ts`: initialize `match.last_human_action_at = match.started_at` when starting a match, and ensure lazy first-turn initialization in `server/modules/src/match/async_turn/loop.ts` also sets `match.last_human_action_at = match.started_at` if absent.
  - `server/modules/src/rpc/joinMatch.ts`: on successful roster addition of a human participant, invoke `recordRosterActivity(match)`. Duplicate or rejected joins must not update the clock.
  - `server/modules/src/rpc/leaveMatch.ts`: on successful roster removal (`wasInMatch && !empty`), invoke `recordRosterActivity(match)`.
- Instrument human gameplay actions:
  - Call `recordHumanGameplayActivity(match, ctx.userId)` upon authoritative acceptance in:
    - `server/modules/src/rpc/updateMainAction.ts`
    - `server/modules/src/rpc/updateSecondaryAction.ts`
    - `server/modules/src/rpc/updateDexterity3Selection.ts`
    - `server/modules/src/rpc/updateReadyState.ts` (when setting `requestedReady === true`)
    - `server/modules/src/rpc/upgradeSkill.ts`
    - `server/modules/src/rpc/buyShopItem.ts`
    - `server/modules/src/rpc/donateZarkans.ts`
    - `server/modules/src/rpc/updateTestament.ts`
  - Explicitly exclude bot actions (`isBotControlled(match, userId)`), tutorial bot chatter, read queries (`getState`, `listMyMatches`), presence pings, and background turn advancement from updating `last_human_action_at`.
- Deduplicate `assignAfkActions` and track consecutive AFK turns in `resolveTurnForMatch`:
  - In `server/modules/src/match/async_turn/loop.ts`:
    - Remove the redundant pre-call to `assignAfkActions(match)` before `resolveTurnForMatch` (keep `assignAfkSkillPoints(match)` or move it into `resolveTurnForMatch` when `options?.isAutoAdvance === true`) so `assignAfkActions` does not overwrite empty `actionPlan`s before `resolveTurnForMatch` inspects them.
  - In `server/modules/src/match/turnResolution.ts`:
    - Add `options?: { isAutoAdvance?: boolean }` to `resolveTurnForMatch(match, logger, nk, options)`.
    - When `options?.isAutoAdvance === true`, call `incrementAutoAdvanceAfkCounters(match)` and `assignAfkSkillPoints(match)` **before** calling `assignAfkActions(match)` and **before** `match.readyStates` is reset.
- Explicit non-goals:
  - Do not instrument legacy unused `submitTurn.ts`.
  - Do not forfeit ranked players or swap them to bot control yet (deferred to Task 3).
  - Do not terminate matches or expire lobbies in this task (deferred to Task 4 and Task 5).

## Acceptance

- Creating a match, or a player joining or leaving, updates `last_roster_activity_at`. Failed joins or unmutated leave attempts do not update it.
- Starting a match sets `last_human_action_at` to `started_at`.
- Submitting any valid human gameplay action sets `last_human_action_at` to the current UTC epoch seconds and resets `consecutive_afk_turns[playerId]` to 0.
- When a turn auto-advances (`isAutoAdvance: true`), `incrementAutoAdvanceAfkCounters` runs before `assignAfkActions` and increments `consecutive_afk_turns` by 1 for any living, non-incapacitated human player who neither readied nor planned an action.
- Automated bot actions, AFK action generation, read RPCs, and reconnects never refresh `last_human_action_at`.

## Validation

- Add unit tests in `server/modules/test/activity-clock.test.ts` verifying:
  - Timestamp initialization on match creation and match start.
  - Roster timestamp updates on join and leave.
  - Human action submission resets AFK turn counter and updates `last_human_action_at`.
  - Auto-advance (`resolveTurnForMatch(..., { isAutoAdvance: true })`) increments AFK turn counter before `assignAfkActions` populates fallback plans.
  - Native bots and forfeited players do not update `last_human_action_at`.
- Run tests and compile:
  ```powershell
  cd server/modules
  npm test
  npm run build
  ```
