import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Camera, StreamStats } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Copy, RefreshCw, WifiOff, Zap, Eye, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { Link } from "wouter";

const FAULT_LABELS: Record<string, string> = {
  normal: "Normal",
  freeze: "Congelamento",
  green_screen: "Tela Verde",
  noise: "Ruído",
  black: "Tela Preta",
  pixelate: "Pixelado",
  disconnect: "Desconectado",
};

const FAULT_COLORS: Record<string, string> = {
  normal: "bg-green-500/15 text-green-400 border-green-500/30",
  freeze: "bg-blue-400/15 text-blue-300 border-blue-400/30",
  green_screen: "bg-green-400/15 text-green-300 border-green-400/30",
  noise: "bg-yellow-400/15 text-yellow-300 border-yellow-400/30",
  black: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  pixelate: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  disconnect: "bg-red-500/15 text-red-400 border-red-500/30",
};

function CameraFeed({ cam }: { cam: Camera }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(Date.now());

  const baseUrl = `${window.location.origin}`;
  const streamUrl = `${baseUrl}/stream/${cam.id}`;
  const snapshotUrl = `${baseUrl}/snapshot/${cam.id}?t=${snapshotKey}`;

  const faultColor = cam.faultMode !== "normal" && cam.faultProbability > 0
    ? FAULT_COLORS[cam.faultMode] : FAULT_COLORS.normal;

  const hasFault = cam.faultMode !== "normal" && cam.faultProbability > 0;

  return (
    <div className={`rounded-lg border-2 overflow-hidden bg-black relative
      ${!cam.enabled ? "border-gray-700 opacity-50" : hasFault ? "border-yellow-500/50" : "border-green-500/30"}
    `}>
      {/* Feed header bar — outside the image */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-900 border-b border-gray-800">
        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-mono ${faultColor}`}>
          {hasFault && <span className="rec-dot">⚠</span>}
          {hasFault ? FAULT_LABELS[cam.faultMode] : "●LIVE"}
        </span>
        <span className="text-xs mono text-gray-400">{cam.resolution}</span>
      </div>
      {/* Video area */}
      <div className="relative bg-black aspect-video scanlines">
        {cam.enabled ? (
          <img
            ref={imgRef}
            src={snapshotUrl}
            alt={cam.name}
            className="w-full h-full object-cover"
            onLoad={() => setLoading(false)}
            onError={() => setError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <WifiOff className="mx-auto mb-2 text-gray-600" size={28} />
              <p className="text-gray-500 text-xs mono">DESATIVADA</p>
            </div>
          </div>
        )}
        {loading && cam.enabled && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
            <RefreshCw className="animate-spin text-green-500" size={20} />
          </div>
        )}
        {/* Refresh button */}
        {cam.enabled && (
          <button
            onClick={() => { setSnapshotKey(Date.now()); setLoading(true); setError(false); }}
            className="absolute bottom-2 right-2 z-10 bg-black/70 hover:bg-black/90 text-gray-300 p-1.5 rounded transition-colors"
            title="Atualizar snapshot"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
      {/* Camera info */}
      <div className="px-3 py-2 bg-card border-t border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{cam.name}</p>
            <p className="text-xs text-muted-foreground mono truncate">{cam.id}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Badge variant="outline" className="text-xs mono">
              {cam.fps}fps
            </Badge>
            <Badge variant="outline" className={`text-xs ${cam.faultProbability > 0 ? "text-yellow-400 border-yellow-500/30" : ""}`}>
              {cam.faultProbability}%
            </Badge>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          <StreamUrl url={streamUrl} label="MJPEG" />
        </div>
      </div>
    </div>
  );
}

function StreamUrl({ url, label }: { url: string; label: string }) {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(url);
    toast({ description: "URL copiada!" });
  };
  return (
    <div className="flex items-center gap-1 bg-secondary/50 rounded px-2 py-1 w-full overflow-hidden">
      <span className="text-xs font-bold text-green-400 mono flex-shrink-0">{label}</span>
      <span className="text-xs text-muted-foreground mono truncate flex-1 min-w-0">{url}</span>
      <button onClick={copy} className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors">
        <Copy size={11} />
      </button>
    </div>
  );
}

function StatsPanel({ stats, cameras }: { stats: StreamStats[]; cameras: Camera[] }) {
  const total = cameras.length;
  const online = cameras.filter(c => c.enabled).length;
  const withFaults = cameras.filter(c => c.faultMode !== "normal" && c.faultProbability > 0).length;
  const totalBytes = stats.reduce((a, s) => a + s.bytesSent, 0);
  const totalClients = stats.reduce((a, s) => a + s.activeClients, 0);

  const fmt = (b: number) => b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: "Câmeras Online", value: `${online}/${total}`, icon: <CheckCircle2 size={16} className="text-green-400" />, color: "text-green-400" },
        { label: "Com Falhas Config.", value: withFaults, icon: <AlertTriangle size={16} className="text-yellow-400" />, color: "text-yellow-400" },
        { label: "Dados Enviados", value: fmt(totalBytes), icon: <Activity size={16} className="text-blue-400" />, color: "text-blue-400" },
        { label: "Clientes Ativos", value: totalClients, icon: <Eye size={16} className="text-purple-400" />, color: "text-purple-400" },
      ].map(s => (
        <Card key={s.label} className="bg-card border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {s.icon}
            </div>
            <p className={`text-2xl font-bold mt-1 mono ${s.color}`}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Dashboard({ statsOnly }: { statsOnly?: boolean }) {
  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
    refetchInterval: 5000,
  });
  const { data: stats = [] } = useQuery<StreamStats[]>({
    queryKey: ["/api/stats"],
    refetchInterval: 3000,
  });

  if (statsOnly) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Estatísticas de Stream</h1>
        <StatsPanel stats={stats} cameras={cameras} />
        <Card>
          <CardHeader><CardTitle className="text-base">Detalhes por Câmera</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    {["Câmera","Frames Enviados","Bytes Enviados","Clientes","Uptime","Modo de Falha"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cameras.map(cam => {
                    const s = stats.find(x => x.cameraId === cam.id);
                    const fmt = (b: number) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e3).toFixed(0)} KB`;
                    return (
                      <tr key={cam.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-xs">{cam.name}</div>
                          <div className="text-muted-foreground mono text-xs">{cam.id}</div>
                        </td>
                        <td className="py-2 pr-4 mono text-xs">{(s?.framesSent ?? 0).toLocaleString()}</td>
                        <td className="py-2 pr-4 mono text-xs">{fmt(s?.bytesSent ?? 0)}</td>
                        <td className="py-2 pr-4 mono text-xs">{s?.activeClients ?? 0}</td>
                        <td className="py-2 pr-4 mono text-xs">{s ? `${s.uptime}s` : "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${FAULT_COLORS[cam.faultMode]}`}>
                            {FAULT_LABELS[cam.faultMode]} {cam.faultProbability > 0 ? `(${cam.faultProbability}%)` : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Monitor de Câmeras</h1>
          <p className="text-sm text-muted-foreground">Streams MJPEG para teste de NVR/VMS — acesse as URLs diretamente no seu sistema</p>
        </div>
        <Link href="/config">
          <Button variant="outline" size="sm" data-testid="btn-config">
            Configurar Falhas
          </Button>
        </Link>
      </div>

      <StatsPanel stats={stats} cameras={cameras} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cameras.map(cam => (
          <CameraFeed key={cam.id} cam={cam} />
        ))}
      </div>

      {/* Protocol info */}
      <Card className="mt-6 border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap size={14} className="text-green-400" />
            Como conectar no NVR/VMS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium mb-1 text-xs text-muted-foreground uppercase tracking-wide">Stream MJPEG (HTTP)</p>
              <code className="block bg-secondary/60 px-3 py-2 rounded text-xs mono text-green-300 break-all">
                {window.location.origin}/stream/cam-01
              </code>
              <p className="text-xs text-muted-foreground mt-1">Compatível com a maioria dos NVRs como "câmera genérica MJPEG"</p>
            </div>
            <div>
              <p className="font-medium mb-1 text-xs text-muted-foreground uppercase tracking-wide">Snapshot JPEG</p>
              <code className="block bg-secondary/60 px-3 py-2 rounded text-xs mono text-blue-300 break-all">
                {window.location.origin}/snapshot/cam-01
              </code>
              <p className="text-xs text-muted-foreground mt-1">Imagem estática para teste de conexão e polling</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 border-t border-border/50 pt-3">
            <strong className="text-yellow-400">Nota RTSP:</strong> Este simulador usa HTTP/MJPEG — protocolo suportado por todos VMSs modernos (Milestone, Genetec, Hikvision IVMS, Blue Iris, Frigate NVR).
            Para RTSP nativo, use <code className="mono text-xs">ffmpeg -re -f lavfi -i testsrc2 -f rtsp rtsp://localhost:8554/camX</code> como complemento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
