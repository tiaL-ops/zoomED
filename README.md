# zoomED - AI-Powered Engagement System

**TreeHacks 2026** — Real-time student engagement monitoring with multi-agent AI, computer vision attention tracking, and adaptive intervention.

## Quick Start

**Windows:**
```bash
start-all.bat
```

**Mac/Linux:**
```bash
chmod +x start-all.sh
./start-all.sh
```

Then open:
- **Zoom App:** http://localhost:8080 (join meeting)
- **Teacher Dashboard:** http://localhost:5173/report (view engagement analytics)

Note: TO run this, you must have your own API keys 
*Claude API key: [Get yours here](https://console.anthropic.com/settings/keys)*
---

## Functionality

This system monitors student engagement during Zoom meetings and uses **multi-agent AI** to adaptively respond:

### **Real-Time Monitoring**
- **Computer Vision:** MediaPipe-based gaze tracking detects when students look away
- **Chat Analysis:** Monitors participation in meeting chat
- **Attendance:** Tracks join/leave events

### **Multi-Agent Decision System**
Three specialized Claude agents work together every 10 minutes:

1. **Engagement Summarizer** — Analyzes overall class engagement, identifies struggling students
2. **Nudge Agent** — Sends supportive, personalized check-ins to low-engagement students (rate-limited, non-intrusive)
3. **Quiz Generator** — Creates adaptive questions when a student loses focus 3+ times, prompting re-engagement with material

### **Teacher Dashboard**
- Live engagement metrics and trends over time
- Per-student attention scores
- Timeline showing when engagement was high vs. low
- Recent AI interventions (nudges, quizzes sent)

### **Student Experience**
- **Focus tracking opt-in** (camera-based attention detection)
- **Gentle nudges** when attention drifts ("Quick check-in" popup)
- **Material-based quizzes** appear in sidebar after repeated disengagement
- **Focus game** for quick mental resets

---

## Architecture

### **Event-Driven System**
- Frontend sends events (chat, attention, join/leave) → WebSocket server
- Server accumulates events per meeting in memory
- Every 10 minutes, agents analyze accumulated events and make decisions
- Decisions broadcast back to connected clients via WebSocket

### **Tech Stack**
- **Frontend:** React + Vite
- **Backend:** Node.js + Express + WebSocket
- **AI:** Claude 3.5 Sonnet (multi-agent orchestration)
- **Computer Vision:** MediaPipe Face Mesh
- **Zoom Integration:** Zoom Meeting SDK

### **Key Components**
```
server/
  ├── index.js          # Main server: WebSocket, agents, API endpoints
  ├── agents.js         # Multi-agent logic (summarizer, nudge, quiz)
  └── leaderboard.js    # Quiz scoring system

client/
  ├── src/
      ├── Home.jsx      # Landing page with live engagement feed
      └── Report.jsx    # Teacher dashboard (analytics + controls)

zoomapp/
  ├── app.js            # Zoom SDK integration + gaze tracking
  └── index.html        # Meeting UI with engagement sidebar
```

---

## How It Works

### **1. Join Meeting**
Student opens http://localhost:8080, enters meeting ID, and joins as attendee. Host can enable focus tracking (camera-based attention detection).

### **2. Activity Tracking**
- Every chat message → `CHAT_MESSAGE` event
- Every 5 seconds → `ATTENTION_SCORE` event (if focus tracking on)
- Join/leave → `participant_joined` / `participant_left` events

### **3. Agent Analysis (Every 10 Minutes)**
```python
# Pseudocode
engagement_data = summarize_engagement(events)
low_engagement_users = identify_struggling_students(engagement_data)

for user in low_engagement_users:
    if should_send_nudge(user):
        send_nudge(user, personalized_message)
    
    if user.look_away_count >= 3:
        quiz = generate_quiz_on_material()
        send_quiz(user, quiz)
```

### **4. Real-Time Intervention**
- Students see nudges as popups: *"Quick check-in: Looks like your attention drifted. Want to try a focus game?"*
- Quizzes appear in sidebar: *"Agent question (on material)"*
- Teacher sees everything on the dashboard timeline

---

## 🔧 Setup (First Time Only)

**Prerequisites:** Node 18+, Zoom Meeting SDK credentials

### 1. Clone repo
```bash
git clone <your-repo>
cd treehackswinner2026
```

### 2. Backend setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env: add CLAUDE_API_KEY from https://console.anthropic.com/settings/keys
```

### 3. Frontend setup
```bash
cd client
npm install
```

### 4. Zoom auth endpoint
```bash
cd zoomapp/meetingsdk-auth-endpoint-sample
npm install
# .env already has ZOOM_MEETING_SDK_KEY and ZOOM_MEETING_SDK_SECRET env variables, but you need to generate keys and add them in
```

After setup, just run **`start-all.bat`** (Windows) or **`./start-all.sh`** (Mac).

---

##  Testing & Development

### **Automated Flow**
1. Run `start-all.bat` (or `.sh`)
2. Join meeting at http://localhost:8080
3. Chat messages and attention are tracked automatically
4. Agents run every 10 minutes
5. View teacher dashboard at http://localhost:5173/report

### **Manual Agent Trigger**
To test agents immediately without waiting:
```bash
curl -X POST http://localhost:3000/api/tick \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"YOUR_MEETING_ID"}'
```

### **Mock Events (No Zoom Meeting)**
```bash
# Simulate a chat message
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"default","type":"CHAT_MESSAGE","userId":"u1","displayName":"Alex"}'

