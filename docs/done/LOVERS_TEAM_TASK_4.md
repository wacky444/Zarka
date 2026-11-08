# Lovers Team Task 4: Preserve Cover Team on Detective Investigations and Share Partner Visibility

## Goal

Update Detective shop resolution so investigating a Lover (or Twin) reveals their cover `teamId` rather than `secretTeamId`, redact private Lover fields from tailored match views, and merge living Lover partner sight into tailored match views.

## Dependencies

Task 1, Task 3. Task 6 and Task 7 will rely on the tailored match state and Detective behavior implemented here.

## Scope

- Modify `server/modules/src/rpc/buyShopItem.ts`:
  - Add a helper `detectiveRevealedTeamId(character: { secretTeamId?: string; teamId?: string }): string | null`:
    - When `character.secretTeamId === "Enamorados"` or `character.secretTeamId === "Gemelos"`, return `character.teamId?.trim() || null` (their cover team) rather than `secretTeamId`, enforcing the Zarka rule *"No detecta enamorados ni gemelos"*.
    - Otherwise fall back to `effectiveTeamId(character)`.
  - In the `resolvedShopId === "detective"` branch:
    - Resolve `actorTeamId = detectiveRevealedTeamId(actor)` and `targetTeamId = detectiveRevealedTeamId(target) ?? undefined`.
    - Record `actor.revealedTeamIdsByPlayerId[targetPlayerId] = targetTeamId`.
    - Compute `opposingTeam = actorTeamId !== null && actorTeamId !== targetTeamId` using those cover teams so the 10-Zarkan pending payout behaves identically to normal cover-team members and never leaks secret allegiances.
- Modify `server/modules/src/utils/matchView.ts`:
  - **Redact Server-Private Match Fields**:
    - In `tailorMatchForPlayer`, when `!viewAll`, delete `publicMatch.loversTriggerTurn`, `publicMatch.loversFormedTurn`, and `publicMatch.loverPlayerIds` so clients cannot inspect raw match state to learn the secret trigger turn or who the Lovers are.
  - **Preserve Viewer's Own Secret & Cover Team**:
    - Verify that in `tailorPlayerCharactersForViewer`, when `id === viewerKey`, `sanitizedViewer.teamId` and `sanitizedViewer.secretTeamId` are both retained so a Lover viewer sees both their `"Enamorados"` secret team and their cover `teamId`.
  - **Share Partner Visibility Between Living Lovers**:
    - Add a helper `getLivingLoverPartner(viewer: PlayerCharacter | undefined | null, playerCharacters: Record<string, PlayerCharacter> | undefined): PlayerCharacter | undefined`:
      - If `viewer?.secretTeamId?.trim() !== "Enamorados"` or `isCharacterDead(viewer)`, return `undefined`.
      - Find a character `partner` in `playerCharacters` whose `id !== viewer.id`, `partner.secretTeamId?.trim() === "Enamorados"`, `!isCharacterDead(partner)`, and `viewer.relationships?.confirmedTeammates?.includes(partner.id)`.
    - In `tailorPlayerCharactersForViewer`:
      - If `partner` is present and has a valid `partner.position?.coord`, compute `isInLoverPartnerView` using the partner's effective view range (`axialDistance(partnerCoord, candidateCoord) <= getEffectiveViewRange(partner)`), `partner.remoteView`, and `partner.cameraView`.
      - Include `candidate` in `filtered` when `isInLoverPartnerView` is true (and allow seeing hidden characters if either `viewer` or `partner` passes `canSeeHiddenCharacter`).
      - Always include the living `partner` character itself in `filtered` for the Lover viewer so partners always see each other's current position and stats regardless of map distance.
    - In `tailorMapForCharacter` and `tailorMatchItemsForCharacter` (and `tailorMatchForPlayer` where `discovered` is built):
      - Union `character.discoveredItemIds` and `character.discoveredC4Ids` with the living Lover partner's `discoveredItemIds` and `discoveredC4Ids`, and union tile visibility checks so both Lovers see the same discovered items, C4s, and explored tile details.
- Explicit non-goals:
  - Do not modify client UI rendering or `ColorPalette.ts` in this task (belongs to Task 5 and Task 6).

## Acceptance

- Purchasing a Detective on a player with `secretTeamId: "Enamorados"` and `teamId: "Equipo Rojo"` returns `target_team_id: "Equipo Rojo"`, stores `"Equipo Rojo"` in `actor.revealedTeamIdsByPlayerId`, and awards 10 pending Zarkans if and only if the investigator's cover team is not `"Equipo Rojo"`.
- `tailorMatchForPlayer(match, viewerId, false)` strips `loversTriggerTurn`, `loversFormedTurn`, and `loverPlayerIds` from the returned match object.
- When Player A and Player B are living Lovers at opposite corners of the map, `tailorMatchForPlayer(match, "playerA", false)` includes Player B and any characters/items within Player B's sight radius.
- If one Lover dies, shared partner sight from the dead Lover stops, and `revealedTeamsByPlayerId` publicly reveals the deceased Lover's team as `"Enamorados"`.

## Validation

- Build server modules: `cd server/modules && npm run build`
- Run server tests: `cd server/modules && npm test`
- Run match view tests: `cd server/modules && npx tsx --test test/match-view-team-reveal.test.ts`
