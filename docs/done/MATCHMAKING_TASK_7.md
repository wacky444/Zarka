# Task 7: Add trusted ranked match creation and start

## Goal

Create and start 8–16 player ranked matches entirely on the server, including bot-filled low-population matches.

## Dependencies

Task 6 supplies map sizing. Task 8 will call this server-side creation path.

## Scope

- Extract/reuse map generation, spawn assignment, team assignment, and replay turn-0 setup from existing start logic.
- Add server-owned ranked metadata with assignment ID, human/bot counts, queue mode, and human ELO snapshots.
- Set `match.players` to human IDs, `botPlayers` to bot count, `size` to total roster, and map rows/columns from Task 6.
- Raise ranked capacity from current `async_turn/init.ts` limit of 8 to 16; keep custom/unranked limits unchanged unless required.
- Force ranked matches to use server auto-skip/AFK behavior. Start and resolve turns without requiring player presence.
- Prevent clients from setting ranked metadata, changing a ranked roster, or joining a started ranked match.
- Avoid `start_match` creator-only checks by using a trusted internal helper, not a client-controlled flag.

## Acceptance

- Creates valid 8–16 participant matches, with bots included in roster size and spawn assignment.
- Ranked match starts with all selected humans assigned even when every client is offline.
- No late join can change the roster after start.
- Existing custom/tutorial match creation retains behavior.

## Validation

Add server tests for 8/16 rosters, bot fill, offline start, capacity, forbidden late joins, and unchanged unranked behavior. Run server build.
