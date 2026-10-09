# Matches View Improvement Plan

## Goal

Replace compact text rows in **My Matches** and **Matches** with larger, reusable match cards. Make active matches easier to find and resume, group and sort them predictably, and let each account set a maximum number of concurrent matches.

## Current behavior and Nakama audit

- `client/src/scenes/MyMatchesList.ts` renders each match as one text line with separate View/Report and Leave buttons. Active matches sort newest first. Finished matches are limited to the latest 10 by `server/modules/src/rpc/listMyMatches.ts`.
- The authenticated `list_my_matches` payload includes turn, capacity, roster, status, and match settings. It does not include current-user readiness, alive counts, a next-turn deadline, or an image key.
- `client/src/scenes/MatchesList.ts` calls Nakama `listMatches` with a 50-match limit and parses the public label. `server/modules/src/utils/label.ts` currently publishes only mode, match ID, name, capacity, player count, started state, and creator. It does not publish readiness, turns, alive counts, or time remaining.
- `MatchRecord` already stores `readyStates`, `playerCharacters`, `current_turn`, `roundTime`, `autoSkip`, and start state. Do not send full match records or other players' readiness to public match cards.
- Auto-advance uses the server's local-time `roundTime` and `autoSkip` behavior in `server/modules/src/match/async_turn/loop.ts`; there is no existing `timeLeft` field. Calculate countdowns from the same server scheduling rules, not an independent client guess.
- Account data lives under Nakama `metadata.zarka`. The account API exposes `rankedMatchSlots`, but no maximum-current-matches preference exists. `createMatchRpc` has a separate hard-coded limit of 3 matches created by one user; `joinMatchRpc` checks capacity but has no account-based concurrent-match cap. These rules must be reconciled rather than layered into contradictory limits.
- The server already stores map layout in `MatchRecord.map.tiles` as cell snapshots with coordinates, `localizationType`, and destruction metadata. Current match-list payloads and public labels do not include a map preview. Project only the preview fields from this existing map data; do not fetch full match state per card.

## Proposed card and list behavior

### Reusable card

Add a Phaser UI component under `client/src/ui/`, for example `MatchCard.ts`, and use it from both list views. Card uses this two-row layout. Markdown cannot merge cells, so `spans both rows` marks the visual row spans:

| Map preview | Match info | Time left | Turn |
| --- | --- | --- | --- |
| Hex map image, spans both rows | `R` (ranked) or `UR` (unranked) + match name | Time left as `HH:MM`, spans both rows | Turn/round number (`current_turn`), spans both rows |
| Same map image | Status-specific player count | Same time-left cell | Same turn cell |

- Render map preview from server-provided cell summaries. Paint safe cells green, scheduled-but-not-yet-destroyed cells yellow, and destroyed cells red. Use `localizationType` for subtle terrain/building detail while keeping state colors dominant. Use a placeholder only before map data exists.
- Player count in row 2: lobby/not started = joined players / capacity; running = alive players / total who started; finished = total players only.
- Time-left cell shows hours:minutes (`HH:MM`) until next scheduled resolution; show localized status when no deadline exists and `—` for finished matches. In My Matches, render countdown in red when less than 3 hours remain and the current user has not checked ready (`currentUserReady !== true`). Otherwise use normal text color. Apply readiness color only when the authenticated user's readiness is known; never infer it from public match data.
- Show the green **Play** overlay only on an active match when authenticated match data says the current user has not checked Ready (`currentUserReady === false`). Hide it when Ready is checked, status is finished, or readiness is unknown. In the public Matches list, do not show this user-specific overlay.
- Whole card is one click target. Remove separate View, Report, Leave, and Join buttons. Leave remains available after opening a match.

Use a responsive layout: large readable cards on desktop, single-column cards on narrow screens, with text truncation and touch-sized click targets. Reuse existing palette and localization patterns.

### My Matches

- Show two collapsible groups: **Partidas online** and **Partidas terminadas**. Localize both headings; show online count against the account limit, e.g. `3/10 Partidas online`.
- Sort active matches with the current user's not-ready matches first (`readyStates[userId] !== true`), then by least time remaining. Put matches without a scheduled countdown after timed matches; use a stable tie-breaker such as name and match ID.
- Show the green **Play** visual overlay only on active matches where `currentUserReady === false`. Hide it once the user checks Ready; do not show it for finished matches or when readiness is unknown. If already ready, show a waiting state instead. The whole card remains clickable in either case.
- Clicking a lobby opens its lobby; clicking a running match opens/resumes it; clicking a finished match opens its report. If a finished match has no report, open the report view with a localized unavailable state.
- Remove the separate View, Report, and Leave buttons. Keep Leave available inside the opened lobby or match.
- Keep the existing finished-match limit of 10 initially; pagination is outside this change unless needed to make the card list usable.

### All Matches

- Apply the same reusable card layout to the public Matches view.
- Do not render a separate **Join** button; clicking a joinable lobby card joins and opens its lobby. Clicking a joinable running-match card joins/opens it. If server rules prevent joining, keep the card non-actionable and show the reason; do not infer readiness from public data.
- Sort open/joinable matches ahead of started matches, then by the same authoritative time-remaining value where available. Preserve Nakama list limits or add explicit paging; avoid rendering an unbounded list.
- The existing public list contains active Nakama matches, not global match history. Do not add a public finished-matches feed as part of this task.

## Data, settings, and server rules

### Card summary contract

