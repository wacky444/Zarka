# Progression plan

## Rules

- Characters start at level 1, level cap 10.
- Each level requires 10 XP; each level grants 1 available skill point.
- XP persists across levels, including overflow, and levels do not force skill purchases.
- Players must spend all available skill points before readying turn 0; after turn 0, they may save points and buy skills at any time.
- Train grants 5 XP; its extra execution grants another 3 XP.

## Implementation

- Apply ActionLibrary base XP to successful action replay events; train awards its documented base and extra execution XP.
- Award levels and skill points server-side during turn resolution.
- Enforce turn-0 skill-point spending in both client readiness UI and server RPC; allow saved/new points from later turns.

## Validation

- Add targeted progression tests; run server test suite/build, client lint/build, deploy Nakama.
