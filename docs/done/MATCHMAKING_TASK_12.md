# Task 12: Notify users when ranked match starts

## Goal

Send Chrome/Android Web Push when an assigned ranked match has been durably started, including to offline participants.

## Dependencies

Task 7 creates started ranked matches. Existing turn-advance Web Push subscription, VAPID dispatcher, and service worker are prerequisites.

## Scope

- Generalize the turn-only push outbox/payload with an event discriminator while preserving existing turn notifications.
- Create `ranked_match_started` outbox with stable match ID and locale for each subscribed human in `match.players`; exclude bots.
- Persist the outbox atomically with the started match record. Use match/event idempotency; retries must not duplicate visible alerts.
- Dispatch regardless of player online status. Missing/disabled subscription or push failure must not undo or delay match start.
- Update `client/public/service-worker.js` with localized English/Spanish title/body. Notification click opens the existing `?refreshMatches=1` route so My Matches refreshes.
- Keep push payload minimal; do not include names, ELO, team secrets, positions, or match state.

## Acceptance

- A started ranked match generates at most one notification per subscribed device.
- Offline subscribed participants receive the notification; online status is not queried.
- No subscription or a dispatch failure does not block matchmaking.
- Existing turn notifications still show the same behavior and copy.

## Validation

Add client worker/payload tests, server outbox/idempotency tests, and dispatcher retry tests. Manually test Chrome desktop and Android Chrome with app foregrounded, backgrounded, and closed.
