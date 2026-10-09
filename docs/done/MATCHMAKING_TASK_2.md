# Task 2: Add ranked slot preference to account model

## Goal

Represent the saved random-match slot count in shared account data and default missing values to `0`.

## Dependencies

None. Task 3 adds the write RPC; Task 4 wires the Settings control.

## Scope

- Add optional/read-normalized `rankedMatchSlots` to `shared/src/UserAccount.ts`.
- Update `server/modules/src/rpc/getUserAccount.ts` to parse `metadata.zarka.rankedMatchSlots` as an integer in `0..3`; use `0` for absent or invalid data.
- Preserve the existing self-only access rule. Do not expose preferences for other users.
- Add/update targeted account RPC tests.

## Acceptance

- New and legacy accounts with no field return `rankedMatchSlots: 0`.
- Valid values `0`, `1`, `2`, and `3` round-trip unchanged.
- Invalid stored values safely read as `0`.
- Requesting another user's account remains forbidden.

## Validation

Run the targeted server tests and server module type/build check.
