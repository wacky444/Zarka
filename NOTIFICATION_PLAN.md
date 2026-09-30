# Turn-Advance Notifications Plan

## Goal

Show an Android system notification when a Zarka turn advances, including when the tab is backgrounded or closed. Keep Nakama authoritative; notification is a reminder, not a state update.

## Current architecture

- Client is a Phaser 3/Vite app deployed to GitHub Pages. `client/public` has no service worker or web app manifest yet.
- `GameScene` receives live `turn_advanced` messages through the Nakama socket. This only works while the client is connected.
- Turn resolution has two callers: `updateReadyStateRpc` when all players are ready, and `asyncTurnMatchLoop` for automatic advancement. Both persist match state before sending the `turn_advanced` socket message.
- Nakama `notificationSend` sends an in-app notification. Persistent notifications can be fetched after reconnect, but they do not display in Android’s notification tray.
- `nk.httpRequest` is available in the Nakama runtime for calling an external sender.

## Recommended design

Use standard Web Push and a service worker. Phaser does not run reliably in a hidden tab; the browser push service wakes the service worker separately.

```text
User enables notifications
  -> service worker registers and browser creates PushSubscription
  -> authenticated Nakama RPC stores subscription for current user/device
  -> turn advances and match state is persisted
  -> Nakama sends idempotent job to isolated push dispatcher
  -> dispatcher sends Web Push using VAPID
  -> browser wakes service worker and displays Android notification
  -> notification click opens Zarka; client fetches current match state
```

Use a small, isolated Node.js push-dispatcher container with a pinned `web-push` dependency. It must not share Admin API’s Docker socket or public admin routes. Keep it on the Compose network, with no published port. Nakama calls it with `nk.httpRequest` and a server-only shared credential.

Do not implement Web Push encryption/VAPID signing inside Phaser or expose private keys in the client. `VAPID_PUBLIC_KEY` may be public client configuration; `VAPID_PRIVATE_KEY` and the dispatcher authentication secret stay server-side.

## Client work

1. Add `client/public/service-worker.js` with:
   - `push` handler that parses a minimal payload and calls `self.registration.showNotification(...)`.
   - `notificationclick` handler that focuses an existing Zarka window or opens the app.
   - No game state or Nakama session tokens in worker storage.
2. Add a small `client/src/services/pushNotifications.ts` service to:
   - Feature-detect `Notification`, `navigator.serviceWorker`, and `PushManager`.
   - Register the worker and create a subscription with `userVisibleOnly: true` and the VAPID public key.
   - Request permission only from a clear user action in Account Settings; never prompt on startup.
   - Send the subscription to Nakama through an authenticated RPC; support re-subscribe, permission revocation, and unsubscribe.
3. Add an opt-in/status control in Account Settings. Explain that notifications require browser permission and may be delayed by Android or browser power management.
4. Register the worker using Vite’s `import.meta.env.BASE_URL`, and verify production build paths. GitHub Pages serves this project under `/Zarka/`; worker must be hosted within that path and must not request origin-wide `/` scope. Current Vite config has `base: ""`; resolve the production base before implementation. A manifest is optional for Android Web Push, but add one if installability is also desired.
5. On notification click, initially open the app and refresh the user’s match list/state. A `?match=<id>` deep link can be a follow-up; do not put private match data in the push payload.

## Server work

### Subscription lifecycle

- Add authenticated RPCs such as `register_push_subscription` and `unregister_push_subscription`.
- Derive owner from `ctx.userId`; never accept a caller-supplied owner ID.
- Store one server-only record per user/device in Nakama storage. Keep endpoint and encryption keys private; do not add them to `UserAccount`, public match state, replay snapshots, or chat.
- Use existing device identity where appropriate, handle account switching on the same browser, deduplicate updates, and remove revoked/expired subscriptions.
- Validate endpoint URLs before the dispatcher makes outbound requests. Reject non-HTTPS, loopback, private, link-local, and other unsafe destinations; prevent SSRF and redirects to unsafe hosts.

### Turn dispatch

- Add one shared turn-notification service and call it from both turn-advance callers: `updateReadyStateRpc` and `asyncTurnMatchLoop`.
- Enqueue only after successful match persistence. Do not send from `advanceTurn()` itself: it is called before persistence, and a write failure must not announce an uncommitted turn.
- Notify registered human accounts in an active match; exclude bot/system IDs. Decide explicitly whether eliminated human players still receive turn reminders. Do not send a new-turn notice after match finalization; match-ended notices can be a separate feature.
- Use an idempotency key such as `match_id:turn:user_id` so retries or duplicate processing do not create repeated notifications.
- Persist a small notification outbox/job with turn advancement and retry failed delivery. Push failure must never roll back or block turn advancement. Remove subscriptions when provider returns permanent-expiry responses (for Web Push, commonly HTTP 404/410).
- Send minimal content, for example title `Zarka: new turn` and `{ matchId, turn }`. Avoid player names, positions, private reports, action details, or session data.
- Optionally also call Nakama `notificationSend` for an in-app inbox/socket fallback. Treat it as separate from OS push.

## Deployment and secrets

- Add the dispatcher to `server/docker-compose.yml` without a host-published port or Docker socket mount. Restrict Nakama-to-dispatcher traffic to the Compose network.
- Configure VAPID public/private keys and the internal dispatch credential through deployment secrets / Nakama `runtime.env`; never commit real values or expose private values as `VITE_*` variables.
- Update `server/local.yml.example` with placeholders only. Initial dispatcher deployment requires rebuilding/recreating Compose services; the existing `/admin/update` only rebuilds Nakama modules and does not deploy a new service.
- Keep the GitHub Pages service-worker URL and scope aligned with the production base path.

## Tests and acceptance

### Automated

- RPC tests: registration is authenticated and user-scoped; invalid subscriptions are rejected; updates replace old device subscriptions; unregister removes only caller’s subscription.
- Server tests: both ready-based and automatic advancement enqueue once after persistence; failed match writes enqueue nothing; ended matches and bot IDs are filtered; retries preserve idempotency; provider failure does not fail the turn.
- Dispatcher tests: valid payload sends; authentication is required; invalid destinations are blocked; expired subscriptions are reported for removal; duplicate idempotency keys do not resend.
- Client tests: unsupported browser, permission denied, permission granted, existing subscription, unsubscribe, and account switching.

### Manual Android acceptance

1. Open the HTTPS Pages app in Android Chrome, sign in, and enable notifications from Account Settings.
2. Advance a match turn while the app is foregrounded; verify one system notification.
3. Repeat with the tab backgrounded and then closed; verify delivery and notification click behavior.
4. Verify no notification after opt-out, match end, or on an account without an active subscription.
5. Repeat with Android battery saver / Do Not Disturb and document that delivery timing is OS-controlled, not guaranteed.

## Context7 references

- [Phaser visibility lifecycle](https://github.com/phaserjs/phaser/blob/master/src/core/Game.js): Phaser pauses its loop on page visibility changes; it is not a background notification mechanism.
- [Nakama notifications](https://heroiclabs.com/docs/nakama/concepts/notifications/): Nakama notifications are in-app and can be persistent or delivered to connected users.
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) and [service-worker push event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event): browser push wakes a service worker, which can display a system notification while the page is not open.
