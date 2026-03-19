import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Camera, FaultMode } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, Camera as CameraIcon, Settings2, Wifi, WifiOff } from "lucide-react";

const FAULT_OPTIONS: { value: FaultMode; label: string; desc: string; color: string }[] = [
  { value: "normal", label: "Normal", desc: "Sem falhas", color: "text-green-400" },
  { value: "freeze", label: "Congelamento", desc: "Frame parado por segundos", color: "text-blue-300" },
  { value: "green_screen", label: "Tela Verde", desc: "Sinal de chroma key", color: "text-green-300" },
  { value: "noise", label: "Ruído", desc: "Interferência visual", color: "text-yellow-300" },
  { value: "black", label: "Tela Preta", desc: "Perda total de sinal", color: "text-gray-400" },
  { value: "pixelate", label: "Pixelado", desc: "Compressão / perda de bitrate", color: "text-purple-300" },
  { value: "disconnect", label: "Desconectado", desc: "Stream cai completamente", color: "text-red-400" },
];

const RESOLUTION_OPTIONS = [
  "640x480", "1280x720", "1920x1080", "2560x1440", "3840x2160"
];

const FPS_OPTIONS = [5, 10, 15, 25, 30, 60];
const SCENE_LABELS: Record<string, string> = {
  parking: "Estacionamento",
  corridor: "Corredor",
  entrance: "Entrada",
  server_room: "Sala de Servidores",
  warehouse: "Depósito",
  outdoor: "Área Externa",
};

function CameraCard({ cam }: { cam: Camera }) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (patch: Partial<Camera>) =>
      apiRequest("PATCH", `/api/cameras/${cam.id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cameras"] });
      toast({ description: "Configuração salva." });
    },
    onError: () => toast({ variant: "destructive", description: "Erro ao salvar." }),
  });

  const update = (patch: Partial<Camera>) => mutation.mutate(patch);

  const fault = FAULT_OPTIONS.find(f => f.value === cam.faultMode) ?? FAULT_OPTIONS[0];

  return (
    <Card className="bg-card border-border hover:border-border/80 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CameraIcon size={16} className={cam.enabled ? "text-green-400" : "text-gray-600"} />
            <div>
              <CardTitle className="text-sm font-semibold">{cam.name}</CardTitle>
              <p className="text-xs text-muted-foreground mono">{cam.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cam.enabled ? <Wifi size={14} className="text-green-400" /> : <WifiOff size={14} className="text-gray-500" />}
            <Switch
              checked={cam.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
              data-testid={`switch-enabled-${cam.id}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fault Mode */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Modo de Falha</label>
          <Select value={cam.faultMode} onValueChange={(v) => update({ faultMode: v as FaultMode })}>
            <SelectTrigger className="text-sm h-9" data-testid={`select-fault-${cam.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FAULT_OPTIONS.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  <span className={`font-medium ${f.color}`}>{f.label}</span>
                  <span className="text-muted-foreground text-xs ml-2">— {f.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fault Probability */}
        {cam.faultMode !== "normal" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Probabilidade de Falha</label>
              <span className={`text-sm font-bold mono ${fault.color}`}>{cam.faultProbability}%</span>
            </div>
            <Slider
              value={[cam.faultProbability]}
              min={0} max={100} step={5}
              onValueChange={([v]) => update({ faultProbability: v })}
              className="w-full"
              data-testid={`slider-prob-${cam.id}`}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Nunca</span><span>Sempre</span>
            </div>
          </div>
        )}

        {/* Resolution & FPS */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Resolução</label>
            <Select value={cam.resolution} onValueChange={(v) => update({ resolution: v })}>
              <SelectTrigger className="text-xs h-8" data-testid={`select-res-${cam.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map(r => (
                  <SelectItem key={r} value={r} className="text-xs mono">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">FPS</label>
            <Select value={String(cam.fps)} onValueChange={(v) => update({ fps: Number(v) })}>
              <SelectTrigger className="text-xs h-8" data-testid={`select-fps-${cam.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map(f => (
                  <SelectItem key={f} value={String(f)} className="text-xs mono">{f} fps</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scene */}
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Cena</label>
          <Select value={cam.scene} onValueChange={(v) => update({ scene: v as Camera["scene"] })}>
            <SelectTrigger className="text-xs h-8" data-testid={`select-scene-${cam.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SCENE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stream URL */}
        <div className="bg-secondary/40 rounded p-2">
          <p className="text-xs text-muted-foreground mb-1">URL do Stream (MJPEG)</p>
          <code className="text-xs mono text-green-300 break-all block">{window.location.origin}/stream/{cam.id}</code>
        </div>

        {mutation.isPending && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Salvando...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CameraConfig() {
  const { data: cameras = [] } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
    refetchInterval: 10000,
  });

  const enabledCount = cameras.filter(c => c.enabled).length;
  const faultCount = cameras.filter(c => c.faultMode !== "normal" && c.faultProbability > 0).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings2 size={20} className="text-green-400" />
            Configurar Câmeras
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure modos de falha, resolução e FPS de cada câmera para testes de NVR/VMS
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">
            {enabledCount}/{cameras.length} ativas
          </Badge>
          <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/30">
            {faultCount} com falhas
          </Badge>
        </div>
      </div>

      {/* Fault guide */}
      <Card className="mb-5 border-border/50 bg-card/50">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Guia de Falhas</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {FAULT_OPTIONS.filter(f => f.value !== "normal").map(f => (
              <div key={f.value} className="text-center">
                <p className={`text-xs font-bold ${f.color}`}>{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cameras.map(cam => (
          <CameraCard key={cam.id} cam={cam} />
        ))}
      </div>
    </div>
  );
}
