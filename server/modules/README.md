# Nakama TypeScript Module (async_turn)

This folder contains a TypeScript runtime module for Nakama which replaces the previous Lua module.

RPCs:

- create_match: optional payload { size?: number }
- submit_turn: payload { match_id: string, move: any }
- get_state: payload { match_id: string }

Storage:

- Collection "async*turn_matches", key `match*<uuid>`, system-owned
- Collection "async_turn_turns", key `<turn>:<match_id>`, system-owned

Build steps (run in this folder):

- Install deps (first time):
  - npm install
- Build:
  - npm run build

Docker-compose mounts this folder at /nakama/data/modules and local.yml is configured with runtime.js_entrypoint: build/index.js.

After building, restart Nakama:

- From repository root: `cd server ; docker compose up -d --build nakama`

## Facebook data deletion callback

The module registers these RPCs:

- `facebook_data_deletion`: validates Facebook's `signed_request` and deletes only the matching Nakama account.
- `facebook_data_deletion_status`: returns the deletion status shown to the user.

Match records, turns, chats, and replays are server-owned and are intentionally not deleted by this callback.

To expose the callback through Caddy:

1. Copy `server/Caddyfile.example` to `server/Caddyfile`.
2. Set `CADDY_DOMAIN=zdv.sytes.net` and a URL-safe `NAKAMA_HTTP_KEY` in the server environment.
3. Set the same `runtime.http_key` in `server/local.yml`.
4. Set `runtime.env.FACEBOOK_APP_SECRET` and `runtime.env.FACEBOOK_DATA_DELETION_URL` in `server/local.yml`.
5. Rebuild the module and restart Nakama and Caddy.

Use this URL in the Facebook developer dashboard:

`https://zdv.sytes.net/facebook/data-deletion`
