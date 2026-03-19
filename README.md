# RTSP Simulator — NVR/VMS Test Platform

Servidor de streams de câmeras simuladas com falhas configuráveis (congelamento, tela verde, ruído, tela preta, pixelado, desconexão) para testes de NVR/VMS.

## Visão Geral

Este projeto provê **8 câmeras virtuais** via HTTP/MJPEG com cenas animadas e modos de falha injetáveis, útil para:

- Testar detecção de perda de sinal em sistemas VMS (Milestone, Genetec, Hikvision IVMS, etc.)
- Validar comportamento de NVRs como Blue Iris, Frigate, Shinobi sob condições adversas
- Desenvolvimento e CI de integrações com câmeras IP sem hardware físico

## Tecnologias

| Camada | Stack |
|---|---|
| Backend | Node.js · Express · TypeScript · `canvas` (geração de frames JPEG) |
| Frontend | React · Vite · Tailwind CSS · shadcn/ui · TanStack Query |
| Build | `tsx` · Rollup (via Vite) · esbuild |

## Pré-requisitos

- **Node.js ≥ 18**
- **npm ≥ 9**
- Dependências nativas do pacote `canvas`: `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`, `libgif-dev`

### Ubuntu / Debian

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev
```

### macOS (Homebrew)

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

## Instalação

```bash
git clone https://github.com/suporterfid/rtsp-simulator.git
cd rtsp-simulator
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Inicia o servidor Express (backend) e o Vite (frontend) juntos na porta **5000**.

Acesse: [http://localhost:5000](http://localhost:5000)

## Build de Produção

```bash
npm run build
```

Gera o bundle estático em `dist/public/` e o servidor compilado em `dist/index.cjs`.

## Execução em Produção

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

Servidor disponível em: [http://localhost:5000](http://localhost:5000)

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

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/stream/:id` | Stream MJPEG contínuo (multipart/x-mixed-replace) |
| `GET` | `/snapshot/:id` | Snapshot JPEG único |
| `GET` | `/api/cameras` | Lista todas as câmeras e configurações |
| `GET` | `/api/cameras/:id` | Detalhes de uma câmera |
| `PATCH` | `/api/cameras/:id` | Atualiza configuração da câmera |
| `GET` | `/api/stats` | Estatísticas de stream (frames, bytes, clientes ativos) |

### IDs de câmera padrão

`cam-01` … `cam-08`

## Conectar no NVR/VMS

### MJPEG direto (compatível com a maioria dos VMS)

```
http://<servidor>:5000/stream/cam-01
```

### Blue Iris / Frigate (adicionar câmera genérica)

```
URL: http://localhost:5000/stream/cam-01
Tipo: MJPEG
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

### Reencapsular como RTSP com FFmpeg

```bash
ffmpeg -re -i http://localhost:5000/stream/cam-01 \
  -c copy -f rtsp rtsp://localhost:8554/cam01
```

## Modos de Falha

| Modo | Descrição | Caso de teste |
|---|---|---|
| `normal` | Stream limpo | Operação normal |
| `freeze` | Frame congela por 2–7 s aleatoriamente | Detecção de stream estático no VMS |
| `green_screen` | Tela verde (`#00FF00`) | Detecção de perda de sinal de câmera |
| `noise` | Interferência visual tipo analógico | Análise de qualidade de vídeo |
| `black` | Tela preta total | Câmera com lente tampada / sem energia |
| `pixelate` | Blocos pixelados | Degradação de bitrate / perda de pacotes |
| `disconnect` | Stream cai (sem frames / HTTP 503) | Timeout de reconexão no NVR |

A **probabilidade de falha** (0–100%) define com que frequência o modo é ativado. A falha dura alguns segundos e o stream volta ao normal automaticamente.

## Estrutura do Projeto

```
rtsp-simulator/
├── client/                 # Frontend React + Vite
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       ├── pages/
│       │   ├── Dashboard.tsx     # Monitor de câmeras
│       │   └── CameraConfig.tsx  # Configuração de falhas
│       └── components/
├── server/                 # Backend Express
│   ├── index.ts            # Entry point
│   ├── routes.ts           # Rotas MJPEG + API REST
│   ├── storage.ts          # Estado em memória
│   └── frameGenerator.ts   # Geração de frames com canvas
├── shared/
│   └── schema.ts           # Tipos compartilhados (Camera, FaultMode, StreamStats)
├── script/
│   └── build.ts            # Script de build
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

## Licença

MIT

---

Criado com [Perplexity Computer](https://www.perplexity.ai/computer)
