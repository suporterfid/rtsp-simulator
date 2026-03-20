# IMPLEMENTATION PLAN: Digifort HTTP API Emulation

**Status:** Ready for Implementation
**Target File:** `server/routes.ts`
**Scope:** Add 2 HTTP endpoints (GetStatus, GetSnapshot)
**Complexity:** Low (straightforward data transformation, no new dependencies, reuse existing functions)
**Estimated Time:** 30–45 minutes (including testing)

---

## Overview

This document provides a step-by-step implementation guide for adding Digifort-compatible HTTP endpoints to the rtsp-simulator, as specified in `docs/specs/digifort/SPEC-DIGIFORT-API-EMULATION.md`.

### Scope of Changes
- **Files to modify:** `server/routes.ts` (only)
- **Files created:** None
- **New dependencies:** None
- **Breaking changes:** None (endpoints coexist with existing `/api/*` routes)

### Deliverables
1. `GET /Interface/Cameras/GetStatus?ResponseFormat=JSON` — Returns all cameras with Digifort-compatible schema
2. `GET /Interface/Cameras/GetSnapshot?Camera={name}&ResponseFormat=JSON` — Returns JPEG snapshot for named camera

---

## Prerequisites

- Node.js 18+, npm 9+
- Project already built: `npm install` completed
- Familiar with Express.js route handlers
- Read `SPEC-DIGIFORT-API-EMULATION.md` before implementing

---

## Task 1: Implement GetStatus Endpoint

### Location
File: `server/routes.ts`
Insert at: End of `registerRoutes()` function, **before** `return httpServer` statement
After: The `/snapshot/:id` handler (line ~150)

### Implementation

```typescript
// ====== Digifort API Endpoints ======

// GET /Interface/Cameras/GetStatus?ResponseFormat=JSON
// Returns all cameras with Digifort-compatible schema
app.get("/Interface/Cameras/GetStatus", async (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  const responseFormat = _req.query.ResponseFormat as string | undefined;
  if (responseFormat && responseFormat !== "JSON") {
    return res.status(400).json({ error: "ResponseFormat not supported" });
  }

  try {
    const cameras = await storage.getCameras();
    const stats = await storage.getStats();

    // Build a map of stats by cameraId for efficient lookup
    const statsMap = new Map(stats.map(s => [s.cameraId, s]));

    // Transform cameras to Digifort format
    const cameraList = cameras.map(cam => {
      const stat = statsMap.get(cam.id);
      return {
        Name: cam.name,
        RecordingFPS: (cam.enabled && cam.faultMode !== "disconnect") ? cam.fps : 0,
        UsedDiskSpace: stat?.bytesSent ?? 0,
        ConfiguredToRecord: cam.enabled,
      };
    });

    return res.json({
      Response: {
        Data: {
          Cameras: cameraList,
        },
      },
    });
  } catch (err) {
    console.error("GetStatus error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
```

### Explanation

| Line | Purpose |
|------|---------|
| `res.set("Access-Control-Allow-Origin", "*")` | Allow cross-origin requests (matching `/stream/:id` pattern) |
| `_req.query.ResponseFormat` | Extract query parameter; ignore if not present |
| `400 if ... !== "JSON"` | Validate ResponseFormat value per spec |
| `statsMap = new Map(...)` | Build O(1) lookup map to avoid O(n²) double loop |
| `cam.faultMode !== "disconnect"` | Offline cameras report RecordingFPS = 0 |
| `stat?.bytesSent ?? 0` | Use stat's bytesSent if available, else 0 |
| `{ Response: { Data: { Cameras: [...] } } }` | Wrap in Digifort envelope per spec |

### Test Case (GetStatus)

```bash
curl "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | jq .
```

**Expected response structure:**
```json
{
  "Response": {
    "Data": {
      "Cameras": [
        { "Name": "Câmera 01 — Estacionamento", "RecordingFPS": 25, "UsedDiskSpace": 0, "ConfiguredToRecord": true },
        { "Name": "Câmera 02 — Corredor A", "RecordingFPS": 25, "UsedDiskSpace": 0, "ConfiguredToRecord": true },
        ...
      ]
    }
  }
}
```

