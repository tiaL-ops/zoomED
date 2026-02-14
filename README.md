yay treehacks this is sm fun i lurv zoom and multi-agent claude systems yay

---

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
* `/report` → teacher report: latest engagement summary (during or after meeting); popup every 5 min when connected via WebSocket

see **ARCHITECTURE.md** for how the multi-agent pipeline, events, and report fit together.

---

# new additions

* **single server (index.js)** – meeting state, WebSocket, and all agents now run in one process: `/api/events`, `/api/tick`, `/api/report`, and a 5‑minute periodic summary that pushes to connected clients
* **gaze → agents** – optional `meetingId` / `userId` in `/api/analyze-gaze` stores attention as events so the engagement summarizer can use them
* **teacher report** – new `/report` page: fetch latest engagement summary (during or after meeting). WebSocket gives live updates and a **popup every 5 minutes** with latest summary
* **leaderboard** – `server/leaderboard.js` keeps per-meeting quiz scores when events include `QUIZ_ANSWER`.
* **docs** – `ARCHITECTURE.md` describes current vs target flow and where Zoom RTMS would plug in

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

## 2. test the poll page (static data)

* go to poll, click generate student quizzes
* will be able to see quizzes generated from `server/summary.txt` for maya, carlos, liam. 
* no meeting state needed; this uses the existing demo data.

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

* go back to report, click refresh. should see a summary (class engagement, per-user, cold students) and last decision

## 5. test the 5‑minute popup

* stay on report with meeting ID `default`.  
* ensure you’ve sent at least one event and run `/api/tick` (or wait for the server’s 5‑minute timer)
* the page connects via WebSocket (you’ll see **● Live** when connected)
* every 5 minutes the server runs the summarizer and pushes `SUMMARY_UPDATE`; a **popup** should appear with the latest summary. (to test without waiting, temporarily change `SUMMARY_INTERVAL_MS` in `server/index.js` to e.g. `60 * 1000` for 1 minute.)

## 6. test gaze feeding into meeting state (optional)

* the video app currently does not send `meetingId`/`userId`. to feed gaze into agents, we need to add those fields to the `/api/analyze-gaze` request body in `client/src/components/VideoApp.jsx`.  
*after that, start the camera, send gaze a few times, then run **report** or **POST /api/tick** for the same `meetingId` to see attention in the summary

---

**Claude API key:** [Create a key here](https://platform.claude.com/settings/keys) and set `CLAUDE_API_KEY` in `server/.env`.
