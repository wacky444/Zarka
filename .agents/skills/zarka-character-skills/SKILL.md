---
name: character-skills
description: Architecture, rules, and workflows for developing or editing character progression skills in Zarka across shared, server, and client packages.
---

# Character Skills

## Core Rules

1. **Definition & Status**: Skills are defined in `shared/src/skills/SkillLibrary.ts` and typed in `shared/src/skills/Skill.ts`. Implemented skills must have `implemented: true`.
2. **Storage & Progression**: Acquired character skills are stored in `character.abilities` as an array of `SkillId` (supporting duplicate entries up to `max` ranks). Upgrades are purchased with `character.progression.availableSkillPoints`.
3. **Server Validation**: The server strictly validates skill point costs, implementation status, and rank limits in `upgradeSkill.ts`.
4. **Resolution Effects**: Skills that provide permanent stat increases apply them immediately upon upgrade; skills that affect turn mechanics, combat, or AP costs apply during match resolution.

## Key Files

### Shared

- `shared/src/skills/SkillLibrary.ts`: Skill definitions (`Skill`), categories, point costs, max ranks, and `implemented` status flag.
- `shared/src/skills/Skill.ts`: Type definitions for skills (`SkillId`, `SkillCategory`, `Skill`).
- `shared/src/skills/SkillLogic.ts`: Helper calculations and query functions (e.g. counting ranks, computing effective stat modifiers).

### Server

- `server/modules/src/rpc/upgradeSkill.ts`: Handles the `upgrade_skill` RPC: validates player state, implementation status, point costs, and max rank limits; deducts skill points; adds skill ID to `character.abilities`; and applies immediate permanent stat updates (e.g. `vitality` increments `character.stats.health.max`).
- `server/modules/src/match/`: Match turn loop inspecting `character.abilities` during turn execution.
- `server/modules/src/match/actions/`: Specific action handlers querying `character.abilities` or helpers from `SkillLogic.ts` to adjust action parameters (costs, damage, defense).

### Client

- `client/src/ui/CharacterPanelSkillsView.ts`: Renders skills grouped by category, computes committed ranks from `character.abilities`, displays descriptions and costs, and provides the upgrade button.
- `client/src/services/turnService.ts`: Sends the `upgrade_skill` RPC payload to Nakama.
- `client/src/scenes/GameScene.ts`: Coordinates skill view events with `turnService.upgradeSkills()`.

## Implementation Workflow

1. **Shared Definition**:
   - Register the skill in `shared/src/skills/SkillLibrary.ts` with ID, name, description, category, cost, and `max` ranks.
   - Set `implemented: true` when implementation is active.
   - Add calculation helpers or value resolvers in `shared/src/skills/SkillLogic.ts` if the skill provides computed bonuses or ranks.

2. **Server Upgrade RPC**:
   - Update `server/modules/src/rpc/upgradeSkill.ts` if the skill modifies baseline character stats immediately upon purchase (e.g. permanent health or inventory capacity).

3. **Server Match & Action Integration**:
   - For skills affecting combat, movement, AP costs, or specific actions, inspect `character.abilities` in the appropriate action handler in `server/modules/src/match/actions/` or turn resolution logic in `server/modules/src/match/`.

4. **Client UI**:
   - Verify category grouping and icon/description presentation in `client/src/ui/CharacterPanelSkillsView.ts`.
   - Ensure committed ranks reflect `character.abilities` and update reactively when state updates.
