# SPEC: Digifort HTTP API Emulation

## Overview

This document specifies how the **rtsp-simulator** can expose additional HTTP endpoints that emulate the Digifort VMS API surface. These endpoints allow external clients (such as AlertaHub Vision/Core, or other NVR integration platforms) to point at the simulator as if it were a real Digifort server, without requiring access to an actual Digifort installation.

### Purpose
- Enable testing of Digifort API integrations in isolation
- Provide a lightweight, configurable mock for camera discovery, status monitoring, and snapshot retrieval
- Maintain compatibility with Digifort HTTP API request/response formats (per `DIGIFORT_API_SPEC.md`)

### Scope
- **Included:** HTTP endpoints (`GetStatus`, `GetSnapshot`) and Basic Auth handling
- **Excluded:** RTSP streaming (separate from HTTP API), Windows Registry simulation, Digifort service bus, PTZ commands, analytics API

### Base URL Pattern
```
http://{host}:{port}/Interface/Cameras/{endpoint}
```

**Default ports:**
- Development: `5000` (configured via `PORT` env var or `.env`)
- Production compatible: Set `PORT=8601` when deploying as a Digifort-compatible NVR mock

### Authentication
- **Type:** HTTP Basic Auth (accepted but not validated)
- **Format:** `Authorization: Basic {base64(username:password)}`
- **Behavior:** Credentials are **ignored** in the simulator (it is an open test tool by design). Any username/password combination is accepted.
- **CORS:** All origins permitted (`Access-Control-Allow-Origin: *`)

---

## Existing Endpoints (Native API)

For reference, the simulator's native endpoints are:

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| `GET` | `/api/cameras` | List all cameras | JSON array |
| `GET` | `/api/cameras/:id` | Get single camera | JSON object or 404 |
| `PATCH` | `/api/cameras/:id` | Update camera config | JSON object or 400/404 |
| `GET` | `/api/stats` | Get stream statistics | JSON array |
| `GET` | `/stream/:id` | Live MJPEG stream | `multipart/x-mixed-replace` binary |
| `GET` | `/snapshot/:id` | Single JPEG frame | `image/jpeg` binary |

These are **not** affected by the Digifort API emulation; they coexist on the same server.

---

## New: Digifort-Compatible Endpoints

### 1. GetStatus — List All Cameras with Health Metrics

**Request**
```
GET /Interface/Cameras/GetStatus?ResponseFormat=JSON HTTP/1.1
Host: {host}:{port}
Authorization: Basic {base64}
```

**Query Parameters**

| Name | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `ResponseFormat` | string | Yes | — | Must be `JSON`. Other values are reserved for future XML/CSV formats. |

**Response — 200 OK**
```
Content-Type: application/json

{
  "Response": {
    "Data": {
      "Cameras": [
        {
          "Name": "cam-01",
          "RecordingFPS": 30,
          "UsedDiskSpace": 1073741824,
          "ConfiguredToRecord": true
        },
        {
          "Name": "cam-02",
          "RecordingFPS": 0,
          "UsedDiskSpace": 0,
          "ConfiguredToRecord": false
        }
      ]
    }
  }
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `Name` | string | Camera identifier (maps to `Camera.name` in simulator). Case-sensitive. |
| `RecordingFPS` | integer | Current recording frame rate. **0** = offline/disabled/no-signal. Positive integer = actively streaming. |
| `UsedDiskSpace` | integer | Cumulative bytes sent by this camera stream since server start. Derived from `StreamStats.bytesSent`. |
| `ConfiguredToRecord` | boolean | Whether recording is enabled. Maps to `Camera.enabled`. |

**Field Mapping (Simulator → Digifort)**

| Simulator Field | Digifort Output | Logic |
|-----------------|-----------------|-------|
| `Camera.name` | `Name` | Direct mapping |
| `Camera.fps` | `RecordingFPS` | If `enabled && faultMode !== "disconnect"`: use `fps`; else: use `0` |
| `StreamStats.bytesSent` | `UsedDiskSpace` | Cumulative bytes transmitted (0 if no active stream) |
| `Camera.enabled` | `ConfiguredToRecord` | Direct mapping |

**Error Responses**

| Status | Condition | Response |
|--------|-----------|----------|
| `500` | Storage layer unavailable | `{"error": "Internal server error"}` |
| `400` | Invalid `ResponseFormat` parameter | `{"error": "ResponseFormat not supported"}` |

**Example: cURL Request**
```bash
curl -u admin:admin http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON
```

**Example: cURL with Credentials in URL** (Digifort style)
```bash
curl http://admin:admin@localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON
```

---

### 2. GetSnapshot — Capture Live Camera Frame

**Request**
```
GET /Interface/Cameras/GetSnapshot?Camera={cameraName}&ResponseFormat=JSON HTTP/1.1
Host: {host}:{port}
Authorization: Basic {base64}
```

**Query Parameters**

| Name | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `Camera` | string | Yes | — | Exact camera name (case-sensitive). Must match `Camera.name`. |
| `ResponseFormat` | string | No | — | Accepted for compatibility; always returns binary JPEG regardless of value. |

**Response — 200 OK** (Success)
```
Content-Type: image/jpeg
Content-Length: {size}