**Validation checklist:**
- [ ] Response has `Response.Data.Cameras` structure
- [ ] All 8 cameras are present
- [ ] Disabled cameras (cam-08) have `RecordingFPS: 0`
- [ ] Cameras with `faultMode: "disconnect"` (cam-07) have `RecordingFPS: 0`
- [ ] Enabled cameras have `RecordingFPS > 0`
- [ ] All cameras have `UsedDiskSpace` (integer)

---

## Task 2: Implement GetSnapshot Endpoint

### Location
File: `server/routes.ts`
Insert at: Immediately after GetStatus endpoint (same function block)

### Implementation

```typescript
// GET /Interface/Cameras/GetSnapshot?Camera={cameraName}&ResponseFormat=JSON
// Returns binary JPEG snapshot for a specific camera (by name, case-sensitive)
app.get("/Interface/Cameras/GetSnapshot", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  const cameraName = req.query.Camera as string | undefined;

  // Validate required parameter
  if (!cameraName) {
    return res.status(400).json({ error: "Camera parameter is required" });
  }

  try {
    // Look up camera by name (case-sensitive, matching Digifort behavior)
    const cameras = await storage.getCameras();
    const cam = cameras.find(c => c.name === cameraName);

    if (!cam) {
      return res.status(404).json({ error: `Camera '${cameraName}' not found` });
    }

    // Check if camera is online
    if (!cam.enabled || cam.faultMode === "disconnect") {
      return res.status(503).json({
        error: `Camera '${cameraName}' is offline or disconnected`,
      });
    }

    // Generate frame using existing frame generator
    const frame = await generateFrame(cam);

    if (!frame) {
      // Disconnect fault returned null
      return res.status(503).json({
        error: `Camera '${cameraName}' is offline or disconnected`,
      });
    }

    // Return JPEG binary
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-cache");
    return res.send(frame);
  } catch (err) {
    console.error(`GetSnapshot error for camera '${cameraName}':`, err);
    return res.status(500).json({ error: "Frame generation error" });
  }
});
```

### Explanation

| Line | Purpose |
|------|---------|
| `req.query.Camera` | Extract camera name from query string (case-sensitive) |
| `cameras.find(c => c.name === cameraName)` | Look up by exact name (no ID-based lookup) |
| `!cam.enabled \|\| cam.faultMode === "disconnect"` | Return 503 for offline/disconnected cameras |
| `generateFrame(cam)` | Reuse existing frame generation logic |
| `!frame` | Handle null return from generateFrame (disconnect fault) |
| `Content-Type: image/jpeg` | Signal binary JPEG response |
| `Cache-Control: no-cache` | Force client to not cache snapshot |

### Test Cases (GetSnapshot)

**Success case:**
```bash
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=Câmera%2001%20%E2%80%94%20Estacionamento" \
  -o cam01.jpg \
  -w "\nStatus: %{http_code}\n"
```

Expected: HTTP 200, binary JPEG saved to `cam01.jpg`

**Missing Camera parameter:**
```bash
curl "http://localhost:5000/Interface/Cameras/GetSnapshot" \
  -w "\nStatus: %{http_code}\n"
```

Expected: HTTP 400, JSON error: `{"error": "Camera parameter is required"}`

**Unknown camera name:**
```bash
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=UnknownCamera" \
  -w "\nStatus: %{http_code}\n"
```

Expected: HTTP 404, JSON error: `{"error": "Camera 'UnknownCamera' not found"}`

**Offline camera (disconnect fault):**
```bash
# cam-07 has faultMode: "disconnect"
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=Câmera%2007%20%E2%80%94%20PTZ%20Externo" \
  -w "\nStatus: %{http_code}\n"
```

Expected: HTTP 503, JSON error: `{"error": "Camera '...' is offline or disconnected"}`

**Disabled camera:**
```bash
# cam-08 has enabled: false
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=Câmera%2008%20%E2%80%94%20Acesso%20Lateral" \
  -w "\nStatus: %{http_code}\n"
```

Expected: HTTP 503, JSON error: `{"error": "Camera '...' is offline or disconnected"}`

