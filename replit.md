# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WebSockets**: ws (for real-time game updates)

## Apps

### Scotland Yard Multiplayer (`artifacts/scotland-yard`)

A fully playable online multiplayer Scotland Yard board game. Players can:
- Create or join game rooms via 6-character room codes
- Choose roles: Mr. X (the fugitive) or Detective (up to 5)
- Play on a 199-station London transport map with taxi, bus, and underground routes
- Mr. X's position is hidden, only revealed on rounds 3, 8, 13, 18, and 24
- Real-time updates via WebSocket; REST API as fallback polling
- Win conditions: detectives catch Mr. X, or Mr. X survives 24 rounds

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server + WebSocket server
│   └── scotland-yard/      # React + Vite Scotland Yard game frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Key Backend Files

- `artifacts/api-server/src/lib/gameEngine.ts` — Scotland Yard game logic (moves, win conditions)
- `artifacts/api-server/src/lib/gameMap.ts` — London transport map with 199 stations & adjacency
- `artifacts/api-server/src/lib/wsManager.ts` — WebSocket server for real-time broadcasts
- `artifacts/api-server/src/routes/games.ts` — Game REST API routes
- `lib/db/src/schema/games.ts` — Database schema for games

## API Endpoints

- `POST /api/games` — Create game room
- `GET /api/games/:roomCode` — Get game state
- `POST /api/games/:roomCode/join` — Join a game
- `POST /api/games/:roomCode/start` — Start game (host only)
- `POST /api/games/:roomCode/move` — Make a move
- `WS /api/ws?roomCode=X&playerId=Y` — WebSocket for real-time updates

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
