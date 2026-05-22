## Plan: Team System Requirements

Document the full team system from the design rules, but implement it in layers. Start by introducing a shared TypeScript source of truth for team distribution, then thread that through match settings, server-side team resolution, team-aware authorization rules, and team-based endgame logic. Capture GM/manual-only behaviors in the markdown requirements document, but keep the first code phases focused on deterministic game-state and rules enforcement.

**Steps**

1. Create the requirements document at `e:\Dev\ZarkaGit\docs\team-system-requirements.md`. Extract the team-related rules from `e:\Dev\ZarkaGit\Zarka Tabletop game.md` into clearly separated sections: initial team archetypes, hidden identity rules, detective confirmation, alliances, representatives, lovers, twins, hero exceptions, positive-action permissions, and team victory conditions.
2. In that document, split every rule into `Requirement`, `Gameplay impact`, `Data needed`, `Server responsibility`, `Client/UI responsibility`, and `Open questions`. This prevents the markdown from becoming only a prose summary and makes it directly actionable for implementation.
3. Define a new shared configuration module at `e:\Dev\ZarkaGit\shared\src\teamDistribution.ts`. This should become the first source of truth for team setup. Recommended contents: a `TeamArchetype` union (`standard`, `friends`, `battalion`, `hero`, `twins`), a `TeamDistributionConfig` root type, per-archetype config entries, validation-friendly fields for player counts and stat overrides, and a `ResolvedTeamAssignment` shape for the server to produce at match start.
4. Export the new team distribution types from `e:\Dev\ZarkaGit\shared\src\index.ts` and reference them from `e:\Dev\ZarkaGit\shared\src\inMatch.ts`, `e:\Dev\ZarkaGit\shared\src\match.ts`, and `e:\Dev\ZarkaGit\shared\src\Payloads.ts`. `InMatchSettings` should gain an optional or required `teamDistribution` field, while `MatchRecord` should gain persistent fields for the configured distribution and resolved runtime team state.
5. Expand the shared runtime model beyond the current `teamId?: string` field in `e:\Dev\ZarkaGit\shared\src\playerCharacter.ts`. Add explicit structures for: canonical team membership, hidden/public affiliation, detective-confirmed teammates, alliance links, representative delegation, lover state, and twin linkage. Keep hidden-information concerns separated from public-facing summaries so the server can tailor payloads safely.
6. Update match creation and lobby settings flow in `e:\Dev\ZarkaGit\server\modules\src\rpc\createMatch.ts` and `e:\Dev\ZarkaGit\server\modules\src\rpc\updateSettings.ts` to accept and validate the team distribution config. Validation should reject impossible setups, especially mismatches between configured team slots and total match size, multiple hero entries unless explicitly allowed, invalid twins placement, or battalion distributions that do not reconcile to the roster.
7. Reuse the existing player initialization path in `e:\Dev\ZarkaGit\server\modules\src\utils\playerCharacter.ts`, but stop hardcoding the same default progression and energy values for everyone. Introduce a server helper that applies archetype-based starting stats and skill points after team resolution. This is where the hero, friends leader, friends members, twins, and replacement-character defaults should be assigned.
8. Extend match start flow in `e:\Dev\ZarkaGit\server\modules\src\rpc\startMatch.ts` so team assignments are resolved once, persisted in the match record, and then used to seed character state before spawn placement. The `friends` archetype needs an additional pre-start or start-time resolution step because the leader nominates candidates and the server must draw the actual two teammates from that pool.
9. Add a dedicated server-side team rules module, likely under `e:\Dev\ZarkaGit\server\modules\src\match\` or `e:\Dev\ZarkaGit\server\modules\src\utils\`, to centralize team logic. This module should own: `isSameCanonicalTeam`, `isPositiveActionAllowed`, `isAggressionExclusionAllowed`, detective reveal behavior, detective-confirmed closure rules, alliance activation timing, alliance auto-dissolution when three or fewer teams remain, and representative eligibility.
10. Design detective state as evidence edges, not just booleans. The rules require mutual confirmation or a closed cycle before positive actions become legal. Model this as investigation records between players and derive `confirmedTeammates` from the evidence graph, rather than mutating it ad hoc.
11. Implement special-case identity rules in the same team module, but keep them isolated behind helper functions. The minimum set is: the hero returns a random team to detective checks, detective does not identify lovers or twins as teams, twins share privileged knowledge with each other from the start, and lovers become a new team that overrides prior loyalty once formed.
12. Treat lovers, alliances, and representatives as runtime relationship overlays on top of canonical team assignment. Canonical team membership should stay immutable for original assignment, while `effective team`, `alliance`, and `delegation` state should be modeled separately. This avoids breaking endgame, logs, and detective history when a lover pair forms mid-match.
13. Rework endgame evaluation in `e:\Dev\ZarkaGit\server\modules\src\match\checkEndGame.ts` and any duplicate winner computations in the async-turn loop or ready-state paths so the winner is the last surviving effective team, not the last surviving player. The payload should evolve from `winnerId?: string` toward a team-aware result, while remaining backward-compatible only if needed during migration.
14. Update any match-ended signaling and client consumption in `e:\Dev\ZarkaGit\shared\src\Payloads.ts`, `e:\Dev\ZarkaGit\client\src\scenes\GameScene.ts`, and related signal handlers so the UI can display a team victory instead of a single-player winner. Preserve enough player-level detail to show whether the current user’s team won even if that user is dead, because the rules count dead members of the winning team as winners.
15. Add lobby/UI support in `e:\Dev\ZarkaGit\client\src\scenes\LobbyView.ts` and any client-side services that send settings so hosts can choose a team distribution preset or compose one manually. The first UI can stay simple: a preset selector plus read-only preview of resulting archetypes and player counts. Do not expose hidden resolved assignments in the lobby.
16. Document and defer the GM-only or externally moderated workflows that are not pure engine features: private reports, shared master chat for twins/lovers, Facebook/public bulletin publication, and adjudication when a team cannot agree on a replacement controller. These belong in the markdown requirements doc as future integrations or manual ops support, not as blockers for the first engine pass.
17. Add validation and smoke-test coverage after implementation. At minimum, cover: valid and invalid team distributions, hero/twins/friends stat initialization, detective confirmation graph rules, alliance activation and dissolution, lovers overriding loyalty, and team-based endgame outcomes.

**Relevant files**

- `e:\Dev\ZarkaGit\Zarka Tabletop game.md` — authoritative source for team, detective, alliance, representative, lovers, twins, and win-condition requirements.
- `e:\Dev\ZarkaGit\shared\src\inMatch.ts` — current match settings type; add `teamDistribution` here.
- `e:\Dev\ZarkaGit\shared\src\match.ts` — persistent match state; extend with configured and resolved team state.
- `e:\Dev\ZarkaGit\shared\src\playerCharacter.ts` — current player runtime model with basic team placeholders; expand relationship and identity modeling here or alongside it.
- `e:\Dev\ZarkaGit\shared\src\Payloads.ts` — update match-ended and settings payloads for team-aware data.
- `e:\Dev\ZarkaGit\shared\src\index.ts` — export the new shared team distribution module.
- `e:\Dev\ZarkaGit\server\modules\src\rpc\createMatch.ts` — accept and store initial team distribution config.
- `e:\Dev\ZarkaGit\server\modules\src\rpc\updateSettings.ts` — validate and update team distribution pre-start.
- `e:\Dev\ZarkaGit\server\modules\src\rpc\startMatch.ts` — resolve actual teams and apply archetype-derived character setup.
- `e:\Dev\ZarkaGit\server\modules\src\rpc\joinMatch.ts` — ensure roster size and team config remain compatible as players join.
- `e:\Dev\ZarkaGit\server\modules\src\utils\playerCharacter.ts` — replace uniform defaults with archetype-aware initialization hooks.
- `e:\Dev\ZarkaGit\server\modules\src\match\checkEndGame.ts` — replace single-winner logic with team-aware end conditions.
- `e:\Dev\ZarkaGit\client\src\scenes\LobbyView.ts` — host-facing team distribution controls and summaries.
- `e:\Dev\ZarkaGit\docs\team-system-requirements.md` — new functional requirements and implementation design document.

**Verification**

1. Validate the requirements document against the design source and confirm every team-related rule from the game markdown has a mapped implementation owner or an explicit defer note.
2. Run shared and client type checks after the future implementation to confirm the new `teamDistribution` model is wired through all payloads and settings consumers.
3. Run server build after the future implementation to confirm RPC validation and endgame changes compile cleanly.
4. Add targeted tests or fixtures for team resolution, detective confirmation closure, alliance timing, lover transitions, and team-based win evaluation.
5. Perform a manual lobby-to-start smoke test: configure a distribution, join enough players, start the match, inspect persisted match state, and verify clients only receive the hidden/public team data they are allowed to see.

**Decisions**

- Scope includes the full team system in the requirements and implementation plan: team archetypes, detective confirmation, alliances, representatives, lovers, twins, hero exceptions, and team-based victory.
- The requirements document should live under a new `docs/` directory at the repository root.
- The first concrete code artifact should be a shared TypeScript module for team distribution configuration so both client and server validate the same structure.
- Canonical team assignment and runtime relationship overlays should be modeled separately; this is the safest way to support lovers, alliances, and detective-confirmed cooperation without corrupting original identity.
- GM/manual workflows should be documented but not block the first engine implementation unless a later pass explicitly targets admin tooling.

**Further Considerations**

1. Recommended first delivery slice: shared types + lobby setting + server validation + team-aware endgame. This gives you a usable vertical slice before tackling detective and lover logic.
2. The `friends` archetype likely needs an extra lobby/start state for leader nominations. If you want to avoid that complexity in the first vertical slice, define the config type now but gate the archetype behind a `not yet supported` validator until the nomination flow exists.
3. Match-ended payloads currently use a player winner model. Plan a migration path so existing client code can continue functioning while team-based results are introduced.
