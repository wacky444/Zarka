# Ranked Random Matchmaking Plan

## Goal

Add an opt-in **Available for random games** setting to Account Settings. Its integer value is the player's target number of concurrent ranked matches that Zarka may assign automatically.

- `0` disables ranked random matchmaking. New accounts default to `0`.
- `1` keeps one ranked match assigned or running.
- `2` keeps two assigned or running; `3` keeps three. Additional tickets may be matched while earlier games are in progress.
- When a ranked match ends, release its slot and enqueue a replacement if the player's setting still requests one.
- Players may be offline while queued or assigned. Match creation, turn timing, resolution, and rating settlement run server-side; no player connection is required.
- Send a Chrome/Android push notification when an assigned ranked match has been durably started.
- Ranked rating changes use the team's final placement.

A ranked lobby targets 16 total participants. In high-population mode it starts with at least 8 humans. In low-population mode it waits for a share of the daily user pool, then adds bots to reach 16.

## Current architecture and gaps

- Game and account state live in server-only Nakama storage and account metadata. RPC handlers derive identity from `ctx.userId`; clients must not set ranked status, ratings, or queue membership directly.
- `SettingsScene` already has an Account tab and fetches account metadata with `get_user_account`. `UserAccount` has no matchmaking preference yet. `update_skin` demonstrates how to merge a setting into Nakama metadata without replacing unrelated `zarka` fields.
- Matches are created as storage-backed Nakama asynchronous matches. `create_match` and `start_match` are client-driven; `start_match` currently requires the creator. Ranked matchmaking needs a server-only create-and-start path rather than trusting a client to mark a match ranked.
- `async_turn/init.ts` clamps match size to 8. `MAX_BOT_PLAYERS` is 20, and team assignment already includes bot characters, but the 8-player cap must be raised for 16-player ranked games.
- The map generator accepts rows and columns; current default is 5x4. `assignSpawnPositions` and `distributeTeams` already handle human and bot rosters.
- `PlayerStats` already contains ELO fields, but `checkEndGame.ts` currently updates wins/losses without changing ELO.
- End-game detection identifies the last surviving team or an all-dead draw. It does not persist team elimination order. Match reports currently assign rank by kills and damage, which is not a ranked placement.
- `async_turn/loop.ts` reads persisted match state and resolves turns without checking human socket presence. Ranked matches should use server auto-skip/AFK rules so offline participants do not stall progress.
- There is no durable ranked queue, daily connected-user counter, ranked match marker, queue status RPC, or queue worker.

## Product rules

### Preference and slot lifecycle

Store `rankedMatchSlots` in `metadata.zarka`, expose it in `UserAccount`, and validate it server-side. Initial range: integer `0..3`; keep maximum configurable.

- A missing preference reads as `0`, including for newly created and existing accounts. Do not silently opt users in.
- A slot is occupied while its ticket is queued, reserved for match creation, or assigned to an unfinished ranked match. Count reservations before creating a match to prevent concurrent workers from over-assigning.
- Compute missing tickets as `max(0, requestedSlots - occupiedSlots)`.
- A player may have tickets for different matches, but may occur only once in a given roster. Count distinct humans, not tickets, toward a lobby's human threshold.
- Lowering the setting cancels newest queued tickets first. Do not eject a player from a match already started. Setting it to `0` prevents replacement tickets and cancels all unassigned tickets.
- Queue tickets and assignments do not expire because a player disconnects or stays offline. Cancel tickets only when the preference is lowered, the account becomes ineligible, or an explicit administrative action removes them. Daily-presence records expire separately and affect the population estimate, not queue membership.
- Offline users remain valid roster members. They can play when they return; server auto-skip and turn resolution continue under the match's configured rules.

### Eligibility

- Require an authenticated Nakama user who completed the tutorial and has `rankedMatchSlots > 0`.
- Exclude bots, tutorial matches, custom/private matches, removed matches, and accounts under moderation restrictions.
- Count one human once per match roster, even when they have multiple open slots.
- A ranked assignment is server-owned and immutable after start. `join_match` must reject late/manual joins to started ranked matches.

