# Async Turn-Based Game (Phaser + Nakama)

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Server Setup (Docker + Nakama)
- Start the server environment:
  - `cd server`
  - `docker compose up -d` -- takes 10-15 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
- Build Nakama TypeScript runtime modules:
  - `cd server/modules`
  - `npm install` -- takes 2-3 seconds
  - `npm run build` -- takes 1-2 seconds
  - `cd ../..`
  - `cd server && docker compose up -d --build nakama` -- restart with built modules, takes 1-2 seconds
- Verify services are running:
  - `docker compose ps` (from server directory)
  - `curl -f http://localhost:7350/healthcheck` -- should return {}

### Client Setup (Phaser + TypeScript + Vite)
- ALWAYS run the server setup steps first.
- Setup client environment:
  - `cd client`
  - `cp .env.example .env` -- copy environment variables
  - `npm install` -- takes 6-8 seconds
- Build client:
  - `npm run build` -- takes 8-12 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
- Run development server:
  - `npm run dev` -- starts on http://localhost:5173, takes <1 second
- Lint code:
  - `npm run lint` -- takes 1-2 seconds

### Validation
- ALWAYS manually test the complete application after making changes:
  - Server: Check that `docker compose ps` shows both postgres and nakama as healthy/running
  - Client: Navigate to http://localhost:5173 and verify the game loads with authentication
  - RPC Testing: Create a match, submit turns, and retrieve state using the web interface or Nakama console (http://localhost:9100, user: admin, pass: password)
- Always run `npm run lint` in the client directory before committing changes
- Test both the main menu interface and the hex grid game scene

## Common Tasks

### Repository Structure
```
client/           # Phaser 3 + TypeScript + Vite web client
  src/           # Client source code
  public/        # Static assets
  package.json   # Client dependencies and scripts
server/          # Docker + Nakama configuration  
  docker-compose.yml  # PostgreSQL + Nakama services
  local.yml      # Nakama console/runtime config
  modules/       # TypeScript runtime modules for Nakama
    src/         # Server-side TypeScript source
    package.json # Server module dependencies
shared/          # Shared TypeScript types and models
  src/           # Shared code between client and server
```

### Key Files and Locations
- Main client entry: `client/src/main.ts`
- Game scenes: `client/src/scenes/` (MainScene.ts, GameScene.ts)
- Nakama service: `client/src/services/nakama.ts`
- Server RPCs: `server/modules/src/main.ts`
- Shared types: `shared/src/` (hexTile.ts, Payloads.ts, inMatch.ts)

### Available RPC Endpoints
From TypeScript runtime modules in `server/modules/src/main.ts`:
- `create_match` -- payload: `{ size?: number }` (optional)
- `submit_turn` -- payload: `{ match_id: string, move: any }`
- `get_state` -- payload: `{ match_id: string }`
- `join_match` -- payload: `{ match_id: string }`
- `leave_match` -- payload: `{ match_id: string }`
- `update_settings` -- payload varies

### Testing RPC Endpoints
Use Nakama console at http://localhost:9100 (admin/password) or test programmatically:
```javascript
// Example RPC test
const client = new Client('defaultkey', '127.0.0.1', 7350, false);
const session = await client.authenticateDevice('test-device-123', true);
const result = await client.rpc(session, 'create_match', { size: 2 });
```

### Build and Runtime Requirements
- Node.js 18+ (verified working with v20.19.5)
- Docker Desktop running
- Environment variables in `client/.env` (copy from .env.example)

### Environment Configuration
Default Nakama connection settings (client/.env):
```
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SERVER_KEY=defaultkey
VITE_NAKAMA_SSL=false
```

### Troubleshooting
- If Nakama fails to start: Check that TypeScript modules are built first (`cd server/modules && npm run build`)
- If client cannot connect: Ensure ports 7350/7351 are not blocked and Docker containers are healthy
- If TypeScript errors appear: Run `npm install` in both client and server/modules directories
- If build artifacts are missing: Always run `npm run build` in server/modules before starting Nakama

### Performance Notes
- Server startup: 10-15 seconds for initial Docker pull/setup
- Module builds: 1-2 seconds each
- Client builds: 8-12 seconds
- Development server start: <1 second
- NEVER CANCEL builds or long-running commands - they complete quickly in this project

### Development Workflow
1. Start server: `cd server && docker compose up -d`
2. Build modules: `cd server/modules && npm install && npm run build`
3. Restart Nakama: `cd server && docker compose up -d --build nakama`
4. Setup client: `cd client && cp .env.example .env && npm install`
5. Run client: `npm run dev`
6. Test at http://localhost:5173
7. Always run `npm run lint` before committing