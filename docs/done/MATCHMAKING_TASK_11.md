# Task 11: Apply ranked ELO settlement exactly once

## Goal

Update human ratings from ranked team placements using frozen match-start ratings.

## Dependencies

Tasks 2, 7, and 10.

## Scope

- Snapshot each human's ELO when ranked match starts; bots use virtual rating 1000 and receive no account writes.
- Implement the pairwise team-placement Elo formula from `MATCHMAKING_PLAN.md`, with configurable base K=24 and bot-match scaling by `min(1, humanCount/16)`.
- Apply one team delta to each human teammate, deterministic integer rounding, and nonnegative rating floor.
- Store a private per-match/per-user settlement ledger or equivalent idempotency guard. Retried finalization must not apply rating twice.
- Preserve unrelated account metadata and existing win/loss/stat updates. Ignore tutorial, custom, unranked, aborted, and incomplete matches.
- Handle concurrent ranked matches using each match's stored ELO snapshot while serializing/merging account writes safely.

## Acceptance

- Expected score and actual score follow team placement, including ties and unequal team sizes.
- Concurrent matches use start snapshots, not a later rating.
- Duplicate finalization produces no second rating change.
- Bots are never persisted as users; unranked matches leave ELO unchanged.

## Validation

Add formula, rounding, retry, concurrent update, bot, and metadata-preservation tests. Run server tests/build.
