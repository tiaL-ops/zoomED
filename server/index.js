import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { WebSocketServer } from 'ws';
import { quizPollAgent, engagementSummarizerAgent, meetingCoordinatorAgent, nudgeAgent, orchestrateEngagementSystem } from './agents.js';
import { updateLeaderboard } from './leaderboard.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const WINDOW_MS = 5 * 60 * 1000; // 5 min for snapshot
const NUDGE_COOLDOWN_MS = 4 * 60 * 1000; // don't nudge same user more than once per 4 min
const lastNudgeByUser = new Map(); // key: meetingId:userId, value: timestamp

/** Build snapshot { users, recentPolls, recentTranscriptSnippets, recentQuestions } from meeting.events for agents */
function buildSnapshot(meeting) {
  const now = Date.now();
  const events = (meeting.events || []).filter((e) => e.ts && now - e.ts <= WINDOW_MS);
  const usersMap = new Map();
  for (const e of events) {
    const uid = e.userId ?? 'anonymous';
    const displayName = e.displayName ?? uid;
    if (!usersMap.has(uid)) {
      usersMap.set(uid, {
        userId: uid,
        displayName,
        signals: {
          polls_answered: 0,
          polls_missed: 0,
          chat_messages: 0,
          avg_response_latency_ms: 0,
          cv_attention_score: null,
          video_on: true,
          _latencies: [],
          _gaze: [],
        },
      });
    }
    const u = usersMap.get(uid);
    if (e.type === 'QUIZ_ANSWER' || e.type === 'QUIZ_RESPONSE') {
      u.signals.polls_answered += 1;
      if (e.responseTimeMs != null) u.signals._latencies.push(e.responseTimeMs);
    } else if (e.type === 'CHAT_MESSAGE' || e.type === 'CHAT') {
      u.signals.chat_messages += 1;
    } else if (e.type === 'ATTENTION_SCORE' || e.type === 'GAZE') {
      const score = e.cv_attention_score ?? e.avgGaze ?? e.gazeScore;
      if (score != null) u.signals._gaze.push(Number(score));
    }
    usersMap.set(uid, u);
  }
  const users = Array.from(usersMap.values()).map((u) => {
    const lat = u.signals._latencies;
    u.signals.avg_response_latency_ms = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
    const g = u.signals._gaze;
    u.signals.cv_attention_score = g.length ? g.reduce((a, b) => a + b, 0) / g.length : null;
    delete u.signals._latencies;
    delete u.signals._gaze;
    return u;
  });
  const recentPolls = events.filter((e) => e.type === 'QUIZ_ANSWER' || e.type === 'QUIZ_RESPONSE');
  const recentTranscriptSnippets = meeting.recentTranscriptSnippets || [];
  const recentQuestions = events.filter((e) => e.type === 'QUESTION');
  return { users, recentPolls, recentTranscriptSnippets, recentQuestions };
}

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

function canNudgeUser(meetingId, userId) {
  const key = `${meetingId}:${userId}`;
  const last = lastNudgeByUser.get(key);
  if (!last) return true;
  return Date.now() - last >= NUDGE_COOLDOWN_MS;
}

function recordNudgeSent(meetingId, userId) {
  lastNudgeByUser.set(`${meetingId}:${userId}`, Date.now());
}

/** True after 3+ refocus nudges have been sent; then the coordinator agent decides when to show a poll question. */
function shouldEscalateToPoll(meeting) {
  const nudgeCount = (meeting.recentNudges || []).length;
  return nudgeCount >= 3;
}

