# Lovers (*Enamorados*) Team Implementation Plan

## Goal

Add the **Lovers (*Enamorados*)** secret mid-match team mechanic to Zarka, based on the official Zarka ruleset ([Zarka Rules Gist](https://gist.github.com/wacky444/74c9ca4ac2b3d477c03e7843caf6c7c3)) and confirmed product design decisions:

1. **Pre-Selected Secret Trigger Turn (Turns 4–20)**: At match start (when the Lovers option is enabled and at least two opposing teams exist), the server secretly rolls a trigger turn integer in `[4, 20]`. Starting on that turn (and rolling over through Turn 20 if no eligible pair has coincided yet), the first time two living, non-Twin players from different teams share a hex location during the start-of-turn `Enamoramiento` phase (first in the Order of Events), they suffer a *flechazo* and form the `Enamorados` secret team.
2. **Original Team Cover for Detective & Automatic Partner Confirmation**: When investigated by a **Detective**, a Lover continues to report their original cover team (`teamId`) rather than `Enamorados` (*"No detecta enamorados ni gemelos"*). Simultaneously, both Lovers are automatically added to each other's `confirmedTeammates` and `revealedTeamIdsByPlayerId` (`"Enamorados"`), immediately unlocking all cooperative actions (`feed`, `use_bandage`, `use_medicine`, `protect`, `give`, `inspect`, `use_antidote`, `inject_vaccine`, and area-attack exclusion).
3. **Public Announcements**: When Lovers form, a public turn-log event and banner notification announces that two players in Zarka have fallen in love without revealing their identities. When a Lover dies, a public announcement states that a Lover has died and reveals their `Enamorados` allegiance.
4. **Shared Partner Visibility & UI Status**: Living Lovers share board visibility (merging their partner's normal vision radius and remote reconnaissance views into their own tailored match view) and see both their secret `Enamorados` allegiance and their original cover team (`teamId`) in the **Players** and **Teams** subtabs.
5. **Match Creation Toggle**: The Create Match modal and lobby configuration include an **Enable Lovers Team (*Enamorados*)** option (`loversMode`, enabled by default for standard multi-team matches, disabled for tutorial matches).
6. **Centralized Color Palette Tokens**: All new colors for *Enamorados* UI elements (partner highlights, team labels, log/banner accents, and borders) must be created in and imported from `client/src/ui/ColorPalette.ts` (`THEME.colors`) rather than hardcoded inline in UI components.

---

## Official Rules Reference (Summary)

- **Formation Window**: Between Turn 4 and Turn 20 (`4 <= resolvedTurn <= 20`), at most one extra team (`Enamorados`) can form during a match.
- **Eligibility**: Two living players from different teams who share the same hex tile. Members of the `Gemelos` (Twins) secret team **cannot** become Lovers (`secretTeamId !== "Gemelos"`).
- **Order of Events (`Orden de Sucesos`)**: `Enamoramiento` is the very first step of turn resolution, occurring before alliance creation, skill acquisition, fire creation, healing/feeding, movement, and combat.
- **Loyalty & Cover Identity**: Once formed, the two players belong to the `Enamorados` team and win together as a separate team (`secretTeamId = "Enamorados"`), though they may continue pretending to belong to their original cover team (`teamId`).
- **Detective & Hitman Interaction**: Detective checks do not detect `Enamorados` or `Gemelos`—they report the target's cover `teamId`.
- **Shared Intelligence**: Because there is no possibility of betrayal between Lovers, they immediately know each other as confirmed partners and share visibility/daily reports.

---

## Proposed Changes

### 1. Shared Types & Payload Contracts (`shared/`)

- `shared/src/match.ts`:
  - Extend `MatchRecord` with:
    - `loversMode?: boolean` — indicates whether the Lovers team mechanic is enabled for this match.
    - `loversTriggerTurn?: number` — server-private secret turn in `[4, 20]` (redacted from public/player match views in `matchView.ts`).
    - `loversFormedTurn?: number` — server-private turn number when Lovers formed (or exposed only via public `teamCounts` / `teams`).
    - `loverPlayerIds?: [string, string]` — server-private tuple of the two character IDs who became Lovers (redacted from non-admin player match views).
- `shared/src/Payloads.ts`:
  - Add `loversMode?: boolean` to `CreateMatchRequestPayload`, `CreateMatchPayload`, and lobby match card summary models so the setting can be configured at match creation and displayed in match cards/lobby views.
- `shared/src/ActionLibrary.ts` / `shared/src/Replay.ts`:
  - Register or document replay/system action identifiers for Lovers events:
    - `lovers_formed` (private `ReplayPlayerEvent` visible only to the two Lovers, carrying `{ teamId: "Enamorados", coverTeamId, partnerPlayerId }`).
    - `lovers_announced` (public event with `visibility: { scope: "all" }` notifying all players that two survivors have fallen in love in Zarka without exposing actor IDs).
    - Include `wasLover?: boolean` (or `secretTeamId: "Enamorados"`) in `status_dead` event metadata when a Lover dies so the public log and banner announce the death of a Lover.

---

### 2. Server Match Initialization & Turn Resolution (`server/modules/`)

- `server/modules/src/rpc/createMatch.ts` & `server/modules/src/rpc/createTutorialMatch.ts`:
  - Parse `loversMode` from the `create_match` payload (defaulting to `true` for normal matches, and `false` for tutorial matches).
  - Persist `loversMode` on `MatchRecord` and include it in match creation params.
- `server/modules/src/match/startMatchRecord.ts` & `server/modules/src/match/teams.ts`:
  - When initializing a match where `match.loversMode !== false` and at least 2 distinct normal teams exist (`normalTeams.length >= 2`), roll a random integer `loversTriggerTurn` between `4` and `20` inclusive (`4 + Math.floor(Math.random() * 17)`) and store it on `match.loversTriggerTurn`.
- `[NEW] server/modules/src/match/lovers.ts`:
  - Implement `resolveLoversFormation(match: MatchRecord, resolvedTurn: number, logger?: nkruntime.Logger): ReplayEvent[]`:
    1. Guard conditions:
       - Return `[]` if `match.loversMode === false` or `match.metadata?.[TUTORIAL_MATCH_METADATA_KEY]` is present.
       - Return `[]` if `resolvedTurn < 4 || resolvedTurn > 20`.
       - Return `[]` if `Array.isArray(match.loverPlayerIds) && match.loverPlayerIds.length === 2` (Lovers already formed in an earlier turn).
       - Return `[]` if `typeof match.loversTriggerTurn === "number" && resolvedTurn < match.loversTriggerTurn`.
    2. Candidate discovery:
       - Group all living, non-incapacitated characters (`!isCharacterDead(c)`) by their current tile coordinate (`position.coord`).
       - For each tile with 2 or more living characters, build all unordered pairs `[charA, charB]` satisfying:
         - `charA.secretTeamId !== "Gemelos"` and `charB.secretTeamId !== "Gemelos"`.
         - `charA.secretTeamId !== "Enamorados"` and `charB.secretTeamId !== "Enamorados"`.
         - Their current effective teams differ (`(charA.secretTeamId || charA.teamId) !== (charB.secretTeamId || charB.teamId)`).
    3. Selection & state mutation:
       - If one or more eligible pairs exist across the map on this turn, pick one pair at random `[loverAId, loverBId]`.
       - Set `loverA.secretTeamId = "Enamorados"` and `loverB.secretTeamId = "Enamorados"`, keeping `loverA.teamId` and `loverB.teamId` untouched as their cover teams.
       - Add `loverBId` to `loverA.relationships.confirmedTeammates` (if not already present) and `loverAId` to `loverB.relationships.confirmedTeammates`.
       - Set `loverA.revealedTeamIdsByPlayerId[loverBId] = "Enamorados"` and `loverB.revealedTeamIdsByPlayerId[loverAId] = "Enamorados"`.
       - Record `match.loverPlayerIds = [loverAId, loverBId]` and `match.loversFormedTurn = resolvedTurn`.
       - Ensure `"Enamorados"` is appended to `match.teams` if not already present.
    4. Event emission:
       - Emit two private `ReplayPlayerEvent` entries (`actionId: "lovers_formed"`, `visibility: { scope: "limited", playerIds: [loverId] }`) with `{ teamId: "Enamorados", coverTeamId: lover.teamId, partnerPlayerId }`.
       - Emit one public announcement event (`actionId: "lovers_announced"`, `visibility: { scope: "all" }`) announcing that two players in Zarka have fallen in love.
- `server/modules/src/match/advanceTurn.ts`:
  - Invoke `resolveLoversFormation(match, resolvedTurn, logger)` at the very start of turn resolution (before the `for (const action of actions)` loop, matching `Enamoramiento` as first in the Order of Events) and append its returned events to `replayEvents`.
- `server/modules/src/utils/playerCharacter.ts` (or combat/damage death event emitter):
  - When a character transitions to `dead` and `character.secretTeamId === "Enamorados"`, attach `wasLover: true` (and `teamId: "Enamorados"`) to the `status_dead` replay event metadata so all players see that a Lover has died.

---

### 3. Detective Cover Identity & Shared Partner Visibility (`server/modules/`)

- `server/modules/src/rpc/buyShopItem.ts`:
  - Update the Detective branch (`resolvedShopId === "detective"`):
    - Per the Zarka ruleset (*"No detecta enamorados ni gemelos"*), investigating a target with `secretTeamId === "Enamorados"` or `secretTeamId === "Gemelos"` must reveal their cover `target.teamId` (not `target.secretTeamId`).
    - Compute the 10-Zarkan `opposingTeam` reward by comparing the actor's cover `teamId` against the target's cover `teamId` so Detective behavior gives zero signal that either player is a Lover or Twin.
- `server/modules/src/utils/matchView.ts`:
  - **Redaction of Server-Private Fields**:
    - Strip `loversTriggerTurn`, `loversFormedTurn`, and `loverPlayerIds` from `publicMatch` in `tailorMatchForPlayer` when `viewAll` is `false`.
  - **Viewer's Own Secret Team Preservation**:
    - Ensure that for the viewing player (`id === viewerKey`), `sanitizedViewer.secretTeamId` and `sanitizedViewer.teamId` are both preserved so the client UI can display both the viewer's `Enamorados` secret team and their cover team.
  - **Shared Partner Visibility for Lovers**:
    - In `tailorPlayerCharactersForViewer` and `tailorMapForCharacter` / `tailorMatchItemsForCharacter`:
      - If `viewer.secretTeamId === "Enamorados"`, find their living Lover partner (`partnerId` in `viewer.relationships.confirmedTeammates` where `playerCharacters[partnerId]?.secretTeamId === "Enamorados"` and `!isCharacterDead(playerCharacters[partnerId])`).
      - Include any candidate character or tile that is within the Lover partner's normal view range (`axialDistance(partnerCoord, candidateCoord) <= partnerViewRange`), remote view (`partner.remoteView`), camera view (`partner.cameraView`), or discovered items/C4s.
  - **Team Counts & Eliminated Reveals**:
    - Existing logic in `matchView.ts` already counts both `char.teamId` and `char.secretTeamId` in `teamCounts` and reveals `character.secretTeamId || character.teamId` upon death in `getEliminatedTeamsByPlayerId`. Verify that once `match.teams` includes `"Enamorados"`, `teamCounts["Enamorados"]` reflects the number of living Lovers while their cover teams continue counting them while alive so cover identities are not leaked by a sudden drop in original team count.
- `server/modules/src/match/checkEndGame.ts`:
  - Existing end-game evaluation resolves each living character's effective team via `char.secretTeamId?.trim() || char.teamId?.trim()`. Confirm with unit tests that when the only surviving characters have `secretTeamId === "Enamorados"`, the match concludes in an `Enamorados` victory and includes both Lovers (alive or dead) in `winnerIds`.

---

### 4. Client Color Palette, UI & Localization (`client/`)

- `client/src/ui/ColorPalette.ts`:
  - Define all new *Enamorados* semantic color tokens in `THEME.colors` so no hex or numeric color literals are hardcoded in UI views:
    - `loversAccent: 0xf43f5e` (numeric fill/stroke accent for Phaser graphics/borders)
    - `loversText: "#fb7185"` (hex string for Lover partner labels, team status, and log highlights)
    - `loversBackground: 0x3b182f` (subtle rose-tinted card/row background for Lover partner highlight)
    - `loversBorder: 0xe11d48` (border stroke for Lover cards/badges)
  - All UI components (`CharacterPanelPlayerListView`, `CharacterPanelLogView`, `TopBanner`, `LobbyView`, `MatchCard`) must import `THEME` from `ColorPalette.ts` and reference `THEME.colors.lovers*`.
- `client/src/scenes/MainScene.ts` / `client/src/scenes/LobbyView.ts` / `client/src/ui/MatchCard.ts`:
  - Add an **Enable Lovers Team (*Enamorados*)** checkbox/toggle in the Create Match configuration UI (defaulting to enabled) and pass `loversMode` in the `create_match` RPC request.
  - Display the Lovers mode status in the lobby/match settings summary.
- `client/src/ui/CharacterPanelPlayerListView.ts`:
  - When the current viewer has `secretTeamId === "Enamorados"`, display their team label as `Enamorados (Cover: <teamId>)` using `THEME.colors.loversText`.
  - Highlight their confirmed Lover in the Players list and player detail card using `THEME.colors.loversBackground`, `THEME.colors.loversBorder`, and `THEME.colors.loversText` so the partner relationship is unmistakable at a glance.
- `client/src/utils/logFormatter.ts`, `client/src/ui/CharacterPanelLogView.ts` & `client/src/ui/TopBanner.ts`:
  - Format `lovers_formed` (private to the two Lovers): *"You and {partner} have fallen in love! You now belong to the Enamorados team (cover team: {coverTeam})."* / *"¡Tú y {partner} os habéis enamorado! Ahora formáis el equipo Enamorados (equipo tapadera: {coverTeam})."*
  - Format `lovers_announced` (public): *"Cupid's arrow has struck in Zarka: two survivors have fallen in love."* / *"Ha surgido el amor en Zarka: dos supervivientes se han enamorado."*
  - Format Lover death notice on `status_dead` when `wasLover` is true: append *"One of the Lovers (Enamorados) has died."* / *"Ha muerto uno de los Enamorados."*
  - Mark `lovers_formed`, `lovers_announced`, and Lover death events as high-importance (`ReplayImportance.Critical`) and style their banner/log accents using `THEME.colors.loversText` / `THEME.colors.loversAccent`.
- `client/src/services/i18n.ts`:
  - Add English and Spanish translation keys for all Lovers UI labels, match creation toggle, log messages, and banner notifications.

---

## Verification Plan

### Automated Tests

- `[NEW] server/modules/test/lovers-team.test.ts`:
  1. **Secret Trigger Turn Rolling**: Verify `startMatchRecord` rolls `loversTriggerTurn` in `[4, 20]` when `loversMode` is enabled and skips rolling when `loversMode === false` or in tutorial matches.
  2. **Turn Window & Co-Location Trigger**: Verify that two non-Twin players from different teams sharing a tile before `loversTriggerTurn` do not become Lovers, and on `resolvedTurn >= loversTriggerTurn` (within `4..20`) they form the `Enamorados` team at the start of turn resolution (`Enamoramiento` phase) before other actions execute.
  3. **Twins & Same-Team Exclusion**: Verify characters with `secretTeamId === "Gemelos"` or characters on the same team never trigger `Enamorados`.
  4. **Single Pair Limit**: Verify that once `match.loverPlayerIds` is set, no second Lovers pair can form on subsequent turns.
  5. **Automatic Partner Confirmation & Friendly Actions**: Verify both Lovers receive each other in `confirmedTeammates` and `revealedTeamIdsByPlayerId`, enabling immediate cooperative actions (`give`, `feed`, `use_bandage`, `protect`, etc.) on the very same turn they fall in love.
  6. **Detective Cover Team Preservation**: Verify `buyShopItemRpc` with `shop_id: "detective"` targeting a Lover returns their original `teamId` (cover team) and never leaks `"Enamorados"`.
  7. **Shared Partner Visibility**: Verify `tailorMatchForPlayer` grants each living Lover visibility of characters, tiles, and discovered items within their Lover partner's sight range while redacting `loversTriggerTurn` and `loverPlayerIds` from other players.
  8. **Death Reveal & Victory Resolution**: Verify that killing a Lover emits the public Lover death metadata, reveals `"Enamorados"` in `revealedTeamsByPlayerId`, and awards an `"Enamorados"` victory to both Lovers when only `"Enamorados"` members remain alive.
- Run server module tests & build:
  - `cd server/modules && npm test`
  - `cd server/modules && npm run build`
- Run client tests, lint, & build:
  - `cd client && npm test`
  - `cd client && npm run lint`
  - `cd client && npm run build`
