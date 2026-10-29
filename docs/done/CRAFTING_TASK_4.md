# Crafting Task 4: Build the Combine/Separate Selector

## Goal

Build a reusable client selector for Combine and Separate operations, independent from action-plan submission.

## Dependencies

- Task 1: shared Combine and Separate catalogs.
- Task 2: action labels and metadata.

## Scope

- Add a component under `client/src/ui/` with **Combine** and **Separate** tabs or an equivalent clear mode choice.
- Show all seven recipes in each mode, including recipes the current inventory cannot perform.
- For Combine, show consumed ingredients and projected available quantities. For Separate, show the required output item and returned components.
- Accept projected inventory data as input and show missing quantities as warnings without disabling recipe selection.
- Support selecting up to four operations, with a separate recipe/mode choice for each operation. Emit typed choices through a callback; do not submit or persist actions here.
- Do not compute or trust authoritative inventory changes in the selector.

## Acceptance

- Both modes show exactly seven catalog-derived choices; no recipe is hidden due to shortages.
- Warnings compare each operation's required quantities against the supplied projected inventory.
- Separate warnings identify a missing output item; returned components are displayed accurately.
- The component can collect four distinct operation choices and reports those choices in order.

## Validation

- Add focused tests for catalog membership, both modes, warning calculations, non-disabled shortages, and ordered multi-operation selection.
- Run `npm run build` and `npm run lint` in `client/`; visually inspect the selector at desktop and mobile sizes.
