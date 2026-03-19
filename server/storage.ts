import { type Camera, type StreamStats, type FaultMode } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getCameras(): Promise<Camera[]>;
  getCamera(id: string): Promise<Camera | undefined>;
  updateCamera(id: string, patch: Partial<Camera>): Promise<Camera | undefined>;
  getStats(): Promise<StreamStats[]>;
  getStat(cameraId: string): Promise<StreamStats | undefined>;
  updateStat(cameraId: string, patch: Partial<StreamStats>): Promise<void>;
}

const DEFAULT_CAMERAS: Camera[] = [
  { id: "cam-01", name: "Câmera 01 — Estacionamento", resolution: "1920x1080", fps: 25, faultMode: "normal", faultProbability: 0, scene: "parking", enabled: true, bitrate: 2048 },
  { id: "cam-02", name: "Câmera 02 — Corredor A", resolution: "1280x720", fps: 25, faultMode: "freeze", faultProbability: 30, scene: "corridor", enabled: true, bitrate: 1024 },
  { id: "cam-03", name: "Câmera 03 — Entrada Principal", resolution: "1920x1080", fps: 30, faultMode: "green_screen", faultProbability: 50, scene: "entrance", enabled: true, bitrate: 2048 },
  { id: "cam-04", name: "Câmera 04 — Sala de Servidores", resolution: "1280x720", fps: 15, faultMode: "noise", faultProbability: 20, scene: "server_room", enabled: true, bitrate: 512 },
  { id: "cam-05", name: "Câmera 05 — Depósito", resolution: "1920x1080", fps: 25, faultMode: "black", faultProbability: 0, scene: "warehouse", enabled: true, bitrate: 2048 },
  { id: "cam-06", name: "Câmera 06 — Área Externa", resolution: "3840x2160", fps: 15, faultMode: "pixelate", faultProbability: 40, scene: "outdoor", enabled: true, bitrate: 8192 },
  { id: "cam-07", name: "Câmera 07 — PTZ Externo", resolution: "1920x1080", fps: 25, faultMode: "disconnect", faultProbability: 15, scene: "outdoor", enabled: true, bitrate: 4096 },
  { id: "cam-08", name: "Câmera 08 — Acesso Lateral", resolution: "1280x720", fps: 25, faultMode: "normal", faultProbability: 0, scene: "corridor", enabled: false, bitrate: 1024 },
];

export class MemStorage implements IStorage {
  private cameras: Map<string, Camera> = new Map();
  private stats: Map<string, StreamStats> = new Map();

  constructor() {
    for (const cam of DEFAULT_CAMERAS) {
      this.cameras.set(cam.id, { ...cam });
      this.stats.set(cam.id, {
        cameraId: cam.id,
        framesSent: 0,
        bytesSent: 0,
        activeClients: 0,
        uptime: 0,
        lastFaultAt: null,
      });
    }
  }

  async getCameras() { return Array.from(this.cameras.values()); }
  async getCamera(id: string) { return this.cameras.get(id); }

  async updateCamera(id: string, patch: Partial<Camera>) {
    const cam = this.cameras.get(id);
    if (!cam) return undefined;
    const updated = { ...cam, ...patch, id };
    this.cameras.set(id, updated);
    return updated;
  }

  async getStats() { return Array.from(this.stats.values()); }
  async getStat(cameraId: string) { return this.stats.get(cameraId); }

  async updateStat(cameraId: string, patch: Partial<StreamStats>) {
    const stat = this.stats.get(cameraId) ?? {
      cameraId, framesSent: 0, bytesSent: 0, activeClients: 0, uptime: 0, lastFaultAt: null,
    };
    this.stats.set(cameraId, { ...stat, ...patch });
  }
}

export const storage = new MemStorage();