{binary JPEG data}
```

**Response — 400 Bad Request** (Missing Camera parameter)
```json
{
  "error": "Camera parameter is required"
}
```

**Response — 404 Not Found** (Camera not found)
```json
{
  "error": "Camera '{cameraName}' not found"
}
```

**Response — 503 Service Unavailable** (Camera disabled or no signal)
```json
{
  "error": "Camera '{cameraName}' is offline or disconnected"
}
```

**Internal Processing**
1. Validate `Camera` parameter is present → return 400 if missing
2. Lookup camera by `Camera.name` (case-sensitive) → return 404 if not found
3. Check `Camera.enabled && Camera.faultMode !== "disconnect"` → return 503 if false
4. Call `generateFrame(cameraId)` from `server/frameGenerator.ts`
5. Return raw JPEG binary with `Content-Type: image/jpeg`

**Timeout:** Recommended client timeout is **10 seconds** (as per real Digifort behavior)

**Example: cURL Request**
```bash
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=cam-01" > snapshot.jpg
```

**Example: Save Snapshot from URL-encoded Auth**
```bash
curl "http://admin:admin@localhost:5000/Interface/Cameras/GetSnapshot?Camera=cam-01&ResponseFormat=JSON" -o snapshot.jpg
```

---

## Request/Response Examples

### Example 1: GetStatus with Mixed Camera States

**Request**
```bash
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | jq .
```

**Response**
```json
{
  "Response": {
    "Data": {
      "Cameras": [
        {
          "Name": "cam-01",
          "RecordingFPS": 30,
          "UsedDiskSpace": 2147483648,
          "ConfiguredToRecord": true
        },
        {
          "Name": "cam-02",
          "RecordingFPS": 15,
          "UsedDiskSpace": 1024000000,
          "ConfiguredToRecord": true
        },
        {
          "Name": "cam-03",
          "RecordingFPS": 0,
          "UsedDiskSpace": 0,
          "ConfiguredToRecord": false
        },
        {
          "Name": "cam-04",
          "RecordingFPS": 0,
          "UsedDiskSpace": 500000000,
          "ConfiguredToRecord": true
        }
      ]
    }
  }
}
```

**Interpretation:**
- `cam-01`: Online, recording at 30 FPS, 2 GB transmitted
- `cam-02`: Online, recording at 15 FPS (degraded), ~1 GB transmitted
- `cam-03`: Offline (disabled), no transmission
- `cam-04`: Online but no signal (fault mode = "disconnect"), stored bytes are from prior streams

### Example 2: GetSnapshot Success

**Request**
```bash
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=cam-01" \
  -H "Accept: image/jpeg" \
  --output cam-01.jpg \
  -v
```

**Response Headers**
```
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 45678
```

**Response Body:** Binary JPEG image data

### Example 3: GetSnapshot — Camera Not Found

**Request**
```bash
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=nonexistent"
```

**Response**
```
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "Camera 'nonexistent' not found"
}
```

### Example 4: GetSnapshot — Camera Offline (Disconnected)

**Request**
```bash
# Assume cam-08 has faultMode: "disconnect"
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=cam-08"
```

**Response**
```
HTTP/1.1 503 Service Unavailable
Content-Type: application/json

