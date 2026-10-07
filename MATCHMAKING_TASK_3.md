# Task 3: Persist ranked slot preference securely

## Goal

Add an authenticated RPC that saves a player's desired number of concurrent ranked matches.

## Dependencies

Task 2 defines the account field and read default.

## Scope

- Add a `set_ranked_match_slots` RPC and typed request/response payloads.
- Derive owner only from `ctx.userId`; reject unauthenticated callers and invalid, fractional, or out-of-range values.
- Merge `metadata.zarka.rankedMatchSlots` without replacing stats, cosmetics, tutorial progress, or unrelated metadata. Follow `update_skin`'s metadata-preservation pattern.
- Register the RPC in server module initialization.
- Do not create queue tickets here; Task 8 owns queue reconciliation.

## Acceptance

- Only caller's preference can change.
- Values `0..3` save and are returned by `get_user_account`.
- Invalid payloads leave account metadata unchanged.
- Updating the field preserves all other metadata keys.

## Validation

Add targeted RPC tests for auth, bounds, metadata preservation, and read-after-write. Run server type/build checks.
