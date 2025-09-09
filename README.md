# Async Turn-Based Game (Phaser + Nakama)

This repository provides a starter environment for an asynchronous turn-based game using:

- **Client**: Phaser 3 (TypeScript, Vite)
- **Server**: Nakama (Docker, Postgres) with Lua runtime modules

## Structure
```
client/           # Phaser + TS source
server/           # Docker + Nakama config
  docker-compose.yml
  local.yml       # Nakama console/runtime config
  modules/        # Lua modules (async_turn.lua)
```

## Prerequisites
- Node.js 18+ (with npm)
- Docker Desktop running (Windows)
- PowerShell terminal

## 1. Start Nakama + Postgres
From the `server` directory:
```powershell
cd server
docker compose up -d
```
This launches:
- Postgres on 5432
- Nakama gRPC/HTTP on 7350 (Websocket/HTTP)
- Nakama console on 9100 (user: `admin` / pass: `password`)

Check logs (optional):
```powershell
docker compose logs -f nakama
```

## 2. Install Client Dependencies
```powershell
cd ../client
copy .env.example .env   # Adjust if needed
npm install
```

## 3. Run Client Dev Server
```powershell
npm run dev
```
Open http://localhost:5173. The game scene will authenticate with a device ID and call the `get_state` RPC (initially this returns `not_found` until a match is created). Device auth is a quick start method—later you can add email, custom, or social auth.

### Turn Flow (Current Lua Prototype)
1. Client calls `create_match` => returns `{ match_id, size }`.
2. Players submit moves via `submit_turn` with `{ match_id, move }`.
3. Server increments `current_turn` and stores a turn record keyed by `turn:match_id`.
4. Client polls (or manually calls) `get_state` with `{ match_id }` to retrieve: `{ match, turns[] }`.

Because this is asynchronous, no real-time socket is required yet; you can later switch to authoritative matches or Go runtime for performance / validation.

## 4. Test RPCs (Optional)
Use Nakama console (http://localhost:9100) or a script to call:
- `create_match` (payload: `{ "size": 2 }` optional)
- `submit_turn` (payload: `{ "match_id": "<id>", "move": {"example": 1} }` )
- `get_state` (payload: `{ "match_id": "<id>" }`)

## Lua Module Overview
`async_turn.lua` implements three RPC endpoints storing match metadata and turns in Nakama storage collections:

Collections:
- `async_turn_matches` — one record per match keyed by `match_<uuid>`.
- `async_turn_turns` — one record per turn keyed by `<turnNumber>:<match_id>`.

Security / Access Notes:
- Records are written with `permission_read = 2` (public read) and `permission_write = 0` (server only) so clients must use RPC endpoints, avoiding direct client overwrites.
- Add validation (e.g., check correct player turn, move schema) in `submit_turn` before accepting moves.

Scaling Considerations:
- For large histories, page turns instead of iterating back 50. Use cursor-based listing or store an aggregate state snapshot every N turns.
- When switching to authoritative real-time matches, you can migrate logic into a Go or TypeScript (JS) match handler for push updates.

## Next Steps (Suggested Enhancements)
- UI: Buttons to create a match, submit a dummy move, and refresh state.
- Match Listing: Query storage to list active matches (add an index record or use authoritative listing).
- Validation: Enforce player order (e.g., round-robin) and reject moves out of turn.
- Auth Upgrade: Replace device auth with email/custom ID; persist display names.
- Real-Time: Migrate to authoritative matches for push-based turn notifications.
- Testing: Add a lightweight integration script invoking RPCs to assert turn sequence.

## Troubleshooting
- If the client cannot connect, ensure ports 7350/7351 are not blocked and Docker containers are healthy.
- If `Cannot find module` TypeScript errors appear before installing deps, run `npm install` first.
- If environment variables are not picked up, ensure you created `.env` (copied from `.env.example`) before starting `npm run dev`.

## License
MIT (adjust as needed)