/** 1) Summarize. 2) Nudge first (give leeway). 3) Only if sustained low engagement, run coordinator and maybe generate poll. */
async function runAgentsForMeeting(meetingId) {
  const meeting = meetingState[meetingId];
  if (!meeting) return { error: 'no meeting' };
  const snapshot = buildSnapshot(meeting);
  const summary = await engagementSummarizerAgent(snapshot);
  meeting.lastSummary = summary;
  meeting.engagementHistory = meeting.engagementHistory || [];
  meeting.engagementHistory.push({
    at: new Date().toISOString(),
    class_engagement: summary.class_engagement,
    cold_students: summary.cold_students || [],
    summary: summary.summary,
  });
  const keep = 50;
  if (meeting.engagementHistory.length > keep) meeting.engagementHistory = meeting.engagementHistory.slice(-keep);

  // Step 1: Nudge first (give leeway—maybe away, restroom, parent). No punishment.
  try {
    const nudgeResult = await nudgeAgent(summary, { meetingType: 'education' });
    const nudges = nudgeResult.nudges || [];
    meeting.recentNudges = meeting.recentNudges || [];
    for (const n of nudges) {
      if (!canNudgeUser(meetingId, n.userId)) continue;
      recordNudgeSent(meetingId, n.userId);
      meeting.recentNudges.push({ ...n, at: new Date().toISOString() });
      if (meeting.recentNudges.length > 30) meeting.recentNudges = meeting.recentNudges.slice(-30);
      broadcast(meetingId, { type: 'NUDGE', payload: { userId: n.userId, displayName: n.displayName, message: n.message, reason: n.reason } });
    }
  } catch (e) {
    console.error('Nudge agent error:', e);
  }

  // Step 2: Only if engagement has been low for a sustained period, escalate to poll/coordinator
  let decision = null;
  if (shouldEscalateToPoll(meeting)) {
    decision = await meetingCoordinatorAgent(summary, snapshot);
    meeting.lastDecision = decision;
    if (decision.action === 'GENERATE_POLL') {
      const snippet = (snapshot.recentTranscriptSnippets || [])[0]?.text || (Array.isArray(snapshot.recentTranscriptSnippets) ? snapshot.recentTranscriptSnippets[0] : '') || '';
      const poll = await quizPollAgent(decision.target_topic || 'current topic', snippet, summary.class_engagement);
      broadcast(meetingId, { type: 'POLL_SUGGESTION', payload: { poll, reason: decision.reason, summary } });
    } else {
      broadcast(meetingId, { type: 'COORDINATOR_UPDATE', payload: { decision, summary } });
    }
  } else {
    broadcast(meetingId, { type: 'COORDINATOR_UPDATE', payload: { decision: { action: 'NONE', reason: 'Nudge first; escalate to poll only after sustained low engagement.', priority: 'low' }, summary } });
  }

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

// ----- NEW: Multi-agent orchestrator endpoint (per-participant chains) -----
app.post('/api/orchestrate', async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'missing meetingId' });
  
  const meeting = meetingState[meetingId];
  if (!meeting) return res.status(404).json({ error: 'meeting not found' });
  
  try {
    // Run the orchestrated multi-agent system
    const result = await orchestrateEngagementSystem(meeting, { 
      meetingType: 'education' 
    });
    
    // Store results in meeting state
    meeting.lastOrchestrationResult = result;
    meeting.lastSummary = result.summary;
    
    // Broadcast nudges to clients
    for (const nudge of result.nudges) {
      if (canNudgeUser(meetingId, nudge.userId)) {
        recordNudgeSent(meetingId, nudge.userId);
        broadcast(meetingId, { 
          type: 'NUDGE', 
          payload: { 
            userId: nudge.userId, 
            displayName: nudge.displayName, 
            message: nudge.message, 
            reason: nudge.reason 
          } 
        });
      }
    }
    
    // Broadcast quizzes to clients
    for (const quiz of result.quizzes) {
      broadcast(meetingId, { 
        type: 'PERSONALIZED_QUIZ', 
        payload: quiz 
      });
    }
    
    res.json(result);
  } catch (err) {
    console.error('Error in /api/orchestrate:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- Nudge popup left open 15–20+ sec: client calls this to trigger question agent -----
app.post('/api/nudge-timeout', async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'missing meetingId' });
  try {
    const result = await runAgentsForMeeting(meetingId);
    res.json(result);
  } catch (err) {
    console.error('Error in /api/nudge-timeout:', err);
    res.status(500).json({ error: err.message });
  }
});

// ----- Report for teacher: latest summary, time-based engagement, recent nudges -----
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
    engagementHistory: meeting.engagementHistory ?? [],
    // Nudges omitted from teacher report to give students leeway; only question/poll escalation is shown
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

// ----- Periodic: same nudge-first flow — summarizer → nudge → escalate to poll only if sustained low -----
const SUMMARY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(async () => {
  for (const meetingId of Object.keys(meetingState)) {
    const meeting = meetingState[meetingId];
    if (!meeting?.events?.length) continue;
    try {
      const snapshot = buildSnapshot(meeting);
      const summary = await engagementSummarizerAgent(snapshot);
      meeting.lastSummary = summary;
      meeting.engagementHistory = meeting.engagementHistory || [];
      meeting.engagementHistory.push({
        at: new Date().toISOString(),
        class_engagement: summary.class_engagement,
        cold_students: summary.cold_students || [],
        summary: summary.summary,
      });
      if (meeting.engagementHistory.length > 50) meeting.engagementHistory = meeting.engagementHistory.slice(-50);
      broadcast(meetingId, { type: 'SUMMARY_UPDATE', payload: { summary, at: new Date().toISOString() } });
      // Nudge first (leeway for away/restroom/parent)
      const nudgeResult = await nudgeAgent(summary, { meetingType: 'education' }).catch((e) => ({ nudges: [] }));
      const nudges = nudgeResult.nudges || [];
      meeting.recentNudges = meeting.recentNudges || [];
      for (const n of nudges) {
        if (!canNudgeUser(meetingId, n.userId)) continue;
        recordNudgeSent(meetingId, n.userId);
        meeting.recentNudges.push({ ...n, at: new Date().toISOString() });
        if (meeting.recentNudges.length > 30) meeting.recentNudges = meeting.recentNudges.slice(-30);
        broadcast(meetingId, { type: 'NUDGE', payload: { userId: n.userId, displayName: n.displayName, message: n.message, reason: n.reason } });
      }
      // Only if sustained low engagement: run coordinator and maybe generate poll
      if (shouldEscalateToPoll(meeting)) {
        const decision = await meetingCoordinatorAgent(summary, snapshot);
        meeting.lastDecision = decision;
        if (decision.action === 'GENERATE_POLL') {
          const snippet = (snapshot.recentTranscriptSnippets || [])[0]?.text || (Array.isArray(snapshot.recentTranscriptSnippets) ? snapshot.recentTranscriptSnippets[0] : '') || '';
          const poll = await quizPollAgent(decision.target_topic || 'current topic', snippet, summary.class_engagement);
          broadcast(meetingId, { type: 'POLL_SUGGESTION', payload: { poll, reason: decision.reason, summary } });
        } else {
          broadcast(meetingId, { type: 'COORDINATOR_UPDATE', payload: { decision, summary } });
        }
      }
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