{
  "error": "Camera 'cam-08' is offline or disconnected"
}
```

---

## Field Mapping Reference Table

Complete mapping between simulator internal state (MemStorage) and Digifort API response fields:

| Simulator (Storage) | Digifort Field | Type | Derivation |
|-------------------|----------------|------|-----------|
| `Camera.name` | `GetStatus[].Name` | string | Direct |
| `Camera.name` | `GetSnapshot Camera param` | string | Direct (case-sensitive lookup) |
| `Camera.fps` | `GetStatus[].RecordingFPS` | int | If `enabled && faultMode !== "disconnect"`: `fps`, else `0` |
| `Camera.enabled` | `GetStatus[].ConfiguredToRecord` | bool | Direct |
| `StreamStats.bytesSent` | `GetStatus[].UsedDiskSpace` | int | Per-camera cumulative bytes; `0` if no stream active |
| `Camera.faultMode` | HTTP status on GetSnapshot | int | If `"disconnect"` or `enabled=false`: `503`; else: `200` |
| `Camera.faultMode` | Frame content (GetSnapshot) | JPEG | Passed to `generateFrame()` which applies fault rendering (freeze, green_screen, noise, etc.) |

---

## Port & Deployment Notes

### Development (Default)
- Run `npm run dev` → Express + Vite on **port 5000**
- Digifort endpoints accessible at `http://localhost:5000/Interface/Cameras/...`

### Production / Digifort-Compatible Port
To emulate a real Digifort server listening on the standard API port (8601):
```bash
PORT=8601 NODE_ENV=production node dist/index.cjs
```

Or set in `.env`:
```
PORT=8601
```

### Reverse Proxy Setup (Recommended)
For clients expecting exactly `http://host:8601/Interface/Cameras/...`, use a reverse proxy:
```nginx
# Nginx example
upstream simulator {
  server localhost:5000;
}

server {
  listen 8601;
  server_name _;

  location /Interface/Cameras/ {
    proxy_pass http://simulator;
    proxy_set_header Authorization $http_authorization;
    proxy_pass_header Authorization;
  }

  location /api/ {
    proxy_pass http://simulator;
  }
}
```

### TLS/HTTPS
The emulation does **not** implement HTTPS. If the client requires HTTPS:
- Use a reverse proxy with TLS termination
- Or configure the reverse proxy to strip SSL and forward HTTP to the simulator

### CORS Behavior
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Comparison: Digifort API vs. Simulator Native API

When testing with Digifort-compatible clients, you have two options:

| Use Case | Endpoint | Response Format | Notes |
|----------|----------|-----------------|-------|
| Test Digifort-specific integration | `/Interface/Cameras/GetStatus` | Digifort JSON | Use this if client expects Digifort format |
| Test generic camera monitoring | `/api/cameras` | Native JSON (extended) | Use this for native simulator clients |
| Get health metrics (Digifort-style) | `/Interface/Cameras/GetStatus` | Digifort JSON (simple) | Limited fields (Name, RecordingFPS, UsedDiskSpace, ConfiguredToRecord) |
| Get detailed camera config | `/api/cameras/:id` | Native JSON (full) | Includes all simulator-specific fields (scene, faultMode, faultProbability, etc.) |
| Live MJPEG stream | `/stream/:id` | Binary MJPEG | Works with both API styles |
| Snapshot (native) | `/snapshot/:id` | Binary JPEG | Native simulator endpoint |
| Snapshot (Digifort-compatible) | `/Interface/Cameras/GetSnapshot?Camera=...` | Binary JPEG | Digifort-compatible endpoint |

---

## Limitations of Emulation

The simulator emulates only the core Digifort HTTP API surface. It does **not** implement:

1. **No Discovery of Cameras via Registry** — Digifort GetStatus does not discover cameras; it returns only pre-configured cameras. In the simulator, cameras are hard-coded (cam-01 through cam-08) and cannot be added via HTTP API. Use the native `/api/cameras` endpoints for full CRUD.

2. **No RTSP Endpoint** — The Digifort API reference includes RTSP URLs in responses for clients to call; the simulator focuses on HTTP only. RTSP is available natively via `/stream/:id`.

3. **No PTZ Commands** — Digifort supports PTZ (Pan/Tilt/Zoom) control via separate endpoints; the simulator has no PTZ API.

4. **No Analytics API** — Digifort provides analytics endpoints (port 8610) for custom analysis; not emulated.

5. **No LPR (License Plate Recognition)** — Digifort includes LPR endpoints; not emulated.

6. **No Mobile API** — Digifort has a separate Mobile Camera Server API (ports 8650–8652); not emulated.

7. **No Windows Registry Access** — Real Digifort configuration lives in Windows Registry (`HKLM\SOFTWARE\Digifort\...`); the simulator uses in-memory state.