**Validation checklist:**
- [ ] Success returns HTTP 200 + binary JPEG data
- [ ] Missing `Camera` param returns HTTP 400 + JSON error
- [ ] Unknown camera name returns HTTP 404 + JSON error
- [ ] Disabled camera returns HTTP 503 + JSON error
- [ ] Camera with `faultMode: "disconnect"` returns HTTP 503
- [ ] Response headers include `Content-Type: image/jpeg`
- [ ] Response headers include `Cache-Control: no-cache`

---

## Task 3: Route Registration Verification

### Verification: Ensure Routes Coexist

Both endpoints are registered in `registerRoutes()` in `server/routes.ts`. Verify that:

1. **Routes are registered BEFORE** `return httpServer` statement at the end of the function
2. **No conflicts** with existing `/api/*` and `/stream/*` routes (they use different base paths)
3. **Vite catch-all** (in dev mode) does not interfere: Vite is set up **after** `registerRoutes()` completes in `server/index.ts`

**Check registration order in `server/index.ts`:**
```typescript
(async () => {
  await registerRoutes(httpServer, app);        // ← Digifort routes registered here

  app.use((err, _req, res, next) => { ... });   // Error handler

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);                           // Static files (prod)
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);           // ← Vite set up AFTER routes (dev)
  }

  httpServer.listen({...});                     // Start server
})();
```

**No changes needed to `server/index.ts`** — the existing order is correct.

---

## Integration Testing

### Test 1: Development Server

```bash
cd C:\workspace-offline\rtsp-simulator

# Start dev server
npm run dev
# Expected: listening on port 5000

# In another terminal:

# Test GetStatus
curl "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | jq '.Response.Data.Cameras | length'
# Expected: 8

# Test GetSnapshot with URL-encoded camera name
CAMERA_NAME="Câmera%2001%20%E2%80%94%20Estacionamento"
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=${CAMERA_NAME}" \
  -o /tmp/snap.jpg && file /tmp/snap.jpg
# Expected: JPEG image data
```

### Test 2: Basic Auth (Optional — Not Validated)

The Digifort API uses Basic Auth. The simulator accepts but ignores credentials:

```bash
# With Authorization header
curl -u admin:admin "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | jq '.Response.Data.Cameras[0].Name'

# With embedded URL credentials (Digifort style)
curl "http://admin:admin@localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | jq '.Response.Data.Cameras[0].Name'

# Both should work and return the same result
```

### Test 3: CORS Headers

```bash
curl -i "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON" | grep -i "access-control"
# Expected: Access-Control-Allow-Origin: *
```

### Test 4: Integration with Existing Endpoints

Verify that existing routes still work alongside Digifort routes:

```bash
# Native API still works
curl "http://localhost:5000/api/cameras" | jq 'length'
# Expected: 8

# Native snapshot still works
curl "http://localhost:5000/snapshot/cam-01" -o /tmp/native.jpg
# Expected: JPEG image

# Digifort snapshot works
curl "http://localhost:5000/Interface/Cameras/GetSnapshot?Camera=Câmera%2001%20%E2%80%94%20Estacionamento" -o /tmp/digifort.jpg
# Expected: JPEG image (same dimensions as native)
```

---

## Implementation Checklist

### Pre-Implementation
- [ ] Read `SPEC-DIGIFORT-API-EMULATION.md` completely
- [ ] Review existing route handlers in `server/routes.ts`
- [ ] Understand `Camera` and `StreamStats` types from `shared/schema.ts`

### Implementation (GetStatus)
- [ ] Add GetStatus route handler to `server/routes.ts`
- [ ] Set `Access-Control-Allow-Origin: *` header
- [ ] Validate `ResponseFormat` parameter
- [ ] Fetch cameras and stats from storage
- [ ] Build statsMap for O(1) lookup
- [ ] Map each camera to Digifort format
- [ ] Test: `curl "http://localhost:5000/Interface/Cameras/GetStatus?ResponseFormat=JSON"`
- [ ] Verify: 8 cameras in response
- [ ] Verify: Disabled/disconnect cameras have RecordingFPS: 0

### Implementation (GetSnapshot)
- [ ] Add GetSnapshot route handler to `server/routes.ts`
- [ ] Set `Access-Control-Allow-Origin: *` header
- [ ] Validate `Camera` parameter (required)
- [ ] Lookup camera by name (case-sensitive)
- [ ] Check enabled + faultMode conditions
- [ ] Call `generateFrame(cam)` and return JPEG
- [ ] Test: Success case with existing camera name (URL-encoded)
- [ ] Test: 400 for missing `Camera` param
- [ ] Test: 404 for unknown camera name
- [ ] Test: 503 for disabled/disconnect camera
- [ ] Verify: `Content-Type: image/jpeg` header

