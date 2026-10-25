# Stale Match Cleanup Plan

## Goal

Keep **Find Matches** and **My Matches** free of abandoned records without deleting useful finished-match reports or penalizing players for ordinary disconnects. This is a design plan only; no code changes are included.

## Current behavior and relevant implementation

- Match lifecycle and async turn processing live under `server/modules/src/match/async_turn/`; `loop.ts`, `leave.ts`, and `terminate.ts` are the primary lifecycle points to inspect during implementation.
- Match records are read/written through `server/modules/src/services/storageService.ts`. `listMatchCards.ts` and `listMyMatches.ts` are likely list-surface integration points; verify their exact filtering and storage queries before coding.
- Match records have `started` and `removed` state and turn state, but a dedicated durable `last_human_action_at` / `last_roster_activity_at` timestamp is not established by the inspected code. Do not use Nakama presence or match-loop ticks as a substitute for durable activity in this asynchronous game.
- Auto-generated AFK/random actions must not count as human activity for the running-match inactivity rule.
- Nakama documentation says authoritative matches do not automatically expire just because players are disconnected. Its `max_empty_sec` setting concerns consecutive time with no presences; it does not implement the requested two-week durable inactivity policy. Returning `nil` from an authoritative match loop ends the match, but this project also needs a persisted terminal status/report and list cleanup.

## Policy proposal

Use a server-side scheduled cleanup worker (or equivalent periodic Nakama job) over persisted match records. Make thresholds configurable in one place, defaulting to **14 days**. Run more often than the threshold (e.g. daily), and make every transition idempotent and race-safe against joins, turns, and manual removal.

### A. Started matches with no human gameplay

- Candidate: started, non-terminal match with at least one human participant, including tutorial matches.
- Activity clock: timestamp of the latest successfully accepted human gameplay action/turn submission (including a human-submitted pass or explicitly committed no-op, if the game permits it). Do not count AFK-generated/random actions, bot actions, background turn advancement, reconnects, reads, or UI opens.
- At 14 days without qualifying human action: end as **draw** with terminal reason `inactivity_timeout` (or `cancelled` if product adopts a distinct cancelled state; inspect existing state/report contracts first). Draw is the safer compatibility choice because a new cancelled status may require broad client/report/schema changes. Explicitly label the reason in report and both players' match cards.
- Apply the same inactivity clock and terminal outcome to tutorials. Tutorial bot actions do not count as human activity; a tutorial with no human gameplay action for 14 days ends as an inactivity draw. Ensure this does not mark the player's tutorial as completed.
- Decide policy for one-human/solo matches separately: recommend same terminal draw/abandonment status, no competitive winner inferred from absent opponents.

### B. Not-started lobbies with no roster activity

- Candidate: not started lobby, including tutorial lobbies.
- Activity clock: creation time initially; reset only on successful human join or leave that changes roster. Repeated list/read/presence refreshes do not reset it.
- At 14 days without roster activity: remove/close the lobby and exclude it from both match lists. Preserve an audit reason/timestamp if supported, but no match report is required.
- If creator leaves and an empty lobby remains, consider immediate removal; otherwise the 14-day rule applies. Make join-versus-expiry atomic so a join at the deadline cannot be lost.

### C. Ranked matches: 3-AFK-turn kick, bot replacement, and single remaining human win

- Candidate: started ranked matches with human participants.
- Inactivity tracking: track consecutive AFK turns per player (e.g. `consecutive_afk_turns: Record<string, number>`). Any valid human action submission resets the player's counter to 0. Auto-skipping or failing to submit an action before turn advance increments the counter by 1.
- Kick and bot swap: when a player reaches 3 consecutive AFK turns, they are kicked/forfeited from the match and replaced by an AI bot controller so the game world remains coherent.
- Single remaining human resolution:
  - If kicking/replacing the inactive player leaves exactly one human player remaining in the match, immediately finish the match and declare that sole remaining human player the winner (1st place).
  - Settle Elo adjustments immediately: Elo increase for the winner, Elo decrease for leavers and losers according to the ranked settlement logic (`calculateRankedEloDeltas`).
