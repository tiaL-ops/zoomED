yay treehacks this is sm fun i lurv zoom and multi-agent claude systems yay

---
# baddies look at this to run everything, if we change run instructions change the bat pretty please :cry:

# to run (at highest level) - windows
```
start-all.bat
```
<<<<<<< HEAD
# MACCCCC - to run (at highest level)
```
chmod +x start-all.sh
./start-all.sh
```
=======

>>>>>>> 5f7493e (removed curl commands, fully autonomous updates)
# zoom working but very basic, need to figure out how to record meeting 

in the meantime:

* created a simple sample video
* detect the image using **MediaPipe**
* connect everything to **Express**
* used a mock dataset that simulates zoom data

---

# to run

**front**

```
cd client
npm run dev
```

**back**

```
cd server  
node index.js
```
**zoomap**
is its own cuz i was not sure it will work. very messy
to run zoom app :

we need zoom repo
### 4. Set Up Authentication Backend

The Meeting SDK requires a signature from an authentication backend:

```bash
git clone https://github.com/zoom/meetingsdk-auth-endpoint-sample --depth 1
cd meetingsdk-auth-endpoint-sample
cp .env.example .env
```

Edit `.env` with your credentials:
```env
CLIENT_SECRET=your_client_secret_here
# or
ZOOM_MEETING_SDK_SECRET=your_sdk_secret_here
```

Start the auth backend:
```bash
npm install && npm run start
```

### 5. Run the Sample App
```bash
npm start
```


```
cd zoomapp/meetingsdk-auth-endpoint-sample
npm install
npm start
```

new terminal:

```
cd zoomapp
npx serve -p 8080
```

open http://localhost:8080

---

current pages

* `/videoapp` → see engagement (gaze); optional: send `meetingId`/`userId` to feed agents
* `/poll` → generate quizzes (from static summary.txt or live meeting if `?meetingId=` has data)
* `/report` → teacher report: latest engagement summary, **engagement over time** (high vs low by window), **recent nudges sent**, and popup every 5 min when connected via WebSocket

see **ARCHITECTURE.md** for how the multi-agent pipeline, events, and report fit together.

---

# new additions

* **single server (index.js)** – meeting state, WebSocket, and all agents now run in one process: `/api/events`, `/api/tick`, `/api/report`, and a 5‑minute periodic summary that pushes to connected clients
* **gaze → agents** – optional `meetingId` / `userId` in `/api/analyze-gaze` stores attention as events so the engagement summarizer can use them
* **teacher report** – `/report` page: latest engagement summary, **time-based engagement** (“high here vs low here”), and **recent nudges sent**
* **nudge agent** – new agent that sends **supportive, in-the-moment nudges** to low-engagement attendees (not punishment). Runs automatically with the summarizer; nudges are broadcast over WebSocket so the **attendee** sees a refocus popup. Rate-limited (same user at most once per 4 min)
* **leaderboard** – `server/leaderboard.js` keeps per-meeting quiz scores when events include `QUIZ_ANSWER`
* **docs** – `ARCHITECTURE.md` describes current vs target flow and where Zoom RTMS would plug in

---

# fully automated flow (no curl needed)

You can run everything without manual `curl` or POST commands:

