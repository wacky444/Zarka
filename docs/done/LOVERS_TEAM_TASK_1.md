# Lovers Team Task 1: Define Shared Data Contracts, Match Settings, and Replay Action Types

## Goal

Define the shared TypeScript domain types, match record fields, lobby settings properties, RPC payload fields, and replay action identifiers required for the Lovers (*Enamorados*) team mechanic across `shared/`, `server/modules/`, and `client/`.

## Dependencies

None. Task 2 and Task 3 will consume these shared contracts on the server, and Task 5 and Task 6 will consume them in the client UI.

## Scope

- Modify `shared/src/match.ts`:
  - Extend `MatchRecord` with optional properties:
    - `loversMode?: boolean` — indicates whether the Lovers (*Enamorados*) team can form during the match (defaults to `true` for standard matches, `false` for tutorial matches).
    - `loversTriggerTurn?: number` — server-private pre-rolled turn integer in `[4, 20]` at which eligible co-location begins triggering the *flechazo*.
    - `loversFormedTurn?: number` — server-private turn number when the Lovers team was formed.
    - `loverPlayerIds?: [string, string]` — server-private tuple of the two character IDs that formed the `Enamorados` team.
- Modify `shared/src/inMatch.ts`:
  - Extend `InMatchSettings` with optional `loversMode?: boolean`.
- Modify `shared/src/Payloads.ts`:
  - Extend `CreateMatchPayload`, `UpdateSettingsPayload`, and `MyMatchCardSummary` with optional `loversMode?: boolean`.
- Modify `shared/src/Action.ts` and `shared/src/ActionLibrary.ts`:
  - Extend `ActionId` union in `shared/src/Action.ts` with `"lovers_formed"` and `"lovers_announced"`.
  - Add corresponding hidden/system `ActionDefinition` entries in `shared/src/ActionLibrary.ts` for `"lovers_formed"` and `"lovers_announced"` (matching the existing pattern used by `"team_assigned"`, `"status_dead"`, and `"detective_reward"`, with `hidden: true`, `energyCost: 0`, `cooldown: 0`, `actionOrder: 0`).
- Ensure `shared/src/index.ts` continues to re-export all updated types cleanly.
- Explicit non-goals:
  - Do not implement server-side RPC parsing or secret turn rolling in this task (belongs to Task 2).
  - Do not implement turn-resolution `Enamoramiento` logic (belongs to Task 3).
  - Do not modify client UI components or color palette files (belongs to Task 5 and Task 6).

## Acceptance

- `MatchRecord`, `InMatchSettings`, `CreateMatchPayload`, `UpdateSettingsPayload`, and `MyMatchCardSummary` include the new optional properties with strict TypeScript types (no `any`).
- `"lovers_formed"` and `"lovers_announced"` are valid `ActionId` values and have valid `ActionLibrary` entries so exhaustive `Record<ActionId, ActionDefinition>` checks pass.
- Both `server/modules/` and `client/` compile cleanly against the updated `@shared` types with zero TypeScript errors.

## Validation

- Build server modules: `cd server/modules && npm run build`
- Run server module tests: `cd server/modules && npm test`
- Build client: `cd client && npm run build`
- Lint client: `cd client && npm run lint`