- Multiple humans remaining: if two or more human players remain after a player is kicked and swapped to bot control, the match continues normally with the bot taking turns until the game reaches its standard completion.

### D. Additional stale cases to cover

1. **Started but no turn ever submitted:** use start timestamp as activity baseline; close after 14 days.
2. **Started with turns only from AFK automation:** AFK turns do not refresh the human activity clock; close after 14 days.
3. **All humans leave/disconnect:** disconnect alone is not definitive in a resumable async game. Apply the same 14-day human-action timeout; optionally use a separate shorter timeout only for explicitly ephemeral empty real-time sessions.
4. **Lobby with players who remain present but do nothing:** presence/read traffic does not reset roster activity. Expire after 14 days.
5. **Finished matches:** never classify as stale active matches. Keep reports/history under existing retention policy; cleanup of old finished records is a separate product/data-retention decision.
6. **Tutorial matches:** include in the same 14-day cleanup. Tutorial bot/automation actions do not refresh the human-action clock, and cleanup must not mark the tutorial profile as completed. Apply lobby roster inactivity rules to unstarted tutorial matches.
7. **Ranked matches:** governed by the 3-AFK-turn kick and bot-swap rule instead of silent draws. When a player accumulates 3 consecutive AFK turns, they are kicked and replaced by an AI bot. If only one human player remains, the game finishes immediately and the remaining player is declared the winner with appropriate Elo gain for the winner and Elo penalty for losers/leavers.
8. **Corrupt, orphaned, or legacy records missing timestamps:** use safe fallback (`created_at`, then start time/known turn history) and log/quarantine records that cannot be classified. Never silently delete records solely because a new timestamp field is absent.
9. **Concurrent expiry and user action:** re-read/version-check immediately before transition; only transition if still eligible and timestamp unchanged/older than cutoff. A successful human action or roster change must win the race.
10. **Duplicate cleanup execution/restart:** idempotent terminal transition, stable reason, and no duplicate report/rewards/notifications.
11. **Long service outage:** compare persisted wall-clock UTC timestamps on next worker run; do not attempt to replay missed intervals.
12. **List visibility lag:** ensure expired lobbies are filtered from public cards immediately after persisted removal; ended matches remain in My Matches as finished with a clear result/reason.

## Data and lifecycle design

- Add durable UTC epoch timestamps to match records, e.g. `created_at`, `started_at`, `last_human_action_at`, and `last_roster_activity_at`. Initialize/backfill safely for legacy records.
- Track consecutive AFK turns per player (e.g. `consecutive_afk_turns: Record<string, number>`), initialized to 0, incremented on auto-advance AFK assignment, and reset to 0 upon human turn submission.
- Update `last_human_action_at` only at the authoritative acceptance point for a human's turn/action. Keep actor origin explicit so AFK fallback and bots cannot accidentally refresh it.
- Update roster activity only after successful join/leave mutation, not on attempted or duplicate operations.
- Ranked AFK enforcement: after turn resolution in ranked matches, kick any player reaching 3 consecutive AFK turns and substitute a bot. Check remaining human count; if 1, invoke end-game immediately with the remaining human as 1st place and process Elo settlement (winner increases, losers/leavers decrease).
- Store terminal outcome/reason in the existing match status/report representation. Prefer reuse of current draw/end-game machinery over a novel status until client contracts are audited.
- Keep separate clocks for gameplay inactivity and lobby roster inactivity; do not overload a generic `updated_at` changed by chat, persistence, or read operations.
- Define UTC clock source, boundary (`now >= last_activity + 14 days`), and tolerance/monitoring behavior.

## Implementation sequence

