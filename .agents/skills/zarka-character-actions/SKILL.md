---
name: character-actions
description: Architecture, rules, and workflows for developing or editing character actions across shared, server, and client in Zarka.
---

# Character Actions

## Core Rules

1. **Definition & Status**: Actions are defined in `shared/src/ActionLibrary.ts`. Implemented actions must have `developed: true`.
2. **Server Enforcement**: Action execution and prerequisite checks are strictly enforced on the server. Client requirement checks are advisory UI helpers only.
3. **Full-Stack Lifecycle**: Developing a character action spans shared definitions, server execution and targeting, client requirement warnings, client combat/action logging, and client replay animations.

## Key Files

### Shared
- `shared/src/ActionLibrary.ts`: Action definitions (`ActionDefinition`), action IDs, categories, targeting parameters, AP costs, range, and `developed` status.

### Server
- `server/modules/src/match/actions/`: Individual action implementation files (e.g. `axeAttack.ts`, `shootPistol.ts`, `search.ts`). Each action exports an `execute` function.
- `server/modules/src/match/actionExecutor.ts`: Dispatches action execution during turn resolution.
- `server/modules/src/match/advanceTurn.ts`: Orchestrates turn processing and triggers action execution.
- `server/modules/src/match/actions/targeting.ts`: Target collection logic (valid hexes, candidate players, line of sight, range).
- `server/modules/src/rpc/updateMainAction.ts`: Sets action complementary fields (location target, player target, item choice, prioritization selectors).

### Client
- `client/src/ui/ActionRequirementWarnings.ts`: Advisory checks via `getMissingRequirement()`. Defines `ACTION_REQUIRED_LOCATIONS` and `LOCATION_DISPLAY_NAMES`.
- `client/src/ui/panel/CharacterPanel.ts`: Wires requirement warnings via `resolveActionMetadata()` to `GridSelectItem.missingRequirement` for `GridSelect`.
- `client/src/ui/CharacterPanelLogView.ts`: Match event log display via `formatReplayEvents` (each action formats its own replay log entry).
- `client/src/animation/moveReplay.ts`: `ActionAnimator` coordinator for playing turn replay animations.
- `client/src/animation/replayActions/`: Per-action visual animation classes (e.g. `AxeAttackAnimation.ts`, `ShootPistolAnimation.ts`).

## Implementation Workflow

1. **Shared Definition**:
   - Register or update the action in `shared/src/ActionLibrary.ts`.
   - Set `developed: true` once implementation begins.
   - Configure tooltip requirements (`ActionDefinition.requirements`), target types, AP costs, and ranges.

2. **Server Execution & Targeting**:
   - Create or update the action handler in `server/modules/src/match/actions/<actionName>.ts` with an `execute` function.
   - Wire target collection in `server/modules/src/match/actions/targeting.ts`.
   - Wire complementary fields or prioritization selectors in `server/modules/src/rpc/updateMainAction.ts`.
   - Register the handler in `server/modules/src/match/actionExecutor.ts` to be invoked by `advanceTurn.ts`.

3. **Client Advisory Warnings**:
   - Implement advisory requirement checks in `client/src/ui/ActionRequirementWarnings.ts::getMissingRequirement()`.
   - Check `requiredItems` (handling any-of alternatives explicitly).
   - Add location rules to `ACTION_REQUIRED_LOCATIONS` and labels to `LOCATION_DISPLAY_NAMES`.
   - Localize new requirement messages.

4. **Client Replay & Animation**:
   - Create an animation class in `client/src/animation/replayActions/<ActionName>Animation.ts`.
   - Register the animation in `ActionAnimator` in `client/src/animation/moveReplay.ts`.

5. **Client Log Formatting**:
   - Implement action-specific replay event formatting in `formatReplayEvents` in `client/src/ui/CharacterPanelLogView.ts`.