8. **No Persistence** — All camera state resets on server restart. Real Digifort persists to a Firebird database.

9. **No SSL/TLS** — The simulator does not implement HTTPS; use a reverse proxy if needed.

10. **No Async Snapshots** — Real Digifort GetSnapshot is synchronous (one snapshot per HTTP request). Emulation is also synchronous; batch snapshot endpoints are not provided.

11. **No Auth Validation** — Credentials are not checked (all requests are accepted). In production, implement proper authentication middleware.

12. **Canvas Rendering Cap** — Snapshots are rendered at maximum 1280×720 regardless of the configured camera resolution. Real Digifort respects the configured resolution.

---

## Integration Notes for AlertaHub Vision/Core

When pointing AlertaHub Vision or AlertaHub Core at the simulator as a Digifort NVR:

### Vision Edge Configuration
```yaml
nvr:
  host: "localhost"
  port: 5000  # or 8601 if behind reverse proxy
  username: "admin"  # any value, will be ignored
  password: "admin"  # any value, will be ignored
  nvrBrand: "Digifort"
  protocol: "RTSP"
```

### Camera Discovery Flow
1. Call `GET /Interface/Cameras/GetStatus?ResponseFormat=JSON`
2. Parse `Response.Data.Cameras[].Name` to get camera list
3. For each camera, construct RTSP URL: `rtsp://user:pass@host:554/interface/cameras/media?camera={Name}&Profile=Visualization`
   - Note: RTSP is served natively by the simulator (no emulation needed)
4. Construct snapshot URL: `http://user:pass@host:5000/Interface/Cameras/GetSnapshot?Camera={Name}`

### Health Monitoring
- Poll `GET /Interface/Cameras/GetStatus?ResponseFormat=JSON` every 30–60 seconds
- Parse `RecordingFPS`: if `0`, camera is offline; if `> 0`, camera is online
- Track `UsedDiskSpace` delta over time to calculate bitrate: `((delta_bytes / delta_seconds) * 8) / 1024` = kbps

### Snapshot Retrieval for Technical Rounds
- Call `GET /Interface/Cameras/GetSnapshot?Camera={cameraName}` for each camera in the round
- Handle HTTP 503 gracefully (offline camera)
- Store returned JPEG as evidence

---

## Testing Checklist

When implementing or testing these endpoints:

- [ ] **GetStatus** returns valid JSON with `Response.Data.Cameras` structure
- [ ] **GetStatus** includes exactly 8 cameras (cam-01 through cam-08) by default
- [ ] **GetStatus** returns `RecordingFPS=0` for disabled or "disconnect" fault cameras
- [ ] **GetStatus** returns `RecordingFPS={camera.fps}` for enabled cameras without "disconnect" fault
- [ ] **GetStatus** returns `ConfiguredToRecord=true` for enabled cameras, `false` otherwise
- [ ] **GetStatus** includes `UsedDiskSpace` (integer, in bytes)
- [ ] **GetSnapshot** requires `Camera` parameter; returns 400 without it
- [ ] **GetSnapshot** returns 404 for unknown camera name
- [ ] **GetSnapshot** returns 503 for disabled or "disconnect" cameras
- [ ] **GetSnapshot** returns binary JPEG with `Content-Type: image/jpeg` header
- [ ] Basic Auth header is accepted (credentials ignored)
- [ ] URL-encoded credentials in URL are accepted: `http://user:pass@host:port/...`
- [ ] CORS headers allow cross-origin requests
- [ ] Both endpoints coexist with native `/api/` endpoints on the same server
- [ ] Reverse proxy correctly forwards to both Digifort and native endpoints

---

## References

- `docs/specs/digifort/DIGIFORT_API_SPEC.md` — Full Digifort HTTP API reference
- `docs/specs/digifort/FIELD_MAPPING_DIGIFORT_ALERTAHUB.md` — Field mapping tables for AlertaHub integration
- `docs/specs/digifort/SPEC-DIGIFORT_GUIDE.md` — Integration guide and feature specs
- `shared/schema.ts` — Camera, StreamStats, and FaultMode TypeScript types
- `server/routes.ts` — Current native API endpoint implementations
- `server/frameGenerator.ts` — JPEG frame generation logic
- `server/storage.ts` — MemStorage (in-memory camera state)

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Status:** Specification (not yet implemented)