## Population-aware queue algorithm

Use distinct authenticated human accounts seen in the rolling 24-hour window as daily connected users, `D`. Record presence from an authenticated app-open/foreground heartbeat; derive user ID from Nakama context, deduplicate by user ID, and expire old records. Queue participation still requires explicit opt-in.

Let `H` be distinct eligible humans with queue tickets for a candidate roster, regardless of current connection state. Target 16 total participants and use these two modes:

### Low-population mode: `D < 16`

Wait until:

```text
requiredHumans = max(2, ceil(D / 2))
```

If `D < 2`, do not start a ranked match with one human and bots alone. Once `H >= requiredHumans`, select the oldest compatible distinct humans and fill the remaining seats with bots until the roster has 16 participants.

Example: with 5 distinct daily users, wait for 3 humans, then create a roster of 3 humans and 13 bots.

### High-population mode: `D >= 16`

Start by aiming for 16 humans. Reduce the threshold as the oldest candidate ticket waits:

```text
requiredHumans = max(8, 16 - floor(waitSeconds / 5400))
```

This needs 16 humans immediately, 12 after 6 hours, and 8 after 12 hours. The threshold drops by one human every 90 minutes and never falls below 8. Start with the available human roster once it meets the threshold; do not pad high-population matches with bots.

### Queue selection and safety

- Process oldest tickets first. Form a compatible roster, then reserve it atomically before creating the match. Never include the same user twice in one roster.
- For ranked fairness, begin with a configurable ELO range (recommended 200 points) and expand it with queue age (recommended +50 points every 90 minutes). In low-population mode, prioritize the half-DAU human threshold and relax the rating range gradually if needed.
- Use a durable assignment ID and reservation lease. If match creation fails or the worker restarts, recover or release that reservation idempotently; do not lose tickets or create duplicate matches.
- Reconcile slot counts against unfinished ranked matches and queue records. A completed, removed, or aborted match must release its slot exactly once.
- Presence and queue records are private server data. Do not publish queue membership or other users' presence through match state.

## Ranked match creation

1. Add authenticated RPCs for updating the slot preference, reading queue status, and optionally cancelling pending tickets. The server ignores caller-supplied user IDs and ranked flags.
2. Track authenticated app activity in a server-only daily-presence record. Refresh it on foreground heartbeat; do not treat client-reported DAU counts as authoritative.
3. Run one server-side coordinator that periodically evaluates durable tickets. Prefer a Nakama authoritative coordinator match with a short tick and a storage-backed lease; verify it continues ticking without player presences and recovers after Nakama restart. If runtime lifecycle cannot guarantee this, use a small internal worker. Do not depend on an in-memory queue or on a client being online.
4. Select roster, create a reservation, and create the match through a server-only ranked path. Reuse existing map, spawn, and team assignment routines.
5. Set `match.players` to human IDs, `botPlayers` to the bot fill count, `size` to total humans plus bots, and `cols`/`rows` from total roster size. Add server-owned ranked metadata containing assignment ID, human/bot counts, queue mode, and each human's ELO snapshot at start.
6. Generate the map, assign spawns and teams, persist the started match, and store replay turn 0. Avoid the client-only creator gate in `start_match`; extract shared start logic or create a trusted internal helper. No participant must be online for this step.
7. Atomically persist a `match_started` push outbox event with the started match. Dispatch it to all assigned human participants with valid Web Push subscriptions, including offline users. Push failure never delays or rolls back match start. Connected clients may also receive an in-app notification; `list_my_matches` remains the durable recovery path.
8. Extend `client/public/service-worker.js` to localize a ranked-match-started notification in English and Spanish. Notification click opens Zarka with the existing `?refreshMatches=1` flow so the newly started match appears. Do not include private match state, player names, or ELO in the push payload.

