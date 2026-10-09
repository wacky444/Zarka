# Task 13: Integrate, verify offline flow, and roll out safely

## Goal

Verify the complete ranked matchmaking flow and enable it behind a server-side feature flag.

## Dependencies

Tasks 1–12.

## Scope

- Add an off-by-default server feature flag covering queue intake and automatic ranked assignment.
- Exercise preference save, presence count, queue thresholds, bot fill, ranked match start, assignment visibility, placement, ELO, and push as one flow.
- Verify no active connection is required after opt-in: close participant clients, let the server start and advance the match, then reconnect and continue from persisted state.
- Verify failure paths: push outage, worker restart, opt-out while queued, preference lowered while matches are active, and match creation failure.
- Add structured metrics for queue wait, population mode, human/bot roster, assignment recovery, start-notification delivery, match completion, and ELO deltas.
- Document rollout/rollback procedure and keep queue/presence data private.

## Acceptance

- Automated suite covers the end-to-end state transitions and idempotent recovery.
- Manual acceptance matches the scenarios in `MATCHMAKING_PLAN.md`, including 3 concurrent slots and offline match start.
- Feature flag off prevents automatic assignment without changing existing custom matches.
- Feature can be disabled without deleting active matches or losing user preferences.

## Validation

Run targeted client/server/dispatcher tests, client lint/build, server build, and `git diff --check`. Perform offline and Android/Chrome push smoke tests before enabling for all accounts.
