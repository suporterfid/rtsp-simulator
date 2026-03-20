# RTSP Simulator — NVR/VMS Test Platform

A lightweight HTTP/MJPEG camera simulator with configurable faults (freeze, green screen, noise, black screen, pixelation, disconnection) for NVR/VMS integration testing.

## Overview

This project provides **8 virtual cameras** via HTTP/MJPEG with animated scenes and injectable failure modes, useful for:

- Testing signal-loss detection in VMS systems (Milestone, Genetec, Hikvision IVMS, etc.)
- Validating NVR behavior (Blue Iris, Frigate, Shinobi) under adverse conditions
- Development and CI of camera integrations without physical hardware
- Testing Digifort API integrations with AlertaHub Vision/Core and other platforms

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Node.js · Express · TypeScript · `canvas` (JPEG frame generation) |
| **Frontend** | React · Vite · Tailwind CSS · shadcn/ui · TanStack Query |
| **Build** | `tsx` · Rollup (via Vite) · esbuild |

## Prerequisites

- **Node.js ≥ 18**
- **npm ≥ 9**
- Native `canvas` dependencies: `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`, `libgif-dev`

### Ubuntu / Debian

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev
```

### macOS (Homebrew)

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

## Installation

```bash
git clone https://github.com/suporterfid/rtsp-simulator.git
cd rtsp-simulator
npm install
```

## Development

```bash
npm run dev
```

Starts Express (backend) and Vite (frontend) on port **5000**.

Access: [http://localhost:5000](http://localhost:5000)

## Production Build

```bash
npm run build
```

Generates static bundle in `dist/public/` and compiled server in `dist/index.cjs`.

## Production Run

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Server available at: [http://localhost:5000](http://localhost:5000)

### Digifort-Compatible Port (8601)

To emulate a Digifort server on the standard API port:

```bash
PORT=8601 NODE_ENV=production node dist/index.cjs
```

Or use a reverse proxy to forward port 8601 to 5000.

## Docker

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
```

```bash
docker build -t rtsp-simulator .
docker run -p 5000:5000 rtsp-simulator
```

## Endpoints

### Native API

| Method | Route | Description |
|---|---|---|
| `GET` | `/stream/:id` | Continuous MJPEG stream (multipart/x-mixed-replace) |
| `GET` | `/snapshot/:id` | Single JPEG snapshot |
| `GET` | `/api/cameras` | List all cameras and configurations |
| `GET` | `/api/cameras/:id` | Get single camera details |
| `PATCH` | `/api/cameras/:id` | Update camera configuration |
| `GET` | `/api/stats` | Stream statistics (frames, bytes, active clients) |

### Digifort API Emulation

| Method | Route | Description | Status Codes |
|---|---|---|---|
| `GET` | `/Interface/Cameras/GetStatus?ResponseFormat=JSON` | All cameras in Digifort format (Name, RecordingFPS, UsedDiskSpace, ConfiguredToRecord) | 200, 400, 500 |
| `GET` | `/Interface/Cameras/GetSnapshot?Camera={name}` | JPEG snapshot by camera name (case-sensitive) | 200, 400, 404, 503 |

**Default Camera IDs:** `cam-01` through `cam-08`

#### Digifort GetStatus Example

```bash
curl "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON"
```

**Response:**
```json
{
  "Response": {
    "Data": {
      "Cameras": [
        { "Name": "Câmera 01 — Estacionamento", "RecordingFPS": 25, "UsedDiskSpace": 0, "ConfiguredToRecord": true },
        { "Name": "Câmera 02 — Corredor A", "RecordingFPS": 0, "UsedDiskSpace": 0, "ConfiguredToRecord": false }
      ]
    }
  }
}
```

#### Digifort GetSnapshot Example

```bash
CAMERA_NAME="Câmera%2001%20%E2%80%94%20Estacionamento"
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=${CAMERA_NAME}" -o snapshot.jpg
```

## Connecting to NVR/VMS

### Direct MJPEG (compatible with most VMS)

```
http://<host>:5000/stream/cam-01
```

### Blue Iris / Frigate (generic camera)

```
URL: http://localhost:5000/stream/cam-01
Type: MJPEG
```

### Frigate NVR (`frigate.yml`)

