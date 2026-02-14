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
## Zoom Meeting SDK (no ngrok)

Meeting SDK flow – open in browser, join meeting, see engagement panel.

1. **Auth backend** (port 4000):
   ```
   cd zoomapp/meetingsdk-auth-endpoint-sample
   cp .env.example .env   # add ZOOM_MEETING_SDK_KEY and ZOOM_MEETING_SDK_SECRET
   npm install && npm start
   ```

2. **TreeHacks backend** (port 3000):
   ```
   cd server && node index.js
   ```

3. **Serve zoomapp** (port 8080):
   ```
   cd zoomapp && npx serve -p 8080
   ```

4. **Open** http://localhost:8080 → Join meeting → Engagement sidebar appears.

---

current pages

* `/videoapp` → see engagement
* `/poll` → based on fake data

---

# Zoom-native side panel (Vite + React, @zoom/appssdk)

* **Dev:** `cd zoom-panel && npm install && npm run dev` → panel at **http://localhost:5174** (proxies `/api` to backend).
* **Built panel (served by backend):** `cd zoom-panel && npm run build` then start server → **http://localhost:3000/panel/** serves the built app.
* **Inside Zoom:** use ngrok to expose 5174 (dev) or your deployed URL; set that as the Zoom App side panel URL. See `zoom-panel/README.md`.
* **Endpoints:** `POST /api/meetings/:meetingId/events`, `POST /api/zoom/webhook`, `POST /api/meetings/:meetingId/run-agents`, `POST /api/meetings/:meetingId/generate-poll`

---

to use Claude:
go to [https://platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) and create your API key