1. **Run `start-all.bat`** from the project root to start server, client, Zoom auth, and zoomapp.
2. **Join a meeting** via the zoomapp (http://localhost:8080). On join, the app automatically:
   - Sends `participant_joined` to bootstrap the meeting
   - Forwards all **chat messages** to the server
   - Sends **attention scores** (when you enable focus tracking) every 5 seconds
3. **Agents run automatically** every 5 minutes; no `POST /api/tick` needed.
4. **Teacher report:** Click **"Teacher: Open Report"** in the zoomapp (shown when in meeting) to open the Report page with the meeting ID pre-filled. Or open `http://localhost:5173/report?meetingId=YOUR_ZOOM_MEETING_ID`.
5. **VideoApp (optional):** Open `/videoapp?meetingId=X&userId=Y` and start the camera to feed gaze into the same meeting. Useful when using the VideoApp standalone (not via zoomapp).

---

# how to test the integration

**Prereqs:** Node 18+, `CLAUDE_API_KEY` in `server/.env`.

## 1. start backend and frontend

```bash
# Terminal 1 – server (port 3000)
cd server
npm install
node index.js
```

```bash
# Terminal 2 – client (port 5173)
cd client
npm install
npm run dev
```

then open **http://localhost:5173**.

## 2. test the poll page

* go to **Poll**. You can leave **Meeting ID** as `default` (or set it to match your curl/Zoom meeting).
* click **Generate Student Quizzes**. If there’s no live data for that meeting, you’ll see demo quizzes from `server/summary.txt` (Maya, Carlos, Liam). If there is live data (e.g. after step 4), you’ll see polls from the escalated meeting. **Later this same Meeting ID can come from the Zoom link.**

## 3. test the report page (no data yet)

* go to **report**, leave meeting ID as default and click refresh report
* should see error like “no meeting or no data yet” (expected until events exist).

## 4. TESTING FUNCTION: send events and run agents , will be live zoom data later

* **first option – POST events by hand (e.g. curl):**

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"default","type":"CHAT_MESSAGE","userId":"u1","displayName":"Alex"}'

curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"default","type":"ATTENTION_SCORE","userId":"u2","displayName":"Sam","cv_attention_score":0.5}'
```

* **option 2 - trigger one agent run**

```bash
curl -X POST http://localhost:3000/api/tick \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"default"}'
```

* go back to **Report**, click refresh — you should see a summary (class engagement, per-user, cold students) and last decision.
* **Link to Poll:** open **Poll**, set Meeting ID to `default` (same as in the curl `meetingId`), click Generate. With live data you’ll see polls from this meeting (escalation-after-nudge). Later the meeting ID will come from the Zoom link instead of curl.

## 5. test the 5‑minute popup

* stay on report with meeting ID `default`.  
* ensure you’ve sent at least one event and run `/api/tick` (or wait for the server’s 5‑minute timer)
* the page connects via WebSocket (you’ll see **● Live** when connected)
* every 5 minutes the server runs the summarizer and pushes `SUMMARY_UPDATE`; a **popup** should appear with the latest summary. (to test without waiting, temporarily change `SUMMARY_INTERVAL_MS` in `server/index.js` to e.g. `60 * 1000` for 1 minute.)

## 6. test gaze feeding into meeting state (optional)

* open **VideoApp** with URL params: `/videoapp?meetingId=default&userId=u1`
* start the camera and send gaze; attention is stored for that `meetingId`/`userId`
* run **report** or wait for the 5‑minute periodic summary to see attention in the summary. (The zoomapp also sends attention when focus tracking is enabled—no URL params needed.)

## 7. test the nudge agent (refocus popup for attendees)

* send events that create at least one low-engagement user (e.g. `userId: "u2"` with no chat and low/no attention), then run **POST /api/tick** with `meetingId: "default"`
* on the **Report** page, enter a **Preview as attendee (userId)** value that matches someone who got a nudge (e.g. `u2` or `Sam`), and stay on the page with WebSocket connected
* after the next agent run (or run `/api/tick` again), the server broadcasts `NUDGE` for that user; the Report page shows a **“Quick check-in” popup** with the supportive message (this is what the attendee would see in the Zoom app)
* the Report page also shows **Engagement over time** and **Recent nudges sent** so the teacher can see when engagement was high vs low and what nudges were sent

## 8. test chat from Zoom app (live meeting chat → engagement summarizer)

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
   * Run `POST /api/tick` with your meeting ID (or wait for the 5‑minute periodic run).
   * Open **Report**, set Meeting ID to your Zoom meeting ID, and refresh. The summary should include chat activity in per-user engagement.

**Note:** Only participants whose client runs the zoomapp will forward chat. Typically the **host** runs the zoomapp and forwards all chat messages to the backend.

---

**Claude API key:** [Create a key here](https://platform.claude.com/settings/keys) and set `CLAUDE_API_KEY` in `server/.env`.
