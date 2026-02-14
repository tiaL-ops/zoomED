# Zoom Meeting SDK + Engagement Panel

Meeting SDK flow (no ngrok). Open in browser, join meeting, see engagement panel alongside.

## Quick start

### 1. Auth backend (port 4000)
```bash
cd zoomapp/meetingsdk-auth-endpoint-sample
cp .env.example .env
# Edit .env with ZOOM_MEETING_SDK_KEY and ZOOM_MEETING_SDK_SECRET
npm install && npm start
```

### 2. TreeHacks backend (port 3000)
```bash
cd server
npm install && node index.js
```

### 3. Serve zoomapp client (port 8080)
```bash
cd zoomapp
npx serve -p 8080
```

### 4. Open in browser
Go to **http://localhost:8080** → enter meeting ID, passcode, name → Join.

After joining, the **engagement sidebar** shows:
- Run agents → `POST /api/meetings/:meetingId/run-agents`
- Generate poll → `POST /api/meetings/:meetingId/generate-poll`
- I'm good / I'm lost → `POST /api/meetings/:meetingId/events` (SELF_REPORT)

Meeting ID from the join form is used as `meetingId` for backend calls.
