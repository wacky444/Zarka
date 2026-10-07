# Task 9: Show queue and assigned-match status in client

## Goal

Let users see desired slots, queued tickets, and assigned/running ranked matches, and find auto-assigned games after reconnect.

## Dependencies

Tasks 4, 7, and 8.

## Scope

- Add authenticated `get_ranked_queue_status` response with caller-only counts and assignment IDs/match IDs.
- Add client service method and display status near the Account Settings control or My Matches list.
- Refresh `list_my_matches` and queue status on app start/foreground and when an assignment is discovered.
- Make assigned games visible in My Matches without requiring the user to accept a lobby invite. Opening a match remains an explicit user action.
- Treat push as optional; the persistent match list is source of truth.

## Acceptance

- Counts reconcile with desired slots and server ticket/assignment state.
- An offline-assigned match appears on the next login.
- User sees queue state without seeing any other user's queue or preference.
- Setting slots to zero displays no pending tickets while preserving existing running games.

## Validation

Add client/service tests for status parsing and empty/error states. Run client build/lint and manually verify with server when available.
