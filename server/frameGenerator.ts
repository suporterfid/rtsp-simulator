import { createCanvas, CanvasRenderingContext2D } from "canvas";
import type { Camera, FaultMode } from "@shared/schema";

// Per-camera state
const cameraState: Record<string, {
  frame: number;
  frozenBuffer: Buffer | null;
  frozenAt: number;
  currentFault: FaultMode | "normal";
  faultTimer: number;
}> = {};

function getState(cam: Camera) {
  if (!cameraState[cam.id]) {
    cameraState[cam.id] = { frame: 0, frozenBuffer: null, frozenAt: 0, currentFault: "normal", faultTimer: 0 };
  }
  return cameraState[cam.id];
}

function resolveDimensions(res: string): { w: number; h: number } {
  const [w, h] = res.split("x").map(Number);
  // Cap rendering at 1280x720 for performance; actual reported resolution can differ
  const scale = Math.min(1, 1280 / (w || 1280));
  return { w: Math.round((w || 1280) * scale), h: Math.round((h || 720) * scale) };
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Camera["scene"], frame: number) {
  const t = frame / 25; // time in seconds

  const palettes: Record<Camera["scene"], string[]> = {
    parking: ["#1a1a2e", "#16213e", "#0f3460"],
    corridor: ["#0d0d0d", "#1a1a1a", "#2d2d2d"],
    entrance: ["#e8e8e8", "#c0c0c0", "#a0a0a0"],
    server_room: ["#001a00", "#002800", "#003000"],
    warehouse: ["#2c2416", "#3d3220", "#4e402a"],
    outdoor: ["#1a3a5c", "#2d5a8e", "#3d7ab8"],
  };

  const cols = palettes[scene] || palettes.parking;

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, cols[0]);
  grad.addColorStop(0.5, cols[1]);
  grad.addColorStop(1, cols[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Scan lines effect
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.globalAlpha = 1;

  if (scene === "parking") {
    // Parking lines
    ctx.strokeStyle = "rgba(255,255,100,0.4)";
    ctx.lineWidth = 2;
    for (let x = 80; x < w; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.5);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // Moving car
    const carX = ((frame * 2) % (w + 100)) - 50;
    ctx.fillStyle = "rgba(60,60,60,0.9)";
    ctx.fillRect(carX, h * 0.55, 80, 40);
    ctx.fillStyle = "rgba(200,200,200,0.6)";
    ctx.fillRect(carX + 10, h * 0.55 + 5, 60, 20);
    // Headlights flicker
    if (frame % 3 === 0) {
      ctx.fillStyle = "rgba(255,255,200,0.8)";
      ctx.fillRect(carX + 70, h * 0.57, 15, 10);
    }
  } else if (scene === "corridor") {
    // Perspective lines
    ctx.strokeStyle = "rgba(150,150,150,0.3)";
    ctx.lineWidth = 1;
    const vanX = w / 2, vanY = h / 3;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(vanX, vanY);
      ctx.lineTo((w / 8) * i, h);
      ctx.stroke();
    }
    // Walking figure
    const figX = w / 2 + Math.sin(t * 0.5) * 80;
    const figSize = 30 + Math.sin(t * 0.5) * 10;
    ctx.fillStyle = "rgba(80,80,80,0.9)";
    ctx.fillRect(figX - figSize / 4, h / 2, figSize / 2, figSize);
    ctx.beginPath();
    ctx.arc(figX, h / 2, figSize / 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Flickering fluorescent
    if (Math.random() > 0.97) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, w, h);
    }
  } else if (scene === "entrance") {
    // Door frame
    ctx.fillStyle = "rgba(100,100,100,0.6)";
    ctx.fillRect(w * 0.35, h * 0.1, w * 0.3, h * 0.8);
    ctx.fillStyle = "rgba(200,220,255,0.3)";
    ctx.fillRect(w * 0.37, h * 0.12, w * 0.26, h * 0.76);
    // Person walking in
    const personX = w / 2 + Math.cos(t * 0.8) * (w * 0.15);
    ctx.fillStyle = "rgba(40,40,40,0.95)";
    ctx.fillRect(personX - 15, h * 0.3, 30, 60);
    ctx.beginPath();
    ctx.arc(personX, h * 0.28, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (scene === "server_room") {
    // Server racks
    for (let rack = 0; rack < 5; rack++) {
      ctx.fillStyle = "rgba(20,20,20,0.9)";
      ctx.fillRect(w * 0.1 + rack * (w * 0.16), h * 0.1, w * 0.12, h * 0.8);
      // Blinking LEDs
      for (let led = 0; led < 10; led++) {
        const on = Math.sin(t * (2 + rack) + led) > 0;
        ctx.fillStyle = on ? (led % 3 === 0 ? "#ff3300" : "#00ff44") : "rgba(0,0,0,0.5)";
        ctx.fillRect(
          w * 0.12 + rack * (w * 0.16),
          h * 0.15 + led * (h * 0.07),
          8, 4
        );
      }
    }
  } else if (scene === "warehouse") {
    // Shelves
    for (let shelf = 0; shelf < 3; shelf++) {
      ctx.fillStyle = "rgba(80,70,50,0.8)";
      ctx.fillRect(0, h * (0.3 + shelf * 0.25), w, 8);
      // Boxes
      for (let box = 0; box < 6; box++) {
        const bw = 60, bh = 50;
        ctx.fillStyle = `rgba(${100 + box * 20},${80 + box * 10},60,0.9)`;
        ctx.fillRect(box * (w / 6) + 10, h * (0.3 + shelf * 0.25) - bh, bw, bh);
      }
    }
    // Forklift movement
    const forkX = ((frame * 1.5) % (w + 80)) - 40;
    ctx.fillStyle = "rgba(255,140,0,0.8)";
    ctx.fillRect(forkX, h * 0.7, 60, 40);
  } else if (scene === "outdoor") {
    // Sky with gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    skyGrad.addColorStop(0, "#0a1628");
    skyGrad.addColorStop(1, "#1e3a5f");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.6);
    // Stars
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 30; i++) {
      const sx = (i * 137.5) % w;
      const sy = (i * 83.7) % (h * 0.5);
      const flicker = Math.sin(t * (i % 5 + 1)) > 0.3;
      if (flicker) ctx.fillRect(sx, sy, 2, 2);
    }
    // Ground
    ctx.fillStyle = "#1a1a0a";
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
    // Moving vehicle (far)
    const vx = ((frame * 3) % (w + 100)) - 50;
    ctx.fillStyle = "rgba(30,30,30,0.9)";
    ctx.fillRect(vx, h * 0.62, 60, 25);
    // Headlights cone
    ctx.fillStyle = "rgba(255,255,180,0.15)";
    ctx.beginPath();
    ctx.moveTo(vx + 55, h * 0.625 + 12);
    ctx.lineTo(vx + 200, h * 0.55);
    ctx.lineTo(vx + 200, h * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  // Camera info overlay
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, h - 28, w, 28);

  // Timestamp
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").slice(0, 19);
  ctx.font = `bold 13px monospace`;
  ctx.fillStyle = "#e0e0e0";
  ctx.fillText(ts, 8, 18);

  // REC indicator
  if (frame % 50 < 25) {
    ctx.fillStyle = "#ff2222";
    ctx.beginPath();
    ctx.arc(w - 24, 14, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.fillText("REC", w - 16, 18);
  }

  // Bottom bar
  ctx.fillStyle = "#90ee90";
  ctx.font = "11px monospace";
  ctx.fillText(`LIVE  Frame:${String(frame).padStart(6, "0")}`, 8, h - 10);
}

export async function generateFrame(cam: Camera): Promise<Buffer | null> {
  const state = getState(cam);
  state.frame++;

  const { w, h } = resolveDimensions(cam.resolution);

  // Determine active fault
  let activeFault: FaultMode | "normal" = "normal";
  if (cam.faultMode !== "normal") {
    const roll = Math.random() * 100;
    if (roll < cam.faultProbability) {
      activeFault = cam.faultMode;
      state.currentFault = activeFault;
      state.faultTimer = state.frame + Math.floor(25 * (2 + Math.random() * 5)); // 2–7 sec
    } else if (state.frame < state.faultTimer) {
      activeFault = state.currentFault;
    } else {
      activeFault = "normal";
      state.currentFault = "normal";
    }
  }

  // Disconnect = return null (no frame)
  if (activeFault === "disconnect") {
    state.frozenBuffer = null;
    return null;
  }

  // Freeze = return last buffer
  if (activeFault === "freeze") {
    if (!state.frozenBuffer) {
      // Generate a frame to freeze on first occurrence
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      drawScene(ctx, w, h, cam.scene, state.frame);
      state.frozenBuffer = canvas.toBuffer("image/jpeg", { quality: 0.82 });
    }
    return state.frozenBuffer;
  }

  // Clear frozen buffer when not freezing
  if (activeFault !== "freeze") state.frozenBuffer = null;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  if (activeFault === "green_screen") {
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, h / 2 - 20, w, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(h * 0.04)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("⚠ SINAL PERDIDO — GREEN SCREEN", w / 2, h / 2 + 7);
    ctx.textAlign = "left";
  } else if (activeFault === "black") {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `${Math.round(h * 0.035)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("CÂMERA SEM SINAL", w / 2, h / 2);
    ctx.textAlign = "left";
  } else if (activeFault === "noise") {
    // Random noise
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(Math.random() * 256);
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    // Add scanlines
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  } else if (activeFault === "pixelate") {
    // Draw normal scene first, then pixelate by drawing blocks
    drawScene(ctx, w, h, cam.scene, state.frame);
    const blockSize = 16;
    const tmpCanvas = createCanvas(w, h);
    const tmpCtx = tmpCanvas.getContext("2d");
    tmpCtx.drawImage(canvas as any, 0, 0);
    for (let y = 0; y < h; y += blockSize) {
      for (let x = 0; x < w; x += blockSize) {
        const px = tmpCtx.getImageData(x + blockSize / 2, y + blockSize / 2, 1, 1).data;
        ctx.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
        ctx.fillRect(x, y, blockSize, blockSize);
      }
    }
  } else {
    // Normal
    drawScene(ctx, w, h, cam.scene, state.frame);
  }

  return canvas.toBuffer("image/jpeg", { quality: activeFault === "noise" ? 0.5 : 0.82 });
}