### Post-Implementation
- [ ] Run `npm run check` (TypeScript validation)
- [ ] Run `npm run dev` (dev server startup)
- [ ] Test all 9 curl commands (GetStatus + GetSnapshot success/error cases)
- [ ] Verify native routes still work (`/api/cameras`, `/snapshot/:id`)
- [ ] Test with both `-u user:pass` and `http://user:pass@host` auth styles
- [ ] Commit changes (message: "feat: add Digifort API endpoints (GetStatus, GetSnapshot)")

---

## Code Diff Summary

**File: `server/routes.ts`**

```diff
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ... existing routes (/api/cameras, /api/stats, /stream/:id, /snapshot/:id) ...

  // Single JPEG snapshot
  app.get("/snapshot/:id", async (req: Request, res: Response) => {
    // ... existing implementation ...
  });

+ // ====== Digifort API Endpoints ======
+
+ // GET /Interface/Cameras/GetStatus?ResponseFormat=JSON
+ app.get("/Interface/Cameras/GetStatus", async (_req, res) => {
+   // ... GetStatus implementation (lines ~X–Y) ...
+ });
+
+ // GET /Interface/Cameras/GetSnapshot?Camera={cameraName}
+ app.get("/Interface/Cameras/GetSnapshot", async (req, res) => {
+   // ... GetSnapshot implementation (lines ~Y–Z) ...
+ });

  return httpServer;
}
```

**Total lines added:** ~85 lines (GetStatus: ~35, GetSnapshot: ~50)
**No deletions or modifications to existing code**

---

## Troubleshooting

### Issue: "Camera not found" (404) when using correct name

**Cause:** Camera name is case-sensitive. The lookup uses exact string match.

**Solution:** Double-check the camera name:
```typescript
// From storage.ts DEFAULT_CAMERAS:
{ id: "cam-01", name: "Câmera 01 — Estacionamento", ... }
```

Use the exact name, including special characters and case.

### Issue: GetSnapshot returns "no signal" (503) for enabled camera

**Cause:** `faultMode === "disconnect"` causes the endpoint to return 503.

**Solution:** Check the camera's `faultMode`:
- `cam-07` has `faultMode: "disconnect"` — always returns 503
- Use a different camera or change the fault mode via `/api/cameras/{id}` PATCH

### Issue: GetStatus returns empty or wrong BytesSent values

**Cause:** Statistics are only updated when a stream is actively transmitting frames.

**Solution:** Either:
1. Subscribe to the MJPEG stream first: `curl http://localhost:5000/stream/{id}` (in background)
2. Or accept that idle cameras show `bytesSent: 0`

### Issue: Route returns 500 error

**Cause:** Exception in route handler (check console logs).

**Solution:**
1. Verify `storage.getCameras()` and `storage.getStats()` don't throw
2. Check Express error logs in terminal
3. Verify TypeScript types in `shared/schema.ts`

---

## Deployment Notes

### Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

The Digifort routes are compiled into `dist/index.cjs` alongside all other routes.

### Port Configuration

By default, the server runs on port 5000. To use the Digifort-standard port 8601:

```bash
PORT=8601 NODE_ENV=production node dist/index.cjs
```

Or behind a reverse proxy configured to listen on 8601 and forward to 5000.

---

## References

- **Spec:** `docs/specs/digifort/SPEC-DIGIFORT-API-EMULATION.md` — Full endpoint specification with examples
- **Field Mapping:** `docs/specs/digifort/FIELD_MAPPING_DIGIFORT_ALERTAHUB.md` — Digifort ↔ AlertaHub field mapping
- **Source Files:**
  - `server/routes.ts` — Route handlers
  - `server/storage.ts` — MemStorage class
  - `server/frameGenerator.ts` — Frame generation
  - `shared/schema.ts` — Camera and StreamStats types

---

**Document Version:** 1.0
**Created:** March 2026
**Status:** Ready for Implementation