Reuse the existing Web Push subscriptions, VAPID dispatcher, retries, and service-worker registration; no second permission prompt or push service is needed. Extend the turn-only outbox/payload with an event discriminator. Turn payloads keep their current behavior; ranked starts use `{ event: "ranked_match_started", matchId, locale }` and localized copy such as “Ranked match started.” Persist the start outbox atomically with the durable `started` match record, target every subscribed human in `match.players` regardless of online state, and use an idempotency key based on match ID and event. Dispatch failure must not roll back assignment or block turn resolution. Without a subscription, the match remains available through `list_my_matches`.

Do not scan every historical match on each queue tick. Use dedicated indexed queue, presence, and assignment records with expiry/cleanup. Use storage versions or a lease to prevent multiple workers from consuming the same ticket.

## Map scaling

Keep roughly 1.25 map tiles per roster member, preserving the current 5:4 shape at 16 participants:

```text
tileBudget = ceil(1.25 * totalRoster)
cols = max(3, ceil(sqrt(tileBudget * 5 / 4)))
rows = max(3, ceil(tileBudget / cols))
```

Examples: 8 participants -> 4x3; 16 participants -> 5x4. Use total roster, including bots in low-population matches. Clamp dimensions to a server-defined maximum and test that generated walkable spawn tiles cover the roster. Keep map sizing server-owned; ignore client-provided dimensions for ranked matches.

## Team placement and ELO

### Placement tracking

- Use effective team identity `secretTeamId || teamId || solo_<playerId>`, matching current end-game logic.
- During each resolved turn, record teams eliminated in that turn. Teams eliminated in the same resolution share a place; later eliminations rank below earlier eliminations. The sole surviving team is first. If all teams die in the same turn, they tie.
- Persist elimination turn/place in the match record and ranked report. Do not derive ELO from the current report's kills/damage sort.
- Freeze each human's starting ELO in ranked match metadata. Concurrent matches must calculate from their own start snapshots, not a rating changed by another match that finished meanwhile.

### Recommended multiplayer Elo calculation

For each effective team, set `R_team` to the average starting rating of its members. Give bots a fixed virtual rating of 1000; never persist bot stats. For every pair of teams `i`, `j`:

```text
expected(i, j) = 1 / (1 + 10 ^ ((R_team_j - R_team_i) / 400))
score(i, j) = 1 if i placed ahead, 0.5 for a tie, 0 if i placed behind
teamDelta(i) = K_eff / (teamCount - 1) * sum(score(i, j) - expected(i, j))
```

Use a configurable base `K` (initial recommendation: 24). For bot-filled matches, reduce rating volatility by scaling K with human participation:

```text
K_eff = K * min(1, humanCount / 16)
```

Apply the same team delta to each human teammate, round deterministically, and clamp only at the account's nonnegative rating floor. Bots receive no stored rating update. Persist rating settlement idempotently by `(match_id, user_id)` so retries cannot apply a result twice. Update stats only for completed ranked matches; unranked/tutorial/custom matches do not affect ELO.

## Client work

1. Add an integer field to Account Settings labelled **Available for random games**, range `0..3`, initially `0`. Explain that it requests up to that many simultaneous ranked matches and can assign another match while one is in progress.
2. Load the saved value through `get_user_account`; save through a dedicated authenticated RPC. Show pending/error status and retain the last server-confirmed value on failure.
3. On app foreground/start, send the authenticated presence heartbeat and reconcile queue status. Heartbeats estimate daily population only; they do not keep tickets alive. Refresh `list_my_matches` when an assignment arrives or is discovered.
4. Show current counts: desired slots, queued tickets, and assigned/running ranked matches. Setting `0` cancels queue entries but does not interrupt running games.
5. Add English and Spanish strings for the field, help text, and queue states.

## Server and shared-model work

