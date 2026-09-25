# Admin server API

The Admin API provides two password-protected HTTPS endpoints, also used by the admin-only Nakama Server Logs view:

- `POST /admin/logs` with `{"password":"…","errorOnly":false}` returns the last 500 Nakama container log lines. Set `errorOnly` to `true` to return only lines matching error, fatal, panic, or exception.
- `POST /admin/update` with `{"password":"…"}` checks out the latest fast-forwardable `main` branch, installs the module dependencies, rebuilds the TypeScript runtime, and recreates the Nakama container without restarting Postgres or Caddy.

Both endpoints read `console.password` from the mounted `server/local.yml` on every request. The password is sent in the JSON request body, never in the URL. Direct callers do not need a Nakama session.

## Deployment

1. Copy `server/Caddyfile.example` to `server/Caddyfile`, or add its `/admin/logs` and `/admin/update` handlers to the existing Caddy configuration.
2. Set a strong, unique `console.password` in `server/local.yml`. Do not use the example password.
3. Set `ADMIN_ALLOWED_ORIGINS` in the Compose environment if the web client is hosted on an origin other than `https://wacky444.github.io`. Add `http://localhost:5173` or `http://127.0.0.1:5173` only when local Vite development needs access.
4. From the `server` directory, build and start the API and reload Caddy: `docker compose up -d --build --force-recreate admin-api caddy`.

The API container has the repository mounted read/write and access to the Docker socket so it can pull and rebuild Nakama. During updates, it reads the host-side repository mount path from Docker metadata and uses a temporary Compose override to preserve Nakama's bind mounts. This grants the API host-level control through Docker. Keep its port internal (Compose intentionally does not publish it), expose it only through HTTPS Caddy, and protect it with a strong console password. The update operation refuses to run if the working tree has changes or the checkout is not on `main`.

## Direct requests

Send requests to the HTTPS Caddy host. For example, with `jq` installed:

```sh
read -rsp 'Nakama console password: ' NAKAMA_CONSOLE_PASSWORD; echo
curl --fail-with-body -sS 'https://<host>/admin/logs' \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg password "$NAKAMA_CONSOLE_PASSWORD" '{password: $password, errorOnly: true}')"
curl --fail-with-body -sS 'https://<host>/admin/update' \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg password "$NAKAMA_CONSOLE_PASSWORD" '{password: $password}')"
unset NAKAMA_CONSOLE_PASSWORD
```
