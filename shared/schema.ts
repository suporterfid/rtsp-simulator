import { z } from "zod";

export type FaultMode = "normal" | "freeze" | "green_screen" | "noise" | "black" | "pixelate" | "disconnect";

export interface Camera {
  id: string;
  name: string;
  resolution: string;
  fps: number;
  faultMode: FaultMode;
  faultProbability: number; // 0-100 %
  scene: "parking" | "corridor" | "entrance" | "server_room" | "warehouse" | "outdoor";
  enabled: boolean;
  bitrate: number; // kbps simulated
}

export const cameraSchema = z.object({
  id: z.string(),
  name: z.string(),
  resolution: z.string(),
  fps: z.number().min(1).max(60),
  faultMode: z.enum(["normal", "freeze", "green_screen", "noise", "black", "pixelate", "disconnect"]),
  faultProbability: z.number().min(0).max(100),
  scene: z.enum(["parking", "corridor", "entrance", "server_room", "warehouse", "outdoor"]),
  enabled: z.boolean(),
  bitrate: z.number(),
});

export const updateCameraSchema = cameraSchema.partial().omit({ id: true });
export type UpdateCamera = z.infer<typeof updateCameraSchema>;

export interface StreamStats {
  cameraId: string;
  framesSent: number;
  bytesSent: number;
  activeClients: number;
  uptime: number;
  lastFaultAt: number | null;
}
