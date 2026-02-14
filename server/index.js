import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { WebSocketServer } from 'ws';
import { quizPollAgent, engagementSummarizerAgent, meetingCoordinatorAgent } from './agents.js';
import { updateLeaderboard } from './leaderboard.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// ----- Meeting state & WebSocket (multi-agent pipeline) -----
const meetingState = {};
const wss = new WebSocketServer({ noServer: true });
const socketsByMeeting = new Map();

function broadcast(meetingId, msg) {
  const set = socketsByMeeting.get(meetingId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

async function runAgentsForMeeting(meetingId) {
  const meeting = meetingState[meetingId];
  if (!meeting) return { error: 'no meeting' };
  const summary = await engagementSummarizerAgent(meeting);
  const decision = await meetingCoordinatorAgent(summary, meeting);
  if (decision.action === 'GENERATE_POLL') {
    const snippet = (meeting.recentTranscriptSnippets || [])[0]?.text || '';
    const poll = await quizPollAgent(decision.target_topic || 'current topic', snippet, summary.class_engagement);
    broadcast(meetingId, { type: 'POLL_SUGGESTION', payload: { poll, reason: decision.reason, summary } });
  } else {
    broadcast(meetingId, { type: 'COORDINATOR_UPDATE', payload: { decision, summary } });
  }
  meeting.lastSummary = summary;
  meeting.lastDecision = decision;
  return { summary, decision };
}

// ----- Middleware -----
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *;");
  next();
});
app.use(express.static(path.join(__dirname, '../videoapp')));
// Zoom App side panel (Vite build; run `cd zoom-panel && npm run build` to populate dist)
app.use('/panel', express.static(path.join(__dirname, '../zoom-panel/dist')));

// ----- Gaze: immediate response + optional store as engagement event -----
app.post('/api/analyze-gaze', (req, res) => {
  const { avgGaze, meetingId, userId, displayName } = req.body;
  if (typeof avgGaze !== 'number') {
    return res.status(400).json({ error: 'avgGaze must be a number' });
  }
  let status, background, direction;
  if (avgGaze < 0.38) {
    status = 'BORED';
    background = 'yellow';
    direction = 'Looking Left 👈';
  } else if (avgGaze > 0.62) {
    status = 'BORED';
    background = 'yellow';
    direction = 'Looking Right 👉';
  } else {
    status = 'FOCUS';
    background = '#00ff00';
    direction = 'Center ';
  }
  if (meetingId && (userId != null || displayName != null)) {
    meetingState[meetingId] = meetingState[meetingId] || { events: [], recentTranscriptSnippets: [] };
    meetingState[meetingId].events.push({
      type: 'ATTENTION_SCORE',
      userId: userId ?? 'unknown',
      displayName: displayName ?? 'Unknown',
      cv_attention_score: avgGaze,
      ts: Date.now(),
    });
  }
  res.json({ status, background, direction });
});

// ----- Ingest events from Zoom app or any client -----
app.post('/api/events', (req, res) => {
  const event = req.body;
  const { meetingId } = event;
  if (!meetingId) return res.status(400).json({ error: 'missing meetingId' });
  meetingState[meetingId] = meetingState[meetingId] || { events: [], recentTranscriptSnippets: [] };
  meetingState[meetingId].events.push({ ...event, ts: Date.now() });
  if (event.type === 'QUIZ_ANSWER') {
    const leaderboardUpdate = updateLeaderboard(meetingId, event);
    broadcast(meetingId, { type: 'LEADERBOARD_UPDATE', payload: leaderboardUpdate });
  }
  res.json({ ok: true });
});

