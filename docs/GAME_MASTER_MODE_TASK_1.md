# Game Master Mode Task 1: Define Shared Data Contracts, Opcodes, and Skin Generator

## Goal

Define the shared TypeScript domain types, match record fields, RPC payload contracts, kick opcode constant, and hatless skin generator utility needed for Game Master Mode across client and server packages.

## Dependencies

None.

## Scope

- Modify `shared/src/match.ts`:
  - Extend `MatchRecord` with optional properties:
    - `gameMasterMode?: boolean`
    - `gameMasterUserIds?: string[]`
    - `controlledCharacterRoster?: Array<{ id: string; name: string; skin: Skin }>`
- Modify `shared/src/Payloads.ts`:
  - Export `OPCODE_PLAYER_KICKED = 106` for notifying kicked participants when Game Master mode is enabled.
  - Extend `CreateMatchPayload` and `UpdateSettingsPayload` to support `gameMasterMode?: boolean` and `controlledCharacterRoster?: Array<{ id: string; name: string; skin: Skin }>`.
  - Extend `UpdateMainActionPayload`, `UpdateSecondaryActionPayload`, `UpgradeSkillPayload`, `BuyShopItemPayload`, and `UpdateReadyStatePayload` with optional `target_character_id?: string`.
- Modify `shared/src/SkinOptions.ts`:
  - Export helper function `generateRandomSkinWithoutHat(): Skin` that picks random valid identifiers from `BODY_OPTIONS`, `SHOES_OPTIONS`, `SHIRT_OPTIONS`, and `HAIR_OPTIONS`, setting `hat: ""`.
- Ensure `shared/src/index.ts` cleanly re-exports all new contracts and helpers.
- Explicit non-goals:
  - Do not implement server-side RPC validation or authorization (belongs to Task 2 and Task 4).
  - Do not alter lobby UI or in-game views (belongs to Task 5 and Task 6).

## Acceptance

- `MatchRecord` and all target payloads contain the new optional properties with strict typing (no `any`).
- `OPCODE_PLAYER_KICKED` is exported and numeric.
- `generateRandomSkinWithoutHat()` produces a `Skin` where `hat` is strictly `""` and other components pass `isValidSkinId`.
- Both `client/` and `server/modules/` compile without type errors after consuming updated shared types.

## Validation

- Build server modules: `cd server/modules; npm run build`
- Build client: `cd client; npm run build`
- Typecheck and lint: `cd client; npm run lint`
