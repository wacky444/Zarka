# Task 4: Connect Settings control to account persistence

## Goal

Make the Account Settings slot control load and save the server-confirmed preference.

## Dependencies

Tasks 1, 2, and 3.

## Scope

- Load `rankedMatchSlots` with the authenticated account request when SettingsScene opens.
- Save changes with `set_ranked_match_slots`; debounce rapid stepper input if needed.
- Show saving/error state. On failure, restore the last server-confirmed value rather than displaying an unsaved preference as saved.
- Keep UI bounds `0..3`, default missing values to `0`, and avoid exposing another user's setting.

## Acceptance

- Value survives logout/login and page reload.
- New/legacy accounts show `0` until explicitly changed.
- Repeated taps do not send stale writes out of order.
- RPC failure leaves a clear error and restores confirmed value.

## Validation

Add a focused client test for response handling if suitable test seams exist. Run client build and lint; manually verify Settings load/save when a test server is available.
