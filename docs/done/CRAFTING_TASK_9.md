# Crafting Task 9: Verify End-to-End Crafting Workflows

## Goal

Verify the complete client-to-server Crafting and Combine/Separate flows against `docs/CRAFTING_PLAN.md` and close integration gaps found by regression tests.

## Dependencies

- Tasks 1–8.

## Scope

- Add or extend cross-layer tests covering catalog selection, action-plan persistence, RPC validation, authoritative resolution, inventory changes, XP, and replay/log output.
- Cover Crafting at a Workshop and with Dexterity 4; cover the blocked case outside a Workshop without the skill.
- Cover Combine, Separate, missing ingredients, chained operations, and the four-operation maximum.
- Run the plan's manual acceptance steps in a local match. Check both English and Spanish UI and a narrow mobile viewport.
- Keep server validation authoritative; do not add production deployment or recipe changes to this task.

## Acceptance

- All automated crafting-specific tests and relevant existing action/UI tests pass.
- Manual checks confirm 10 Crafting products without ingredient warnings, 7 Combine recipes with projected shortages, and 7 Separate options with required-item warnings.
- Manual execution confirms no Crafting ingredient consumption, +2 XP on success, exact Combine/Separate inventory changes, and clean failure behavior.
- Existing action ordering, action planning, inventory privacy, and localization remain intact.

## Validation

- Run `npm run build` and `npm run lint` in `client/`.
- Run `npm run build` and `npm test` in `server/modules/`.
- Record manual results and any remaining environment-dependent checks in the implementation PR; do not claim device validation unless performed on device.
