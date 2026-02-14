# Zoom Side Panel (Vite + React)

Narrow side-panel UI (max width 360px) that runs inside the Zoom client. Uses **@zoom/appssdk** for meeting/user context and talks to the backend over HTTP.

## Prerequisites

- Node 18+
- Backend server running (see repo root)

## Run locally

### 1. Start the backend server

From the repo root:

```bash
cd server
npm install   # if needed
node index.js
```

Server runs at **http://localhost:3000** (API at `/api/...`).

### 2. Start the zoom-panel (Vite dev)

In a second terminal:

```bash
cd zoom-panel
npm install   # if needed
npm run dev
```

Vite runs at **http://localhost:5174**. The dev server proxies `/api` to `http://localhost:3000`, so the panel can call the backend without CORS.

### 3. Open the panel

- **Standalone (no Zoom):** open **http://localhost:5174**. The app will use `meetingId="demo"` and `userId="demo-user"` when the Zoom SDK context is unavailable (e.g. in a normal browser).
- **Inside Zoom:** use ngrok (or similar) to expose port 5174, then set your Zoom App’s side panel URL to that HTTPS URL in the [Zoom Developer Console](https://developers.zoom.us/docs/zoom-apps/create/). When the app runs inside Zoom, it will get real `meetingID` and user context from the SDK.

## Ngrok (for testing inside Zoom)

1. Install [ngrok](https://ngrok.com/).
2. Expose the panel:
   ```bash
   ngrok http 5174
   ```
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`) and use it as the **App URL** / side panel URL in your Zoom App configuration.
4. Ensure the backend is reachable from the panel. Either:
   - Expose the server too: `ngrok http 3000` and set `VITE_API_BASE=https://your-server.ngrok.io` when building the panel, or
   - Deploy backend to a public URL and set `VITE_API_BASE` to that URL.

## Build for production

```bash
cd zoom-panel
npm run build
```

Output is in `dist/`. Serve `dist/` over HTTPS and set that URL as the Zoom App side panel URL. To point the built app at your API, set the env when building:

```bash
VITE_API_BASE=https://your-api.example.com npm run build
```

## UI overview

- **Engagement meter:** 1–3 (from last run-agents result).
- **Run agents:** `POST /api/meetings/:meetingId/run-agents`; shows engagement, cold students, recommended action, and optional poll.
- **Generate poll:** `POST /api/meetings/:meetingId/generate-poll`; shows a quick-check poll.
- **I'm good / I'm lost:** `POST /api/meetings/:meetingId/events` with `type: "SELF_REPORT"` and `value: "good"` or `"lost"`.

Meeting ID and user ID come from the Zoom SDK when running inside Zoom; otherwise they default to `demo` and `demo-user`.