# Simulate attention score
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"default","type":"ATTENTION_SCORE","userId":"u2","displayName":"Sam","cv_attention_score":0.5}'
```

Then view results at http://localhost:5173/report?meetingId=default

### **Adjust Agent Timing**
In `server/index.js`, change:
```javascript
const SUMMARY_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
// To:
const SUMMARY_INTERVAL_MS = 60 * 1000;  // 1 minute (for testing)
```

<<<<<<< HEAD
=======
* go back to **Report**, click **Update summary** — you should see a summary (class engagement, per-user, students losing focus) and last decision.

## 4. test the 10-minute popup

* stay on report with meeting ID `default`.  
* ensure you’ve sent at least one event and run `/api/tick` (or wait for the server’s 10‑minute timer)
* the page connects via WebSocket (you’ll see **● Live** when connected)
* every 10 minutes the server runs the summarizer and pushes `SUMMARY_UPDATE`; a **popup** should appear with the latest summary. (to test without waiting, temporarily change `SUMMARY_INTERVAL_MS` in `server/index.js` to e.g. `60 * 1000` for 1 minute.)

## 5. test gaze feeding into meeting state (optional)

* In the **zoomapp**, enable focus tracking in a meeting; attention is sent to the server for that meeting.
* On the **Report** (or wait for the 10‑minute periodic summary) you’ll see attention in the summary.

## 6. test the nudge agent (refocus popup for attendees)

* send events that create at least one low-engagement user (e.g. `userId: "u2"` with no chat and low/no attention), then run **POST /api/tick** with `meetingId: "default"`
* on the **Report** page, enter a **Preview as attendee (userId)** value that matches someone who got a nudge (e.g. `u2` or `Sam`), and stay on the page with WebSocket connected
* after the next agent run (or run `/api/tick` again), the server broadcasts `NUDGE` for that user; the Report page shows a **“Quick check-in” popup** with the supportive message (this is what the attendee would see in the Zoom app)
* the Report page also shows **Engagement over time** and **Recent nudges sent** so the teacher can see when engagement was high vs low and what nudges were sent

## 7. test chat from Zoom app (live meeting chat → engagement summarizer)

Chat messages sent during a Zoom meeting are forwarded to the server and used by the engagement summarizer (alongside polls and attention scores).

1. **Start the Zoom app stack:**
   ```bash
   # Terminal 1 – auth endpoint (port 4000)
   cd zoomapp/meetingsdk-auth-endpoint-sample
   npm install && npm start

   # Terminal 2 – zoomapp (port 8080)
   cd zoomapp
   npx serve -p 8080
   ```
   Ensure the **server** (port 3000) and **client** (port 5173) are also running.

2. **Join a meeting** at http://localhost:8080 with your meeting ID, name, and passcode.

3. **Send a chat message** in the Zoom meeting (to Everyone or the host). The zoomapp listens for `onReceiveChatMsg` and forwards each message to `POST /api/events` as `type: "CHAT_MESSAGE"`.

4. **Verify chat in engagement summary:**
   * Run `POST /api/tick` with your meeting ID (or wait for the 10‑minute periodic run).
   * Open **Report**, set Meeting ID to your Zoom meeting ID, and refresh. The summary should include chat activity in per-user engagement.

**Note:** Only participants whose client runs the zoomapp will forward chat. Typically the **host** runs the zoomapp and forwards all chat messages to the backend.

## 9. Live transcription → poll/question agent context

When the **host** enables **Live Transcript** (or "Save closed captions") in the Zoom meeting, the zoomapp receives real-time transcription via the Meeting SDK and forwards each line to the server. That transcript is stored in `meeting.recentTranscriptSnippets` and used by:

- **Engagement summarizer** – includes "what was covered" in the summary when transcript is present.
- **Transcribing agent** – turns raw caption snippets (and optional uploaded lecture) into one clean "lecture content" block. Use it when live transcript is flaky or messy: it merges fragments, drops filler, and combines with uploaded notes so the poll agent gets coherent material.
- **Quiz/poll agent** – when you trigger a material quiz (e.g. after 3 look-aways), it receives the **transcribing agent** output (or a raw merge fallback) and generates questions from that only.

**How to enable:** In the Zoom meeting, host clicks **Live Transcript** → **Enable Auto-Transcription** (or **Save Captions**). Participants using the zoomapp will then stream caption lines to the backend; the question agent uses this context for specialized questions on the material being discussed.

**Do I need to preload a lecture?** No. When Live Transcript is on, questions are created from **what was actually said** in the meeting (the last ~15 caption snippets). You can also use **Load sample transcript** (Report page or zoom-panel) to seed transcript for demos when you don’t have Live Transcript.

**Optional: Upload lecture to scope questions**  
To avoid questions that drift to out-of-context topics, you can upload lecture notes so the agent only asks about that material (plus the live transcript). The agent will use **only** the transcript + uploaded lecture; nothing else.

- **API:** `POST /api/meetings/:meetingId/lecture` with body `{ "text": "your lecture notes or slides text..." }`
- **GET** `/api/meetings/:meetingId/lecture` returns the current lecture text.

Example (replace `YOUR_MEETING_ID` with your Zoom meeting number):

```bash
curl -X POST http://localhost:3000/api/meetings/YOUR_MEETING_ID/lecture \
  -H "Content-Type: application/json" \
  -d '{"text": "Today we cover the Work-Energy Theorem. Net work equals change in kinetic energy. W = ΔKE."}'
```

>>>>>>> 2ee19f43f6a1eea13b901b0274534a99f0755dcc
---

## Built for TreeHacks 2026

**Team:** Building adaptive learning systems with AI + computer vision
**Stack:** Zoom SDK, Claude 3.5 Sonnet, MediaPipe, React, Node.js