- Extend `UserAccount` and account parsing with `rankedMatchSlots`; default absent metadata to `0`.
- Add a preference RPC that validates integer bounds, merges `metadata.zarka` safely, and updates tickets only after the setting write succeeds.
- Add dedicated private storage collections for queue tickets, daily presence, assignment reservations, and rating settlements. Define retention and cleanup rules.
- Add ranked match metadata and report placement fields. Never expose private queue records or rating snapshots to other players.
- Generalize the existing turn push outbox for ranked-match-start events. Persist start event and match state atomically; localize title/body in the existing service worker and route notification clicks through `?refreshMatches=1`.
- Raise authoritative match capacity from 8 to 16 for ranked matches; validate total roster and bot count consistently in create, join, restore, and match-loop paths. Set ranked matches to server-managed auto-skip/AFK behavior; never gate match start or turn resolution on a human being connected.
- Add a trusted server-side matchmaking creator/start path and prevent manual joins or settings changes from changing a ranked roster after assignment.
- Extend match finalization to calculate ELO from persisted placements and apply it exactly once. Preserve existing win/loss stats and metadata when writing account updates.
- Add server-side audit logs for queue assignment, cancellation, match creation, placement, and rating settlement. Avoid logging credentials or private account metadata.

## Tests and acceptance

### Automated

- Account preference tests: default `0`, accepted bounds through `3`, rejected floats/strings/values above `3`, caller identity enforcement, metadata merge preservation, disabling and lowering slot counts.
- Queue tests: `D=5` starts at 3 humans and fills to 16; `D=1` does not start a ranked match; high-population threshold decays 16 to 8 on schedule and never below 8; oldest tickets win; rating-range expansion; duplicate slots from one user never share a roster.
- Concurrency/recovery tests: competing workers cannot reserve a ticket twice; failed match creation and worker restart recover reservations; assignment notifications may retry without duplicate matches; completed matches release slots once.
- Match tests: 16 total participants fit; bots count toward total roster and spawn assignment; ranked matches reject late joins; map dimensions match roster formula; unranked matches keep existing behavior.
- Placement/ELO tests: winner, elimination order, same-turn ties, all-dead ties, unequal team sizes, bots, concurrent rating snapshots, integer rounding, and repeated finalization.
- Privacy tests: queue/presence data and other users' slot preferences are not exposed through public match state, replay, reports, or account RPCs.

### Manual acceptance

1. Create a new account; verify random-game slots show `0` and no ranked ticket is created.
2. Set slots to `1`; verify one ranked assignment appears and starts automatically.
3. Set slots to `3` while one match is running; verify two additional distinct matches are queued/assigned, for three total. Confirm no user appears twice within any roster.
4. Set slots to `0`; verify pending tickets cancel and active games continue.
5. With 5 daily connected users, verify the coordinator waits for 3 humans and adds 13 bots. Verify ELO changes by team placement and bot ratings remain virtual.
6. With at least 16 daily users, use a fake clock to verify the human threshold falls by one every 90 minutes to 8 after 12 hours, and no bots are added in this mode.
7. Verify 8-player and 16-player maps use 4x3 and 5x4 dimensions respectively, and check mobile lobby status and match navigation.
8. Close all participant clients after a ranked match starts. Verify scheduled turns still resolve, online presence is not required, and each offline player can return and continue from persisted state.
9. Verify users with push enabled receive the match-start notice; users without permission or subscription are still assigned and can find the match on next login.

## Tunable values to confirm before implementation

- Maximum concurrent ranked slots (recommended initial maximum: 3).
- Rolling 24-hour definition for daily connected users.
- High-population cutoff (recommended: 16 unique daily users).
- High-population wait curve (recommended: 16 down to 8 over 12 hours, one fewer every 90 minutes).
- Low-population threshold and bot-fill policy (recommended: `max(2, ceil(D/2))`, then fill to 16).
- ELO K-factor, bot virtual rating, ELO-range expansion, and treatment of cancellations/abandoned games.
- Ranked account eligibility and any restrictions for guests, new users, or moderated accounts.

## Rollout

Ship preference and queue visibility before enabling automatic assignment. Deploy queueing behind a server-side feature flag. Enable low-population bot-filled games only after placement tracking and idempotent ELO settlement pass tests; then enable high-population time-based starts. Monitor wait times, bot ratio, queue cancellation, match completion, and ELO deltas before expanding the feature.
