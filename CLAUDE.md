# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development**
```bash
npm run dev           # Start Express + Vite dev server on port 5000 (hot-reload)
npm run check         # TypeScript type-check (no emit)
```

**Production**
```bash
npm run build                           # Full build: Vite (client) + esbuild (server)
NODE_ENV=production node dist/index.cjs # Run the production build
```

**Database** (present but unused)
```bash
npm run db:push  # Push schema to PostgreSQL (requires DATABASE_URL env var)
```

**Testing** — No test runner; CI smoke test only
- `.github/workflows/build.yml` runs `curl -s http://localhost:5000/snapshot/cam-01` expecting HTTP 200 after the server starts

## Native Dependencies

The `canvas` npm package requires system libraries:

**Ubuntu/Debian:**
```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev
```

**macOS:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

## Architecture

**Monorepo Structure**
- `client/` — React + Vite + TanStack Query + shadcn/ui (hash routing)
- `server/` — Express (serves API + MJPEG streams + SPA on port 5000)
- `shared/schema.ts` — Zod validation schemas + TypeScript interfaces (Camera, StreamStats, FaultMode)

**Server Core (all HTTP endpoints)**
- `server/routes.ts` — MJPEG multipart streaming engine (`--mjpegboundary`) + REST API (`GET /api/cameras`, `PATCH /api/cameras/:id`, etc.)
- `server/frameGenerator.ts` — node-canvas scene rendering (6 scenes: parking lot, corridor, entrance, server room, warehouse, outdoor) + fault injection (freeze, green_screen, noise, black, pixelate, disconnect)
- `server/storage.ts` — MemStorage class: in-memory only, 8 pre-configured cameras (cam-01 through cam-08), per-camera stream stats, no persistence

**Frontend (TanStack Query + React Router hash)**
- `client/src/main.tsx` — React bootstrap with hash routing redirect
- `client/src/App.tsx` — Root layout, nav bar, three routes: `/` (dashboard), `/config` (camera controls), `/stats`
- `client/src/pages/Dashboard.tsx` — Camera grid with snapshots + stats cards; polls `/api/cameras` every 5s, `/api/stats` every 3s
- `client/src/pages/CameraConfig.tsx` — Per-camera fault mode, probability, resolution, FPS, enabled toggles via `PATCH /api/cameras/:id`

**Build Pipeline**
- `script/build.ts` — Two-step: (1) Vite bundles client to `dist/public/`, (2) esbuild bundles server to `dist/index.cjs` (CommonJS, minified)

## Key Design Notes

1. **HTTP MJPEG, not true RTSP** — Despite the name, this tool uses HTTP multipart/x-mixed-replace streaming. FFmpeg is needed to re-wrap as RTSP for VMS integration.

2. **State is 100% in-memory** — `MemStorage` only. The Drizzle ORM config and PostgreSQL dependencies exist but are never used. Server restart clears all state.

3. **8 cameras pre-configured** — cam-01 through cam-08 with various scenes and fault modes. New cameras can be added via REST API but will vanish on restart.

4. **Canvas rendering capped at 1280×720** — Regardless of the configured `resolution` field (e.g., cam-06 claims "3840×2160" but renders at 1280×720). The resolution field is metadata only.

5. **Stream loops are dynamic** — MJPEG loop for a camera starts on the first client connect and stops when the last client disconnects. This saves CPU but means frame counter resets between connection sessions.

6. **No authentication** — All endpoints are open; `CORS Access-Control-Allow-Origin: *` is set. By design for a local test tool.

## Shared Type System

All data models are defined in `shared/schema.ts`:
- **Camera** — id, name, scene, resolution, fps, faultMode, faultProbability (0–100), enabled, bitrate
- **FaultMode** — "normal" | "freeze" | "green_screen" | "noise" | "black" | "pixelate" | "disconnect"
- **StreamStats** — cameraId, framesSent, bytesSent, activeClients, uptime, lastFaultAt
- **Zod Schemas** — `cameraSchema` and `updateCameraSchema` for REST validation

## TypeScript Path Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

Both defined in `tsconfig.json` and `vite.config.ts`.
