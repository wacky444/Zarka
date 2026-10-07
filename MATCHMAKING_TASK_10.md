# Task 10: Persist team elimination placements

## Goal

Record actual ranked team placement from elimination order, including same-turn ties.

## Dependencies

Task 7 provides ranked match metadata; ELO settlement in Task 11 consumes placements.

## Scope

- Use effective team identity `secretTeamId || teamId || solo_<playerId>`.
- At each resolved turn, detect newly eliminated teams and persist elimination turn/place. Teams eliminated in the same resolution tie; surviving team ranks first.
- For an all-dead outcome, assign ties according to the same-turn elimination rule.
- Add placement data to ranked match report output. Preserve existing report ranking for unranked matches unless a deliberate migration is approved.
- Do not use current kills/damage report sort as ranked placement.

## Acceptance

- Placement is deterministic across normal resolution, retries, and match restoration.
- Same-turn eliminations tie; later eliminations rank below earlier eliminations.
- Last surviving team ranks first; all-dead outcomes are represented accurately.
- Rebuilding the report does not change stored placement.

## Validation

Add tests for elimination order, same-turn ties, all-dead cases, special/secret teams, and restore/retry behavior. Run server tests/build.