```yaml
cameras:
  cam-01:
    ffmpeg:
      inputs:
        - path: http://localhost:5000/stream/cam-01
          roles:
            - detect
            - record
```

### Re-encapsulate as RTSP with FFmpeg

```bash
ffmpeg -re -i http://localhost:5000/stream/cam-01 \
  -c copy -f rtsp rtsp://localhost:8554/cam01
```

### Digifort-Compatible Integration

The simulator now emulates the **Digifort VMS HTTP API**, allowing integration with:
- **AlertaHub Vision Edge** (camera worker, edge API)
- **AlertaHub Core** (NVR management, monitoring rounds)
- Any client expecting Digifort API format

#### AlertaHub Vision/Core Configuration

```yaml
nvr:
  host: "localhost"
  port: 5000  # or 8601 if behind reverse proxy
  protocol: "RTSP"
  nvrBrand: "Digifort"
  username: "admin"  # any value, ignored by simulator
  password: "admin"  # any value, ignored by simulator
```

#### Camera Discovery Flow

1. Call `GET /Interface/Cameras/GetStatus?ResponseFormat=JSON` to discover cameras
2. Parse `Response.Data.Cameras[].Name` for camera list
3. Construct RTSP URLs: `rtsp://user:pass@host:554/interface/cameras/media?camera={Name}&Profile=Visualization`
4. Construct snapshot URLs: `http://host:5000/Interface/Cameras/GetSnapshot?Camera={Name}`

For complete Digifort API documentation, see:
- [`docs/specs/digifort/SPEC-DIGIFORT-API-EMULATION.md`](docs/specs/digifort/SPEC-DIGIFORT-API-EMULATION.md) — Full endpoint specification
- [`docs/specs/digifort/IMPLEMENTATION-PLAN-SPEC-DIGIFORT-API-EMULATION.md`](docs/specs/digifort/IMPLEMENTATION-PLAN-SPEC-DIGIFORT-API-EMULATION.md) — Implementation details

## Fault Modes

| Mode | Description | Test Case |
|---|---|---|
| `normal` | Clean stream | Normal operation |
| `freeze` | Frame freezes for 2–7 seconds randomly | Detect static stream in VMS |
| `green_screen` | Green screen (`#00FF00`) | Detect camera signal loss |
| `noise` | Analog-style visual interference | Video quality analysis |
| `black` | Total black screen | Lens cap / power loss |
| `pixelate` | Pixelated blocks | Bitrate degradation / packet loss |
| `disconnect` | Stream drops (no frames / HTTP 503) | NVR reconnection timeout |

The **fault probability** (0–100%) defines how frequently the fault is triggered. Faults last a few seconds and stream automatically recovers.

## Project Structure

```
rtsp-simulator/
├── client/                 # Frontend React + Vite
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       ├── pages/
│       │   ├── Dashboard.tsx     # Camera monitor
│       │   └── CameraConfig.tsx  # Fault injection config
│       └── components/
├── server/                 # Backend Express
│   ├── index.ts            # Entry point
│   ├── routes.ts           # MJPEG streams + REST API + Digifort endpoints
│   ├── storage.ts          # In-memory state
│   └── frameGenerator.ts   # Canvas-based JPEG frame generation
├── shared/
│   └── schema.ts           # Shared types (Camera, FaultMode, StreamStats)
├── docs/
│   └── specs/
│       └── digifort/       # Digifort API specifications & implementation guide
├── script/
│   └── build.ts            # Build script
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

## Key Features

- ✅ **8 Virtual Cameras** with animated scenes (parking lot, corridor, entrance, server room, warehouse, outdoor)
- ✅ **Configurable Faults** (freeze, green screen, noise, black screen, pixelation, disconnection)
- ✅ **HTTP/MJPEG Streaming** for direct NVR integration
- ✅ **REST API** for camera configuration and monitoring
- ✅ **Digifort API Emulation** (GetStatus, GetSnapshot) for AlertaHub and Digifort clients
- ✅ **Web Dashboard** to monitor and control cameras in real-time
- ✅ **Docker Support** for containerized deployment
- ✅ **TypeScript** for type safety
- ✅ **Zero Hardware Required** — fully simulated cameras with realistic scenarios

## License

MIT

---

Built with [Perplexity Computer](https://www.perplexity.ai/computer)
