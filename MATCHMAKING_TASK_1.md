# Task 1: Add random-match slot control to Account Settings

## Goal

Add a numeric control labelled **Available for random games** to the Account tab. It represents the number of concurrent ranked matches the player permits, from `0` to `3`.

## Dependencies

None. Task 4 will connect this control to account persistence.

## Scope

- Add a compact Phaser stepper (`−`, current integer, `+`) to `client/src/scenes/SettingsScene.ts`.
- Keep value within `0..3`; initialize display at `0` until saved account data is loaded.
- Follow existing Account-tab layout and mobile input patterns.
- Add English/Spanish label and short explanatory copy in `client/src/services/i18n.ts`.
- Keep the control's value and callbacks accessible to later persistence wiring. Do not add localStorage or pretend changes are saved in this task.

## Acceptance

- Control appears only on Account tab and fits narrow/mobile layout.
- Decrement/increment changes by one; bounds cannot be crossed.
- Value `0` is visibly the disabled/default state.
- Locale switch translates label and help text.

## Validation

Run client build and lint. Check the rendered layout at desktop and mobile widths when browser testing is available.
