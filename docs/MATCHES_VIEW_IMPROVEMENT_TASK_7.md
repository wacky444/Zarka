# Matches View Improvement Task 7: Add Maximum-Current-Matches Setting

## Goal

Persist each user's maximum active-match count in Nakama account settings and enforce it on every path that creates a new membership.

## Dependencies

- Task 1: typed account/list contract.

## Scope

- Add `maxCurrentMatches` under `metadata.zarka`, expose it through the self account API, and add an authenticated setter RPC using the existing account-metadata update mechanism.
- Default missing or invalid values to 10. Define a bounded allowed range before implementation; do not accept arbitrary client values.
- Add a localized account-settings control and save/restore behavior.
- Enforce the preference server-side before create, join, and ranked-match assignment. Count active memberships plus the user's own waiting match; exclude tutorial and finished matches. Count ranked matches toward the total cap while retaining `rankedMatchSlots` as its separate ranked-only limit.
- Reconcile the current creator-only limit of 3 so it does not conflict with the new default. Lowering the cap must not remove existing matches; reject only new memberships until below limit.
- Make duplicate joins idempotent and guard concurrent create/join operations against overshooting the cap.

## Acceptance

- New and existing accounts resolve to default 10 until they save another valid value.
- A saved value survives refresh and appears in the `online/max` group header.
- Create, join, and ranked assignment all enforce the same server-side effective cap.
- Invalid settings are rejected; lowering the limit preserves current matches.
- Ranked slot preference behavior remains independent and unchanged.

## Validation

- Add account API, setter, and server membership-cap tests, including defaulting, invalid bounds, duplicate joins, concurrent attempts, ranked assignment, and creator-limit reconciliation.
- Run `npm run build` and `npm test` in `server/modules/`; run `npm run build` and `npm run lint` in `client/`.
