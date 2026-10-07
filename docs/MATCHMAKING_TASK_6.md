# Task 6: Implement matchmaking policy helpers

## Goal

Implement pure, testable functions for population thresholds, ELO search range, and ranked map dimensions.

## Dependencies

None for the helpers. Task 8 consumes queue thresholds; Task 7 consumes map sizing.

## Scope

- Low population (`D < 16`): require `max(2, ceil(D / 2))` humans; do not start for `D < 2`; fill total roster to 16 with bots.
- High population (`D >= 16`): calculate `max(8, 16 - floor(waitSeconds / 5400))`; threshold reaches 8 at 12 hours.
- ELO search range starts at 200 points and widens by 50 points per 90 minutes.
- Map formula: `tileBudget = ceil(1.25 * totalRoster)`, `cols = max(3, ceil(sqrt(tileBudget * 5 / 4)))`, `rows = max(3, ceil(tileBudget / cols))`; clamp to agreed server bounds.
- Keep calculations independent of Phaser, Nakama globals, or wall-clock calls; pass times/counts as arguments.

## Acceptance

- `D=5` requires 3 humans; `D=1` cannot start.
- High-pop threshold is 16 initially, 12 at 6 hours, and 8 at 12 hours and later.
- Map outputs include 4x3 for 8 participants and 5x4 for 16.
- Invalid inputs are normalized or rejected consistently.

## Validation

Add unit tests covering boundaries, fractional times, and roster sizes. Run targeted tests and type checks.
