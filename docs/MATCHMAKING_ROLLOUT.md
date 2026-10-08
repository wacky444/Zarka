# Ranked matchmaking rollout

## Gate

`RANKED_MATCHMAKING_ENABLED` in Nakama `runtime.env` controls queue intake and automatic assignment. It is **off by default**; only exact value `true` enables it. The coordinator still retries durable ELO settlements while the flag is off. Existing ranked matches, turn resolution, reports, saved slot preferences, and push outboxes continue normally.

Deploy server modules, push dispatcher, and client while flag remains unset or `false`. Confirm health checks and automated tests before opting any test account in.

## Pre-enable checks

1. Verify `server/local.yml` has `RANKED_MATCHMAKING_ENABLED=false` under `runtime.env`; saving `rankedMatchSlots` must preserve preference without creating queue tickets or matches.
2. Configure dispatcher/VAPID secrets separately if testing push. Push outage must leave ranked match start intact; pending notification retries remain durable.
3. Confirm ranked coordinator is running and logs contain structured events for assignment, recovery, notification delivery, placement, completion, and ELO settlement. Logs contain counts and aggregate deltas, not user metadata or queue membership.
4. Use two eligible test accounts with tutorial complete, slots set to `1`, and fresh presence records. Enable flag in a test environment and confirm low-population queue starts only after two humans are available, fills roster to 16 with bots, and snapshots starting ELO.
5. Verify offline flow: close participant clients after assignment, confirm match remains started and server advances turns, then reconnect and load persisted match. Test English/Spanish push while app foregrounded, backgrounded, and closed on desktop Chrome and Android Chrome.
6. Verify opt-out removes queued tickets but leaves assigned/running matches intact; verify failed match creation and coordinator restart recover reservations without duplicate matches or pushes.

## Enable

After pre-enable checks pass, change the `RANKED_MATCHMAKING_ENABLED` entry under `runtime.env` in `server/local.yml` to `true`, then recreate/restart Nakama so coordinator context receives updated environment. Start with test accounts and inspect queue wait, mode, roster counts, bot fill, notification outcomes, completions, and ELO delta aggregates. Broaden account opt-in only after manual offline and device-push acceptance.

## Roll back

Set `RANKED_MATCHMAKING_ENABLED=false` under `runtime.env` in `server/local.yml`, then recreate/restart Nakama. Queue intake and new automatic assignments stop. Existing queued tickets pause; preferences remain saved. Active ranked matches continue server-side, and completion reports and durable ELO/push retries continue. Do not delete assignments, matches, or user preferences as part of rollback.

Push can be independently disabled by withholding dispatcher/VAPID configuration. This must not block queue assignment or match start; notification outboxes retry when delivery is available again.

## Data and privacy

Queue tickets, presence, assignments, rating ledgers, and notification outboxes use private server storage permissions. Do not expose these records through match state, replay, reports, or client account payloads. Avoid logging user IDs, subscriptions, ratings per user, or queue membership.
