# Architecture: Multi-Agent Zoom Education System

## High-level goal

Integrate a **multi-agent system** into Zoom (or a companion app) for education:

- **Inputs:** Attendee attention (eye contact / gaze), poll responses, chat activity, and other engagement metrics.
- **Processing:** Agents summarize engagement and decide actions (e.g. suggest a poll, prompt instructor).
- **Output:** A **report** for the teacher: after the meeting ends, or **during** the meeting as a popup every X minutes.

---

## What exists today (current state)

### Server

| File | Used? | What it does |
|------|--------|----------------|
| **index.js** | ✅ Yes (`npm start` runs this) | Express on port 3000. **POST /api/analyze-gaze**: receives gaze, returns BORED/FOCUS (not stored). **GET /api/poll**: reads static `summary.txt`, calls `quizPollAgent` to generate per-student quizzes. Serves static `../videoapp`. No WebSocket, no meeting state. |
| **index.ts** | ❌ Not run | Full pipeline: `meetingState`, **POST /api/events** (store Zoom events), **POST /api/tick** (run agents), **WebSocket** (broadcast to clients). Uses `engagementSummarizerAgent`, `meetingCoordinatorAgent`, `quizPollAgent`, and `leaderboard`. |

So the **live** server is **index.js**; the **multi-agent + WebSocket** logic lives in **index.ts** and is never executed.

### Agents (agents.js – used by index.js only for /api/poll)

1. **Engagement summarizer** – Takes `meeting` with `events[]` (polls, chat, attention scores). Returns `class_engagement`, `per_user` engagement, `cold_students`, `summary`. **Not used in any HTTP path in index.js.**
2. **Meeting coordinator** – Uses summary + meeting to decide: NONE, GENERATE_POLL, PROMPT_INSTRUCTOR, HIGHLIGHT_COLD_STUDENTS. **Not used in index.js.**
3. **Quiz/poll agent** – Used by **GET /api/poll** with fake data from `summary.txt`.

### Client (React, port 5173, proxies /api → 3000)

- **Home** – Links to Video App, Poll, Hi.
- **VideoApp** – MediaPipe gaze detection; sends **POST /api/analyze-gaze** with `avgGaze`. Shows FOCUS/BORED. **Gaze is not stored or sent to any agent.**
- **Poll** – **GET /api/poll** → shows personalized quizzes from static `summary.txt`.
- **Hi** – Simple “Say Hi” demo.
- **No Report page.** No WebSocket. No “popup every X minutes.”

### Zoom app (zoomapp/)

- **Join meeting** via Meeting SDK + auth endpoint (port 4000).
- **Does not** send events to the backend. **Does not** open a WebSocket to the server. README mentions intent to “listen for valuable events and forward to backend” and to use WebSocket for POLL_SUGGESTION / LEADERBOARD_UPDATE – **not implemented.**

### Data flow today

- **Gaze:** Browser → /api/analyze-gaze → immediate BORED/FOCUS response only.
- **Polls:** Server reads `summary.txt` (static file) → quizPollAgent → client displays.
- **Agents 1 & 2 and meeting state:** Implemented in code but not wired in the running server (index.ts not run).

---

## Target flow (after integration)

1. **Event ingestion**
   - **Gaze:** When a client sends gaze (e.g. from VideoApp or future Zoom app), include `meetingId` and `userId`; server stores as an event (e.g. `ATTENTION_SCORE` / `cv_attention_score`) in `meetingState[meetingId].events`.
   - **Zoom / app:** Same server exposes **POST /api/events** with `meetingId`, and event types: `QUIZ_ANSWER`, `CHAT_MESSAGE`, etc. Optional: Zoom RTMS or Meeting SDK events forwarded here.
   - **Transcript:** If/when available (e.g. RTMS), append to `meeting.recentTranscriptSnippets`.

2. **Agents**
   - **Engagement summarizer** runs on `meeting.events` (and optional transcript) → produces summary + per-user engagement + cold students.
   - **Meeting coordinator** uses that summary to decide actions (e.g. GENERATE_POLL).
   - **Quiz/poll agent** generates questions when needed (from coordinator or from /api/poll with live data).

3. **Report for the teacher**
   - **GET /api/report?meetingId=...** – Returns the latest engagement summary (and optionally last decision). Usable after the meeting or when the teacher opens a “Report” page.
   - **During meeting – popup every X minutes:** Server runs the engagement summarizer on a timer (e.g. every 5 min), then broadcasts the summary over WebSocket (e.g. `COORDINATOR_UPDATE` or `SUMMARY_UPDATE`). Teacher client (or Zoom app) subscribes by `meetingId` and shows a popup/modal.

4. **Single server entry**
   - One process (e.g. **index.js**) should implement: meeting state, WebSocket, /api/events, /api/tick, /api/report, periodic summarizer, existing /api/analyze-gaze and /api/poll. This unifies the current “demo” (index.js) with the “full” pipeline (index.ts).

---

## File roles after integration

| Component | Role |
|----------|------|
| **server/index.js** | Single server: gaze (optionally stored as event), poll from file or live state, meetingState, /api/events, /api/tick, /api/report, WebSocket, periodic summary timer. |
| **server/agents.js** | engagementSummarizerAgent, meetingCoordinatorAgent, quizPollAgent (unchanged). |
| **server/leaderboard.js** | Simple in-memory leaderboard (ported from leaderboard.ts) for QUIZ_ANSWER events. |
| **client Report page** | Fetches /api/report, shows summary; optional WebSocket for live “popup every X minutes”. |
| **zoomapp** (future) | Send events to POST /api/events; open WebSocket to receive POLL_SUGGESTION, SUMMARY_UPDATE, LEADERBOARD_UPDATE. |

---

## Optional: Zoom RTMS (real Zoom data)

To use **real** Zoom data (transcript, chat, etc.):

- Enable Zoom Realtime Media Streams (RTMS) for your app/account.
- Add an ingestion layer (e.g. webhook + optional WebSocket) that maps RTMS events into `meeting.events` and `meeting.recentTranscriptSnippets`.
- Same agents and report flow then run on that live data.

See [Zoom RTMS](https://developers.zoom.us/docs/rtms/) and the earlier integration plan for details.