Create one typed summary shape shared by both views. Include only fields the card needs: stable match ID, name, status, joined-player count, capacity, total started/participating players, alive-player count, rounds played, optional `nextAdvanceAtMs`/time status, and map preview cells shaped like `{ coord: { q, r }, localizationType, destructionState }`. Use `safe`, `scheduled`, and `destroyed` states, derived server-side from each cell's destruction metadata and current turn. Render counts by status: lobby joined/capacity, running alive/started total, finished total only.

- For **My Matches**, include a single `currentUserReady` boolean for the authenticated user. Do not return the entire `readyStates` map. Use this value with the server-provided deadline to apply the under-3-hours red countdown rule.
- For **Matches**, expose only public aggregate data and map preview fields. Never expose player-level readiness, inventory, item IDs, raw cell metadata, or full `playerCharacters` through Nakama labels or a list response.
- Keep list loading batched. Add or extend a paginated public match-card summary RPC that returns the safe cell preview for each match in one response; do not issue one `get_state` call per card or put full cell arrays into Nakama labels.
- Return only cell coordinates, `localizationType`, and normalized destruction state. Do not serialize raw `meta` or `itemIds` into the public preview. Return a placeholder state when no map has been generated.
- Keep summary data current when players join/leave, a match starts, and a turn resolves. Reuse or extract server scheduling logic for the deadline so displayed time matches auto-advance behavior.
- Derive alive, started-roster, and finished-total counts server-side. If current storage cannot reliably recover the roster or total participants, persist the count at the appropriate lifecycle point rather than guessing in the client.

### Maximum current matches preference

- Add an account setting under `metadata.zarka`, exposed through `UserAccount`/`get_user_account` and an authenticated setter RPC. Default missing or invalid values to **10**.
- Add the control to the account settings UI and save it using the existing safe account-metadata update mechanism. Define and enforce a bounded valid range before implementation; the user request specifies the default but not the range.
- Treat this as a cap on active match memberships, not a display-only row limit. Count active matches where the user is a participant and include a user's own waiting match; exclude finished and tutorial matches. Ranked matches count toward this total, while `rankedMatchSlots` remains a separate ranked-only preference.
- Enforce the cap server-side before create, join, and ranked assignment. If a user lowers the cap below their current count, keep existing matches and reject only new memberships until the count falls below the cap.
- Reconcile or replace the current creator-only limit of 3 in `createMatchRpc`; do not let it silently override the new default of 10. Preserve any separate abuse-prevention ceiling only if it is explicitly distinct from the user preference.
- Handle duplicate joins idempotently and prevent concurrent create/join requests from exceeding the cap, using an appropriate per-user reservation/serialization mechanism if needed.

## Implementation tasks

1. [Define match-card summaries and safe map previews](MATCHES_VIEW_IMPROVEMENT_TASK_1.md).
2. [Build reusable card and hex-preview components](MATCHES_VIEW_IMPROVEMENT_TASK_2.md).
3. [Render My Matches cards and groups](MATCHES_VIEW_IMPROVEMENT_TASK_3.md).
4. [Connect My Matches card clicks](MATCHES_VIEW_IMPROVEMENT_TASK_4.md).
5. [Render public Matches cards](MATCHES_VIEW_IMPROVEMENT_TASK_5.md).
6. [Connect public Matches card clicks](MATCHES_VIEW_IMPROVEMENT_TASK_6.md).
7. [Add and enforce maximum-current-matches setting](MATCHES_VIEW_IMPROVEMENT_TASK_7.md).
8. [Run cross-view regression and visual QA](MATCHES_VIEW_IMPROVEMENT_TASK_8.md).

Task 1 unblocks Tasks 2, 3, 5, and 7. Tasks 3 and 5 can proceed in parallel after Task 2. Tasks 4 and 6 follow their respective view tasks. Task 8 depends on Tasks 1–7.

## Acceptance criteria

- Both match views use the same reusable card component; the old one-line rows are removed.
- My Matches has collapsible online and finished groups, a localized online count like `3/10 Partidas online`, readiness-first sorting, and a green Play overlay only when authenticated data confirms `currentUserReady === false`. No overlay when ready, finished, or readiness is unknown.
- All Matches uses whole-card clicks for lobby join/open and permitted running-match entry; no separate per-card action buttons or private readiness data.
- Lobby cards show joined/capacity; running cards show alive/started-total; finished cards show total participants only. Time remaining uses `HH:MM`; My Matches countdown turns red only below 3 hours when the current user is not ready. Counts, turns, and time remaining match authoritative Nakama state and scheduler behavior; map preview uses server cell coordinates, types, and destruction states without per-card state requests.
- Preview colors are green for safe cells, yellow for scheduled destruction, and red for destroyed cells; missing map data uses a placeholder.
- Existing finished reports, leave behavior, match navigation, and list bounds continue to work.
- Account setting persists in Nakama, defaults to 10, survives refresh, and is enforced across manual and ranked match-entry paths. Lowering it never removes existing matches.
- English and Spanish localization remain complete; card and group layout works on desktop and mobile.

## Open decisions to settle before implementation

- What does the `R` marker in the example mean (ranked, round, or another badge)?
- Should player totals include bots? Current My Matches adds configured `botPlayers`; public match labels count current players. Choose one server-defined policy and use it consistently for lobby, running, and finished cards.
- What is the allowed range for `maxCurrentMatches`? Default is 10; current code's creator-only limit is 3.
- What should time-left show when auto-advance is disabled or an advance is already ready? Recommended: localized `Manual` / `Resolving`, not a numeric guess.
- Should cell-type artwork be sprite-based or minimal glyphs? Keep destruction colors clear either way; use a placeholder only before map data exists.