// ----- Manual trigger: run agents once (e.g. from instructor UI) -----
app.post('/api/tick', async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'missing meetingId' });
  try {
    const result = await runAgentsForMeeting(meetingId);
    res.json(result);
  } catch (err) {
    console.error('Error in /api/tick:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- Report for teacher: latest summary (during or after meeting) -----
app.get('/api/report', (req, res) => {
  const { meetingId } = req.query;
  if (!meetingId) return res.status(400).json({ error: 'missing meetingId' });
  const meeting = meetingState[meetingId];
  if (!meeting) return res.status(404).json({ error: 'no meeting or no data yet' });
  const report = {
    meetingId,
    lastSummary: meeting.lastSummary ?? null,
    lastDecision: meeting.lastDecision ?? null,
    eventCount: (meeting.events || []).length,
  };
  res.json(report);
});

// ----- Poll: from summary.txt (demo) or from live meeting if meetingId provided -----
app.get('/api/poll', async (req, res) => {
  const { meetingId } = req.query;
  if (meetingId && meetingState[meetingId]?.lastSummary) {
    const meeting = meetingState[meetingId];
    const summary = meeting.lastSummary;
    const topic = meeting.lastDecision?.target_topic || 'current topic';
    const snippet = (meeting.recentTranscriptSnippets || [])[0]?.text || '';
    try {
      const poll = await quizPollAgent(topic, snippet, summary.class_engagement);
      return res.json({ success: true, topic, studentPolls: [{ student: 'Class', engagementLevel: summary.class_engagement, poll }], source: 'live' });
    } catch (e) {
      console.error('Live poll error:', e);
    }
  }
  try {
    const summaryPath = path.join(__dirname, 'summary.txt');
    const summaryContent = await fs.readFile(summaryPath, 'utf-8');
    const topicMatch = summaryContent.match(/\*\*Topic:\*\* (.*)/);
    const topic = topicMatch ? topicMatch[1] : 'Work and Energy - AP Physics';
    const students = [];
    const mayaMatch = summaryContent.match(/Student A \(Maya\):.*?High Engagement\.(.*?)(?=\*|$)/s);
    if (mayaMatch) {
      const mayaSnippetMatch = summaryContent.match(/\*\*Maya.*?\*\*.*?"(.*?)"/s);
      students.push({ name: 'Maya', engagementLevel: 3, transcriptSnippet: mayaSnippetMatch ? mayaSnippetMatch[1] : 'Understanding the relationship between work and kinetic energy', description: 'High Engagement - actively participated' });
    }
    const carlosMatch = summaryContent.match(/Student B \(Carlos\):.*?Medium Engagement\.(.*?)(?=\*|$)/s);
    if (carlosMatch) {
      const carlosSnippetMatch = summaryContent.match(/\*\*Carlos.*?\*\*.*?"(.*?)"/s);
      students.push({ name: 'Carlos', engagementLevel: 2, transcriptSnippet: carlosSnippetMatch ? carlosSnippetMatch[1] : 'The component of force that does work on the crate', description: 'Medium Engagement - following along with prompts' });
    }
    const liamMatch = summaryContent.match(/Student C \(Liam\):.*?Low Engagement\.(.*?)(?=\*|$)/s);
    if (liamMatch) {
      students.push({ name: 'Liam', engagementLevel: 1, transcriptSnippet: 'A 5kg mass is at rest. I apply a force that does 100J of work. What is the final velocity?', description: 'Low Engagement - needs basic review' });
    }
    const studentPolls = [];
    for (const student of students) {
      const poll = await quizPollAgent(topic, student.transcriptSnippet, student.engagementLevel);
      studentPolls.push({ student: student.name, engagementLevel: student.engagementLevel, description: student.description, poll });
    }
    res.json({ success: true, topic, studentPolls, source: 'summary.txt' });
  } catch (error) {
    console.error('Error generating poll:', error);
    res.status(500).json({ success: false, error: 'Failed to generate poll', message: error.message });
  }
});

// ----- HTTP server + WebSocket upgrade -----
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const meetingId = url.searchParams.get('meetingId') || 'default';
  let set = socketsByMeeting.get(meetingId);
  if (!set) { set = new Set(); socketsByMeeting.set(meetingId, set); }
  set.add(ws);
  ws.on('close', () => set.delete(ws));
});

// ----- Periodic summary: every N minutes, run summarizer and push to teacher (popup) -----
const SUMMARY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(async () => {
  for (const meetingId of Object.keys(meetingState)) {
    const meeting = meetingState[meetingId];
    if (!meeting?.events?.length) continue;
    try {
      const summary = await engagementSummarizerAgent(meeting);
      meeting.lastSummary = summary;
      broadcast(meetingId, { type: 'SUMMARY_UPDATE', payload: { summary, at: new Date().toISOString() } });
    } catch (e) {
      console.error('Periodic summary error for', meetingId, e);
    }
  }
}, SUMMARY_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (API + WebSocket)`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});
