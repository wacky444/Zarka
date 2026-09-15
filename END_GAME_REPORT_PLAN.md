# End-game report plan

## Goal

Replace the current end-of-match flow with a durable post-match report:

1. The match reaches an end condition.
2. The game view plays a short celebration/transition animation with confetti and a camera zoom.
3. The client opens a new `EndGameReportScene` instead of immediately returning to the menu.
4. The report shows the final team leaderboard, winning characters, player statistics, and achievements.
5. The report remains available from **My Matches** for every participant.

## Current behavior and constraints

- `GameScene` currently receives `OPCODE_MATCH_ENDED` and does not show a durable report.
- `finalizeMatchIfEnded()` marks the match as removed and updates player account-level win/loss statistics.
- `list_my_matches` currently excludes records with `removed !== 0`, so completed matches disappear.
- Match state, turns, replay turns, and chat are stored separately by stable logical `match_id`.
- Raw server replay events record applied `damageDealt` and per-target `damageTaken` for the direct combat actions that use those fields, and record `eliminated` for targets killed by those actions. Other death sources and non-combat events require separate handling. The current resolving turn must be included directly because it is persisted after end-game finalization.
- The client already has skin rendering and player-name resolution that can be reused by the report scene.

## Proposed data model

Create an immutable, server-generated `MatchReport` associated with the stable logical match ID. Store it in a dedicated Nakama storage collection rather than relying on the removed match record.

A separate report has these advantages:

- It survives match removal and runtime-match restarts.
- It clearly distinguishes completed matches from manually abandoned matches.
- It avoids exposing the full historical match state through the match-list response.
- It allows report-specific schema evolution later.
- Reports are retained in storage, while the client receives only the 10 most recent finished matches.

Suggested shared types:

```ts
interface MatchReport {
  match_id: string;
  created_at: number;
  ended_at: number;
  turns: number;
  reason: "last_alive" | "all_dead";
  winning_team_id?: string;
  winning_character_ids: string[];
  teams: MatchReportTeam[];
  players: MatchReportPlayer[];
  achievements: MatchAchievement[];
}

interface MatchReportTeam {
  team_id: string;
  rank: number;
  won: boolean;
  player_ids: string[];
  total_damage_dealt: number;
  total_damage_received: number;
  kills: number;
}

interface MatchReportPlayer {
  player_id: string;
  character_id: string;
  character_name: string;
  team_id?: string;
  skin?: Skin;
  alive: boolean;
  damage_dealt: number;
  damage_received: number;
  players_killed: number;
  actions_used: number;
  items_collected: number;
  items_carried: number;
  average_weight_carried: number;
}

interface MatchAchievement {
  id: string;
  player_id?: string;
  team_id?: string;
  value?: number;
}
```

Names and skins should be copied into the report when it is finalized. A report must not depend on the current account name or current skin to render historical results.

## Server implementation

### 1. Add report storage support

Add a report collection and `StorageService` methods to:

- write a report once, using the stable `match_id` as the key;
- read a report by match ID;
- optionally list or delete reports only if retention tooling is added later.

Reports are retained in the database without a retention limit for this feature. Listing is bounded separately: `list_my_matches` must return at most the 10 latest finished matches for the client, in addition to the user's active matches.

The write should be idempotent. A repeated end-game callback must not replace an existing report with a partially different result.

### 2. Build the report before removing the match

Extend the end-game finalization path so it:

1. Determines the outcome using the existing authoritative end condition.
2. Reads raw replay events for every turn from server storage.
3. Aggregates combat and activity statistics without using player-tailored replay data.
4. Builds team standings and achievements.
5. Writes the immutable report.
6. Updates account-level statistics.
7. Marks the match removed and stopped.
8. Signals the clients that the report is ready.

The report write should happen before the end signal is broadcast. The client should still retry the report RPC briefly in case Nakama storage propagation is asynchronous.

### 3. Aggregate statistics from authoritative data

Use raw server replay records as the source for combat metrics:

- `damage_dealt`: sum each actor action's `damageDealt`.
- `damage_received`: sum each target's `damageTaken`.
- `players_killed`: count target entries with `eliminated === true`, excluding non-player/self cases according to the game rules.
- `actions_used`: count player replay events, including non-damaging actions.
- `turns`: use the final match turn.
- `average_weight_carried`: calculate the mean carried weight across turns in which the character was alive. Capture the per-turn value from authoritative match state; do not infer it from the final inventory.

Use the final authoritative match state for:

- team membership;
- character names and IDs;
- alive/dead state;
- final winning team;
- final inventory values where appropriate;
- skins and display data.

If an achievement needs historical information that is not currently recorded, add a small server-side counter or replay metadata field rather than guessing from the final state.

### 4. Define initial achievements

Use stable IDs and award achievements only for unique qualifying results. Recommended initial achievements:

- **MVP**: highest damage dealt.
- **Executioner**: most player eliminations.
- **Tank**: highest damage received while surviving at least one attack.
- **Pacifist**: survived while dealing zero damage.
- **Hoarder**: highest mean carried weight across the turns in which the character was alive.
- **Scavenger**: most pickup/search item events.
- **Glutton**: most food or drink consumed.
- **Medic**: most health restored to other players.
- **Runner**: most movement actions.
- **Last Stand**: winner with the lowest remaining health, when applicable.
- **Unlucky**: first player eliminated.

Award an achievement only when exactly one eligible recipient has the qualifying result. If two or more eligible recipients tie, do not award that achievement. This applies to all achievements, including achievements where multiple players could otherwise qualify with the same value.

## RPC and authorization changes

Add a `get_match_report` RPC:

- Input: stable `match_id`.
- Authorization: the requesting user must be a participant in the report.
- Output: the complete `MatchReport`.
- Admin behavior: follow the existing admin-view authorization policy if administrators need report access for matches they did not join.
- Missing report: return a typed not-found/not-ready response rather than an unstructured error.

Update `list_my_matches` to include both active and completed matches the current user participated in. Each entry should include a compact summary, for example:

- `status`: `waiting`, `in_progress`, or `finished`;
- `ended_at` and `turns` for finished matches;
- `duration` for the compact finished-match summary;
- whether the player's team won; do not show a loss label when the player's team did not win;
- `has_report`.

The server stores all finished reports but sends the client only the 10 latest finished matches. Active matches are not counted against that finished-match limit.

Completed reports should remain listed even though the live match is removed. Manually removed or abandoned matches should not be mislabeled as finished unless they have a generated report.

## Client scene and navigation

### 1. Add `EndGameReportScene`

Register a new Phaser scene in `client/src/main.ts`.

The scene should accept the stable `match_id` and optional initial report payload. If no payload is supplied, it calls `get_match_report` and displays a loading state while fetching.

The scene should contain:

- match title, result, and turn count;
- team leaderboard ordered by rank;
- winner indicator and winning team summary;
- a horizontal row of the winning characters' sprites;
- player cards or rows with name, character, team, damage dealt, damage received, kills, and survival status;
- an achievements section with icon/label, recipient, and value where relevant;
- a return-to-menu button;
- mobile scrolling for the complete report;
- desktop layout that uses the available width without changing game controls.

Use existing skin rendering, asset loading, localization, button, and scroll-panel conventions instead of adding a second rendering system.

### 2. Change the game-end transition

Repurpose `VictoryOverlay` as the end-game transition layer. It is not retained as a fallback result overlay. On match end:

1. Stop accepting action and map-selection input.
2. Finish any queued replay animation.
3. Show a short confetti burst and map/camera zoom toward the winning team or final board.
4. Fade or scale into the report scene.
5. Stop `GameScene` and leave the realtime match cleanly.
6. Start `EndGameReportScene` with the stable match ID.

The animation must have a bounded duration and must not be skippable. A report fetch failure must still provide a return-to-menu path.

The current match-end race must remain safe:

- queue the end event behind replay playback;
- do not trigger the transition twice;
- do not let a later `match_removed` event send the user back to the menu during the report transition;
- ignore duplicate end signals after the report scene has started.

### 3. Update My Matches

Extend `MyMatchesListView` rows to show finished matches distinctly. For a finished row:

- replace or supplement `View` with `Report`;
- call `get_match_report` and open `EndGameReportScene`;
- keep the existing leave behavior only for active/waiting matches;
- show a loading/error state without losing the rest of the list.

Because the current list is not scrollable, add or reuse a scroll container if the number of finished matches can exceed the viewport. This should be implemented consistently with existing Rex UI usage.

## Localization and presentation

Add English and Spanish strings for:

- report headings and result labels;
- stat labels;
- achievement names and descriptions;
- loading, not-ready, and error states;
- finished-match status and report button.

Achievement IDs and server data remain language-neutral. The client translates labels at render time.

Avoid emoji as the only visual indicator. They may supplement icons, but text and accessible labels must remain available on desktop and mobile.

## Manual verification

No automated tests will be added for this feature. Verification will be performed manually through the web client on desktop and mobile.

Check the following scenarios:

- Last-alive team produces the correct winning team and characters.
- All-dead match produces a draw with no winning team.
- Damage, damage received, kills, actions, turns, and average carried weight are displayed correctly.
- Tied achievements are omitted.
- A report is created once and remains available after refreshing or reconnecting.
- Only the 10 latest finished matches are sent to the client; active matches remain visible.
- Finished matches show duration and a win indicator only when the player's team won.
- The full report button opens the correct historical report.
- End event waits for replay completion and opens the report exactly once.
- Confetti and zoom transition work on desktop and mobile and cannot be skipped.
- Report remains usable with many players and achievements.
- Winning character sprite row renders all winners and scrolls on narrow screens.
- Finished-match reports load correctly after a server restart.
- Network delay, missing report, stale realtime match, and return-to-menu paths work.
- English and Spanish text fit the desktop and mobile layouts.

Required implementation validation is limited to static checks:

```text
client: npx tsc --noEmit
client: npm run lint
server/modules: npx tsc --noEmit
```

Docker/Nakama integration testing remains a separate manual step when Docker is available.

## Resolved product decisions

1. Finished reports are retained in the database. The client receives only the 10 latest finished matches.
2. An achievement is awarded only when there is exactly one qualifying recipient. Ties receive no achievement.
3. `Hoarder` is the player with the highest mean carried weight across the turns in which they were alive.
4. Every participant can see the exact report statistics for all participants. No report privacy tailoring is required.
5. The end-game transition is never skippable.
6. The existing `VictoryOverlay` is repurposed as the transition layer, not kept as a fallback result overlay.
7. Finished-match rows include a full report button and a compact summary with duration. They show a win indicator when the player's team won, but no loss indicator when it did not.

## Suggested implementation order

1. Approve this plan and settle the open decisions.
2. Add shared report types and server report aggregation logic.
3. Add report storage and `get_match_report` authorization.
4. Generate and persist reports during authoritative finalization.
5. Extend `list_my_matches` with finished summaries.
6. Add the client report scene and localization.
7. Wire My Matches report navigation.
8. Replace the current victory return flow with the bounded transition.
9. Run TypeScript/lint checks and complete the desktop/mobile manual verification checklist.
