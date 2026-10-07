# Task 5: Track daily connected-user population

## Goal

Maintain a server-authoritative rolling 24-hour count of distinct human accounts for matchmaking mode selection.

## Dependencies

Task 3 provides authenticated RPC patterns. Queue tickets are not required yet.

## Scope

- Add an authenticated presence-touch RPC called on app start and foreground heartbeat.
- Derive user ID from Nakama context; ignore any supplied identity or DAU count.
- Store one private presence record per user with last-seen time. Heartbeats refresh a record, not the distinct-user count.
- Expire presence records outside the rolling 24-hour window. Presence expiry must not delete queue tickets or assignments.
- Exclude bot/system IDs and accounts that cannot enter ranked play.

## Acceptance

- Repeated heartbeats from one user count once.
- Multiple users count independently; stale users fall out after 24 hours.
- Offline users retain queue eligibility; this record only estimates daily population.
- No presence records are exposed through public match/account state.

## Validation

Add tests for deduplication, expiry boundaries, auth, and bot/system exclusion. Run targeted server tests and build.