1. Audit lifecycle/status/report/list contracts and ranked behavior; confirm whether `draw` already exists end-to-end and whether removed records are recoverable.
2. Add timestamp/origin fields and per-player consecutive AFK turn counters with backward-compatible initialization and update points for create/start/join/leave/human submission/auto-advance.
3. Implement ranked 3-AFK-turn kick logic: replace kicked player with bot, check remaining human count, trigger immediate match completion + Elo settlement (winner gain, leavers/losers drop) if only 1 human remains.
4. Implement a bounded, paginated cleanup scan with configurable thresholds, metrics, and dry-run mode.
5. Implement conditional transitions: lobby removal; active-match inactivity draw using existing end-game/report path. Ensure notifications are sent once.
6. Filter expired lobbies from public and personal match lists; show an inactivity result/reason for ended matches.
7. Add tests for threshold boundary, AFK exclusion, ranked 3-AFK kick/bot-swap/win conditions, Elo settlement on forfeit, legacy data, races/idempotency, and list/report behavior.
8. Roll out first in dry-run mode and inspect candidate counts/reasons; then enable enforcement and monitor.

## Acceptance criteria

- A started ordinary match with no qualifying human-submitted action for 14 days is terminalized exactly once as an inactivity draw (unless a separately approved cancellation status is implemented); AFK/random and bot turns do not reset the clock.
- In ranked matches, a player who accumulates 3 consecutive AFK turns is kicked and swapped with an AI bot.
- If a ranked kick leaves only one human player remaining, the match immediately terminates, declaring that player the winner, and processes Elo settlement (winner increases, leavers/losers decrease). If 2+ humans remain, the match continues with the bot.
- A lobby not started with no successful join/leave roster activity for 14 days is removed and no longer discoverable.
- Human action or roster activity racing the worker prevents erroneous expiry.
- Finished reports remain available; ranked and tutorial rules are explicit and tested. Stale tutorials end without granting tutorial completion.
- Legacy records are handled without mass deletion, cleanup is observable, and repeated worker runs are safe.

## Research: similar problem and Nakama behavior

- Nakama's authoritative multiplayer docs state match handlers can keep running without connected players; disconnection/presence is not equivalent to durable async inactivity. The requested 14-day policy therefore belongs in application-owned persisted state and a scheduled cleanup process.
- Nakama's `match.max_empty_sec` can terminate an authoritative match after a configured interval with no presences, but it is not appropriate as the sole rule here: an async match can have no connected players while still being valid, and it does not encode whether a human action occurred or persist this game's draw/report semantics.
- Nakama docs also describe ending an authoritative match by returning `nil` from the loop. Treat that as runtime lifecycle mechanics, not the complete business transition; persist the final game result first.
- Turn-based game platforms commonly use explicit deadlines and defined timeout consequences. Keep match inactivity distinct from an ordinary disconnect and make the outcome visible. For this game, a published long inactivity draw is a defensible cleanup policy; ranked games need their own competitive rule.

## Sources

- Heroic Labs, Authoritative Multiplayer: https://heroiclabs.com/docs/gameplay-multiplayer-server-multiplayer/
- Heroic Labs, Lobby guide: https://heroiclabs.com/docs/nakama/guides/concepts/lobby/
- Heroic Labs, Nakama configuration (`match.max_empty_sec`): https://heroiclabs.com/docs/nakama/getting-started/configuration/
- Heroic Labs, Match Handler API: https://heroiclabs.com/docs/nakama/server-framework/go-runtime/function-reference/match-handler/
- Apple GameKit, turn-based participant quit/timeout API: https://developer.apple.com/documentation/gamekit/gkturnbasedmatch/participantquitinturn%28with%3Anextparticipants%3Aturntimeout%3Amatch%3Acompletionhandler%3A%29
- Chess.com Help Center, game abandonment: https://support.chess.com/en/articles/8593801-how-does-game-abandonment-work

## Open decisions

- Is 14 days appropriate for all unranked matches and tutorials, including matches with a single human and long correspondence-style play?
- Should the user-facing terminal state be `draw` with reason, or should the project add a distinct `cancelled` status throughout shared/client/report contracts?
- Resolved: Ranked matches kick players at 3 consecutive AFK turns, replacing them with a bot; if only 1 human remains, the game ends immediately with that player winning and standard Elo settlement (winner +, losers/leavers -).
- Should empty lobbies be removed immediately when their final member leaves, or only after the inactivity window?
- Is finished-match retention unlimited, bounded, or governed by separate account/data-retention rules?
