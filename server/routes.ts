import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { updateCameraSchema } from "@shared/schema";
import { generateFrame } from "./frameGenerator";

// Track active MJPEG streams per camera
const activeStreams: Record<string, Set<Response>> = {};
const streamIntervals: Record<string, ReturnType<typeof setInterval>> = {};
const startTimes: Record<string, number> = {};

function ensureStreamLoop(cameraId: string, fps: number) {
  if (streamIntervals[cameraId]) return;
  startTimes[cameraId] = Date.now();
  const intervalMs = Math.max(33, Math.round(1000 / fps));

  streamIntervals[cameraId] = setInterval(async () => {
    const clients = activeStreams[cameraId];
    if (!clients || clients.size === 0) return;

    const cam = await storage.getCamera(cameraId);
    if (!cam) return;

    let frameBuffer: Buffer | null = null;
    try {
      frameBuffer = await generateFrame(cam);
    } catch (_e) {
      return;
    }

    const stat = await storage.getStat(cameraId);
    const uptime = (Date.now() - startTimes[cameraId]) / 1000;
    await storage.updateStat(cameraId, {
      activeClients: clients.size,
      framesSent: (stat?.framesSent ?? 0) + (frameBuffer ? clients.size : 0),
      bytesSent: (stat?.bytesSent ?? 0) + (frameBuffer ? frameBuffer.length * clients.size : 0),
      uptime: Math.round(uptime),
      lastFaultAt: cam.faultMode !== "normal" && cam.faultProbability > 0 && Math.random() < cam.faultProbability / 100 / 25
        ? Date.now() : stat?.lastFaultAt ?? null,
    });

    const toRemove: Response[] = [];
    for (const res of clients) {
      try {
        if (frameBuffer) {
          res.write(`--mjpegboundary\r\nContent-Type: image/jpeg\r\nContent-Length: ${frameBuffer.length}\r\n\r\n`);
          res.write(frameBuffer);
          res.write("\r\n");
        } else {
          // Disconnect mode — briefly stall
        }
      } catch {
        toRemove.push(res);
      }
    }
    for (const res of toRemove) clients.delete(res);
  }, intervalMs);
}

function stopStreamLoop(cameraId: string) {
  if (streamIntervals[cameraId]) {
    clearInterval(streamIntervals[cameraId]);
    delete streamIntervals[cameraId];
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // GET all cameras
  app.get("/api/cameras", async (_req, res) => {
    res.json(await storage.getCameras());
  });

  // GET single camera
  app.get("/api/cameras/:id", async (req, res) => {
    const cam = await storage.getCamera(req.params.id);
    if (!cam) return res.status(404).json({ error: "Not found" });
    res.json(cam);
  });

  // PATCH camera config
  app.patch("/api/cameras/:id", async (req, res) => {
    const parsed = updateCameraSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const cam = await storage.updateCamera(req.params.id, parsed.data);
    if (!cam) return res.status(404).json({ error: "Not found" });
    // Restart stream loop with new fps if changed
    if (parsed.data.fps) {
      stopStreamLoop(cam.id);
      if (cam.enabled) ensureStreamLoop(cam.id, cam.fps);
    }
    res.json(cam);
  });

  // GET stats
  app.get("/api/stats", async (_req, res) => {
    res.json(await storage.getStats());
  });

  // MJPEG stream endpoint
  app.get("/stream/:id", async (req: Request, res: Response) => {
    const cam = await storage.getCamera(req.params.id);
    if (!cam) return res.status(404).json({ error: "Camera not found" });
    if (!cam.enabled) {
      res.status(503).send("Camera disabled");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=mjpegboundary",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "close",
      "Access-Control-Allow-Origin": "*",
    });

    if (!activeStreams[cam.id]) activeStreams[cam.id] = new Set();
    activeStreams[cam.id].add(res);
    ensureStreamLoop(cam.id, cam.fps);

    req.on("close", () => {
      activeStreams[cam.id]?.delete(res);
      if (activeStreams[cam.id]?.size === 0) {
        stopStreamLoop(cam.id);
      }
    });
  });

  // Single JPEG snapshot
  app.get("/snapshot/:id", async (req: Request, res: Response) => {
    const cam = await storage.getCamera(req.params.id);
    if (!cam) return res.status(404).json({ error: "Camera not found" });
    try {
      const frame = await generateFrame(cam);
      if (!frame) {
        res.status(503).send("No signal");
        return;
      }
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "no-cache");
      res.send(frame);
    } catch (e) {
      res.status(500).send("Frame generation error");
    }
  });

  // ====== Digifort API Endpoints ======

  // GET /Interface/Cameras/GetStatus?ResponseFormat=JSON
  // Returns all cameras with Digifort-compatible schema
  app.get("/Interface/Cameras/GetStatus", async (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    const responseFormat = _req.query.ResponseFormat as string | string[] | undefined;
    if (responseFormat && (typeof responseFormat !== 'string' || responseFormat !== "JSON")) {
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

  // GET /Interface/Cameras/GetSnapshot?Camera={cameraName}&ResponseFormat=JSON
  // Returns binary JPEG snapshot for a specific camera (by name, case-sensitive)
  app.get("/Interface/Cameras/GetSnapshot", async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    const cameraNameParam = req.query.Camera as string | string[] | undefined;

    // Validate required parameter
    if (!cameraNameParam || typeof cameraNameParam !== 'string') {
      return res.status(400).json({ error: "Camera parameter is required" });
    }

    const cameraName = cameraNameParam as string;

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

  return httpServer;
}
