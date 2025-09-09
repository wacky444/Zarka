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
