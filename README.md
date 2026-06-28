# 📖 Storybook

Chat with an AI to **co-write a children's story**, then generate a fully
illustrated **storybook PDF** — illustrations rendered by your own self-hosted
**Ideogram 4** model on RunPod.

Built for making magical bedtime books for a 5-year-old. 🪄

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   Storybook Buddy chat   │        │      Your Storybook canvas    │
│  (ConvEngineChat + DUI)  │ ─────▶ │  live page previews + PDF      │
│  talks to DeepSeek       │        │  (RunPod Ideogram 4 + pdf-lib) │
└─────────────────────────┘        └──────────────────────────────┘
            client/ (Vite + React)            server/ (Express)
```

## How it works

1. You chat with **Storybook Buddy** (a DeepSeek-powered children's author).
2. When a story is ready, the agent emits a structured story (title + 5 scenes,
   each with narration, a speech bubble, a thought bubble, and an image prompt).
3. A **✨ Generate Storybook** card appears in the chat. Click it.
4. The server asks your RunPod Ideogram 4 server to illustrate a cover + each
   scene, streaming every page back to the canvas as it finishes.
5. The pages are bound into a printable **PDF** you can preview and download.

## Stack

- **client/** — Vite + React + [`@salilvnair/dui`](../dui) +
  [`@salilvnair/convengine-chat`](../convengine-chat) (the chat UI)
- **server/** — Express
  - `services/llm.js` — DeepSeek (any OpenAI-compatible endpoint)
  - `services/storyAgent.js` — persona, story protocol, scene parsing
  - `services/runpod.js` — Ideogram 4 image client (`POST /generate`)
  - `services/pdf.js` — `pdf-lib` storybook builder

## Setup

```bash
npm install
cp .env.example .env       # then edit .env
```

Edit `.env`:

```ini
# DeepSeek (or any OpenAI-compatible endpoint)
LLM_BASE_URL=https://api.deepseek.com/v1/chat/completions
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-your-real-deepseek-key

# Your deployed RunPod Ideogram 4 server (experiments/cuda-id4)
RUNPOD_URL=https://xxxxx-8080.proxy.runpod.net
```

The RunPod URL can also be set live in the app via the ⚙ Settings panel.

## Run

```bash
npm run dev      # server (:8787) + client (:5173) together — open http://localhost:5173
```

Or run them separately:

```bash
npm run server   # Express on :8787
npm run client   # Vite dev server on :5173 (proxies /api → :8787)
```

### Production

```bash
npm run build    # builds client/ → client/dist
npm run server   # Express serves the API *and* the built client on :8787
```

## API (server)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health` | liveness |
| `GET`  | `/api/config` | which providers are configured |
| `POST` | `/api/v1/conversation/message` | chat with the story agent |
| `GET`  | `/api/runpod/status` | image server status |
| `POST` | `/api/storybook/generate` | streaming NDJSON: progress + pages + final PDF |

The `/api/storybook/generate` route streams newline-delimited JSON so the canvas
shows live "scene 2/5" progress and previews each page as it lands (and so the
long multi-image run never trips Chromium's 300s idle-fetch limit).
