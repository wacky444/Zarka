# GitHub Copilot Instructions for Zarka

These instructions are automatically included in every Copilot conversation for this workspace. Follow them before reaching for external searches or terminal commands.

## Project context

- Async, turn-based hex strategy prototype built with **Phaser 3 + TypeScript + Vite** in `client/`.
- Multiplayer backend uses **Nakama** (Docker + Postgres) with **TypeScript runtime modules** in `server/modules/` compiled to `build/main.js`.
- Shared typesctript types (match state, payloads, hex grids) live in `shared/src/` and are consumed by both client and server.

## Assistant etiquette

- Skim relevant files and summarize the current behavior before proposing changes; prefer repository sources over assumptions.
- Open responses with a short acknowledgement plus a plan. Keep sentences short, friendly, and concrete—skip filler.
- When editing code, explain the reasoning, reference the files or symbols you touched, and call out risks or TODOs.
- Run or describe the smallest useful validation (build, lint, targeted test) after code changes. Only promise checks you actually execute.
- Prefer PowerShell-compatible commands (Windows host). Present commands in fenced `powershell` blocks and note that long-running tasks must finish—never cancel them early.
- Avoid writting code comments and don't remove existing ones.

## Workspace orientation

```
client/             Phaser 3 game (Vite, TypeScript)
  src/
    scenes/         Game flow (LoginScene, GameScene, etc.)
    services/       Nakama + turn APIs
    ui/             Reusable UI components
server/
  docker-compose.yml
  modules/          Nakama TypeScript runtime source + build pipeline
shared/             Cross-cutting domain types
```

Key files:

- `client/src/main.ts` boots Phaser and registers scenes.
- `client/src/services/nakama.ts` handles session + RPC helpers.
- `server/modules/src/rpc/*.ts` exposes RPC endpoints (`create_match`, `submit_turn`, etc.).
- `server/modules/src/match/async_turn/*` owns match loop helpers.
- `shared/src/index.ts` re-exports shared models; keep it in sync when adding types.

## Coding conventions

### General TypeScript

- Target ES modules with strict typing. Avoid `any`; prefer explicit interfaces from `shared/` or new interfaces in the relevant module.
- Use `const` and `readonly` where possible; default to arrow functions for callbacks and helper utilities.
- Keep modules small and cohesive—one responsibility per file. Export named symbols for tree shaking.
- File names use `PascalCase`

### Client (Phaser + Vite)

- Derive scenes from `Phaser.Scene` and register them in `client/src/main.ts`.
- Use services (`nakama.ts`, `turnService.ts`, `sessionManager.ts`) for IO; scenes should focus on presentation and state orchestration.
- Keep UI building blocks in `client/src/ui/`; prefer lightweight composition over deep inheritance.
- Assets live under `client/public/assets/`; update XML/JSON atlases alongside spritesheets when editing.
- Use external libraries freely, preferring phaser-friendly options (e.g. `phaser3-rex-plugins`).

### Nakama TypeScript runtime

- RPCs live in `server/modules/src/rpc/`; validate payloads using helpers in `server/modules/src/utils/validation.ts` and standardize error responses via `server/modules/src/utils/errors.ts`. Server reusable utils like calculate distance go in `server/modules/src/utils/`.
- Storage interactions should go through `services/storageService.ts` to preserve collection naming and permissions.
- When modifying match advance turn logic, update the server in `server/modules/src/match/advanceTurn.ts`, the signal handlers OPCODE_TURN_ADVANCED and the client `client/src/services/turnService.ts`.
- After server code changes, rebuild and redeploy modules:

```powershell
cd server/modules
npm install           # first-time or when deps change
npm run build         # invokes tsc --noEmit and esbuild bundle
cd ..
docker compose up -d --build nakama
```

### Shared packages

- Introduce new shared types in `shared/src/*.ts` and re-export from `shared/src/index.ts`.
- Keep type-only imports when possible (`import type { Foo } from ...`).
- Bump both client and server code when payload contracts change, and document breaking changes in the final response.

## Build & validation workflow

### Server environment (Docker + Nakama)

```powershell
cd server
docker compose up -d
```

- Bring modules up to date before restarting Nakama:

```powershell
cd server/modules
npm install
npm run build:server
cd ..
docker compose up -d --build nakama
```

- Verify services:

```powershell
cd server
docker compose ps
curl -f http://localhost:7460/healthcheck
```

### Client environment (Vite)

```powershell
cd client
copy .env.example .env
npm install
npm run build
npm run dev
npm run lint
```

All of these commands finish quickly (≤15 seconds). Let them complete—never cancel mid-run.

## Testing & QA expectations

- Manual smoke test after changes:
  - Check `docker compose ps` for healthy Nakama + Postgres containers.
  - Visit http://localhost:5173, authenticate (guest), and confirm the main menu render.
  - Exercise RPCs: create a match, submit a turn, fetch state via the UI or Nakama console (http://localhost:9231, admin/password).
- `cd client; npm run lint` (client) must be clean before considering work complete.
- When altering server logic, validate a sample RPC via Copilot chat script or Nakama console.

## RPC reference

- `create_match` — payload `{ size?: number }` (default match size from settings service).
- `submit_turn` — payload `{ match_id: string, move: Record<string, unknown> }`.
- `get_state` — payload `{ match_id: string }`, returns match metadata + turn history.
- `join_match` / `leave_match` — mutate participant roster.
- `update_settings` — accepts partial settings; ensure validation updates stay in sync with client forms.
- `listMyMatches` — used by lobby views to fetch active matches.

## Troubleshooting & performance

- If Nakama fails to start, rebuild modules first (`npm run build`) and check logs with `docker compose logs nakama --tail=100 | Select-String -Pattern "error"`.
- Check Nakama logs with `docker compose logs nakama --since=60s | Select-String -Pattern "error"`.
- Client connection issues usually stem from missing `.env` or Docker being offline; verify ports 7460/7461.
- Regenerate TypeScript declarations after dependency bumps with the normal build—no separate command needed.
- Typical timings: Docker start 10–15s, module build 1–2s, client build 8–12s, dev server <1s.

## When uncertain

- Use the tool context7
- Consult the files in this repo or the official Copilot customization guide (https://code.visualstudio.com/docs/copilot/customization/custom-instructions) for clarification before guessing.
- Document assumptions explicitly in your response, and propose follow-up actions if verification requires external systems beyond the repo.
