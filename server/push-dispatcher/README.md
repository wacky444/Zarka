# Web Push dispatcher

This service sends standard Web Push notifications with VAPID. It does not use Firebase. Nakama calls its internal `/send` route over a dedicated Nakama/dispatcher Compose bridge; Compose does not publish the dispatcher port, and the service has no Docker socket or public Caddy route.

## Configure

1. Generate VAPID keys:

   ```sh
   cd server/push-dispatcher
   npm ci --ignore-scripts
   npx web-push generate-vapid-keys --json
   ```

2. Copy `server/.env.example` to `server/.env`. Set the generated VAPID keys, a `mailto:` subject, and a random dispatch secret of at least 32 characters (for example, `openssl rand -hex 32`). Keep `server/.env` private and uncommitted.
3. Put the same `PUSH_DISPATCH_SECRET` in `server/local.yml` under `runtime.env`, and set `PUSH_DISPATCHER_URL=http://push-dispatcher:7355/send`.
4. Set GitHub repository variable `WEB_PUSH_VAPID_PUBLIC_KEY` to the public key. For local Vite builds, set `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` in `client/.env`.
5. Recreate Nakama and dispatcher after configuring secrets:

   ```sh
   cd server
   docker compose up -d --build --force-recreate nakama push-dispatcher
   ```

The public VAPID key is browser configuration. Never put the private VAPID key or dispatch secret in client files or `VITE_*` variables. The dispatch secret must match in Nakama `runtime.env` and Compose `.env`.

## Behavior

- Authenticated RPCs bind one browser device subscription to the current Nakama account. Rebinding the same device to another account deletes the old owner’s record.
- Nakama stores subscriptions and outbox jobs with server-only storage permissions. Endpoint hosts are restricted to known browser push services to prevent SSRF.
- Turn advance snapshots subscribed human participants, including eliminated participants while match remains active; bots and system users are excluded. English/Spanish notification text follows each device’s selected app language. No new-turn notice is queued after match finalization.
- Match state and outbox job are written in one atomic Nakama storage transaction. Nakama sends pushes after the commit; failures leave jobs pending for retry. Web Push HTTP 404/410 responses remove stale subscriptions.
- The service caches successful idempotency keys briefly, and the service worker replaces duplicate notifications for the same match turn.

## Verify

```sh
cd server/push-dispatcher
npm test
```

The health endpoint is internal: `GET /healthcheck`. A 200 response reports process health; `enabled: false` means server secrets are not configured. `POST /send` requires the Nakama-only bearer secret.
