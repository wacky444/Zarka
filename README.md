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

Open http://localhost:5173. The application now starts with a **login screen** featuring multiple authentication options:

### Authentication Options

1. **Facebook Login** - Integrated Facebook SDK authentication (requires Facebook App ID configuration)
2. **Email Registration/Login** - Create accounts or login with email and password
3. **Guest Access** - Quick device-based authentication for immediate access

### Login Flow

- **First Visit**: Shows login screen with authentication options
- **Returning Users**: Automatically restores valid sessions and proceeds to main game
- **Session Management**: Persistent login state across browser sessions with automatic token refresh

### Account Management

Once authenticated, users can:

- Access **Account Settings** to view profile information
- **Link/Unlink Facebook** accounts to existing email accounts  
- **Logout** to return to login screen and clear session

The game scene will authenticate with the stored session and call the `get_state` RPC. Email and Facebook auth provide persistent user accounts, while guest mode uses device ID for quick access.

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

## Next Steps

- [x] **Match options**:
  - [x] Set time of day to force next round (default 23:00)
  - [x] Autoskip if someone has moved and the time limit has passed (default ON)
  - [x] Number of bot players (default 0, range 0-10)
- [x] **Auth Upgrade**: Implemented comprehensive login system with email/Facebook authentication and session management
- [ ] Enhanced match management with spectator mode and player profiles
- [ ] Advanced filtering and search capabilities for active matches
- [ ] Real-time move validation and anti-cheat mechanisms
- [ ] Migrate to authoritative matches for instant turn notifications
- [ ] Comprehensive integration test suite for authentication and game flows
- [ ] **Facebook Configuration**: Set up Facebook App ID in `client/index.html` for production Facebook authentication
- [ ] **Social Features**: Friend lists, private matches, and in-game messaging
- [ ] Validation: Enforce player order (e.g., round-robin) and reject moves out of turn

## Deployment

### GitHub Pages

The game is automatically deployed to GitHub Pages on every push to the main branch.

**Live Demo**: https://wacky444.github.io/Zarka/

The deployment:
- Builds the client application with production settings
- Uses the configured Nakama server for multiplayer functionality
- Serves static assets from the `client/dist` folder

To configure for your own deployment:
1. Enable GitHub Pages in your repository settings (Settings → Pages → Source: GitHub Actions)
2. Configure GitHub repository variables for your Nakama server:
   - Go to Settings → Secrets and variables → Actions → Variables tab
   - Add these variables:
     - `NAKAMA_HOST`: Your Nakama server hostname (e.g., `your-server.com`)
     - `NAKAMA_PORT`: Your Nakama server port (e.g., `443` for HTTPS)
     - `NAKAMA_SERVER_KEY`: Your Nakama server key (optional, defaults to `defaultkey`)
     - `NAKAMA_SSL`: Set to `true` for HTTPS or `false` for HTTP (optional, defaults to `true`)
3. Push to the main branch to trigger deployment

**Note**: If you don't set these variables, the deployment will use placeholder values from `.env.production`

### Local Production Build

To test the production build locally:

```bash
cd client
cp .env.production .env
NODE_ENV=production npm run build
npm run preview
```

## Troubleshooting

- If the client cannot connect, ensure ports 7350/7351 are not blocked and Docker containers are healthy.
- If `Cannot find module` TypeScript errors appear before installing deps, run `npm install` first.
- If environment variables are not picked up, ensure you created `.env` (copied from `.env.example`) before starting `npm run dev`.

## License

MIT (adjust as needed)
