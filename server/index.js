import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import {
  engagementSummarizerAgent,
  meetingCoordinatorAgent,
  quizPollAgent,
} from './agents.js';
import { appendEvent, getWindow } from './meetingStore.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Remove restrictive CSP or set a permissive one for development
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src *;"
    );
    next();
});

// Serve static files from videoapp directory
app.use(express.static(path.join(__dirname, '../videoapp')));
// Zoom App side panel (Vite build; run `cd zoom-panel && npm run build` to populate dist)
app.use('/panel', express.static(path.join(__dirname, '../zoom-panel/dist')));

// API endpoint: receives avgGaze and returns status; optionally appends GAZE event if meetingId/userId provided
app.post('/api/analyze-gaze', (req, res) => {
    const { avgGaze, meetingId, userId, displayName } = req.body;

    if (typeof avgGaze !== 'number') {
        return res.status(400).json({ error: 'avgGaze must be a number' });
    }

    let status, background, direction;

    if (avgGaze < 0.38) {
        status = "BORED";
        background = "yellow";
        direction = "Looking Left 👈";
    } else if (avgGaze > 0.62) {
        status = "BORED";
        background = "yellow";
        direction = "Looking Right 👉";
    } else {
        status = "FOCUS";
        background = "#00ff00";
        direction = "Center ";
    }

    const mid = meetingId ?? 'demo';
    const uid = userId ?? 'demo-user';
    appendEvent(mid, {
        type: 'GAZE',
        userId: uid,
        displayName: displayName ?? uid,
        gazeScore: avgGaze,
        avgGaze,
    });

    res.json({ status, background, direction });
});

// --- Zoom-native meeting state & agent loop ---

// Ingest events from zoom panel or web client
app.post('/api/meetings/:meetingId/events', (req, res) => {
  const { meetingId } = req.params;
  const body = req.body;
  if (!body.type) {
    return res.status(400).json({ error: 'event must have type' });
  }
  appendEvent(meetingId, { ...body, userId: body.userId ?? 'anonymous', ts: body.ts ?? Date.now() });
  res.status(201).json({ ok: true });
});

// Zoom webhook: meeting.started, participant.joined/left, etc.
app.post('/api/zoom/webhook', (req, res) => {
  const payload = req.body;
  const event = payload.event;
  const obj = payload.payload?.object ?? payload.object ?? {};
  const meetingId = String(obj.id ?? obj.meeting_id ?? payload.meeting_id ?? 'unknown');
  if (!event) {
    return res.status(400).json({ error: 'missing event' });
  }
  const ts = Date.now();
  if (event === 'meeting.started') {
    appendEvent(meetingId, { type: 'MEETING_STARTED', meetingId, ts });
  } else if (event === 'meeting.ended') {
    appendEvent(meetingId, { type: 'MEETING_ENDED', meetingId, ts });
  } else if (event === 'participant.joined') {
    const userId = obj.participant?.user_id ?? obj.user_id ?? 'unknown';
    const displayName = obj.participant?.user_name ?? obj.user_name ?? userId;
    appendEvent(meetingId, { type: 'PARTICIPANT_JOINED', userId, displayName, ts });
  } else if (event === 'participant.left') {
    const userId = obj.participant?.user_id ?? obj.user_id ?? 'unknown';
    appendEvent(meetingId, { type: 'PARTICIPANT_LEFT', userId, ts });
  }
  res.status(200).send();
});

// Debug: current meeting state (normalized snapshot)
app.get('/api/meetings/:meetingId/state', (req, res) => {
  const { meetingId } = req.params;
  const windowSeconds = Math.min(Number(req.query.windowSeconds) || 300, 900);
  const snapshot = getWindow(meetingId, windowSeconds);
  res.json(snapshot);
});

// Agent loop: getWindow -> engagementSummarizer -> meetingCoordinator -> optional quizPollAgent
app.post('/api/meetings/:meetingId/run-agents', async (req, res) => {
  const { meetingId } = req.params;
  const windowSeconds = Math.min(Number(req.body?.windowSeconds) || 300, 900);
  try {
    const snapshot = getWindow(meetingId, windowSeconds);
    const engagementSummary = await engagementSummarizerAgent(snapshot);
    const action = await meetingCoordinatorAgent(engagementSummary, snapshot);

    let poll = null;
    if (action.action === 'GENERATE_POLL') {
      const topic = action.target_topic ?? 'General understanding';
      const snippet = snapshot.recentTranscriptSnippets?.[0] ?? topic;
      const level = engagementSummary.class_engagement ?? 2;
      poll = await quizPollAgent(topic, snippet, level);
    }

    const snapshotSummary = {
      meetingId: snapshot.meetingId,
      userCount: snapshot.users?.length ?? 0,
      recentPollsCount: snapshot.recentPolls?.length ?? 0,
      recentQuestionsCount: snapshot.recentQuestions?.length ?? 0,
    };

    res.json({
      snapshotSummary,
      engagementSummary,
      action,
      ...(poll && { poll }),
    });
  } catch (err) {
    console.error('run-agents error:', err);
    res.status(500).json({ error: 'run-agents failed', message: err.message });
  }
});

// Instructor-triggered quick check poll (topic/snippet optional)
app.post('/api/meetings/:meetingId/generate-poll', async (req, res) => {
  const { meetingId } = req.params;
  const { topic = 'General understanding', transcriptSnippet } = req.body;
  try {
    const snippet = transcriptSnippet ?? topic;
    const poll = await quizPollAgent(topic, snippet, 2);
    res.json({ poll });
  } catch (err) {
    console.error('generate-poll error:', err);
    res.status(500).json({ error: 'generate-poll failed', message: err.message });
  }
});

// API endpoint: generate poll from summary.txt (existing client)
app.get('/api/poll', async (req, res) => {
    try {
        // Read summary.txt
        const summaryPath = path.join(__dirname, 'summary.txt');
        const summaryContent = await fs.readFile(summaryPath, 'utf-8');
        
        // Extract topic from the summary
        const topicMatch = summaryContent.match(/\*\*Topic:\*\* (.*)/);
        const topic = topicMatch ? topicMatch[1] : "Work and Energy - AP Physics";
        
        // Parse student engagement from the Student Engagement Breakdown section
        const students = [];
        
        // Extract Maya (High Engagement)
        const mayaMatch = summaryContent.match(/Student A \(Maya\):.*?High Engagement\.(.*?)(?=\*|$)/s);
        if (mayaMatch) {
            // Find Maya's interactions in transcript
            const mayaSnippetMatch = summaryContent.match(/\*\*Maya.*?\*\*.*?"(.*?)"/s);
            students.push({
                name: "Maya",
                engagementLevel: 3,
                transcriptSnippet: mayaSnippetMatch ? mayaSnippetMatch[1] : "Understanding the relationship between work and kinetic energy",
                description: "High Engagement - actively participated"
            });
        }
        
        // Extract Carlos (Medium Engagement)
        const carlosMatch = summaryContent.match(/Student B \(Carlos\):.*?Medium Engagement\.(.*?)(?=\*|$)/s);
        if (carlosMatch) {
            const carlosSnippetMatch = summaryContent.match(/\*\*Carlos.*?\*\*.*?"(.*?)"/s);
            students.push({
                name: "Carlos",
                engagementLevel: 2,
                transcriptSnippet: carlosSnippetMatch ? carlosSnippetMatch[1] : "The component of force that does work on the crate",
                description: "Medium Engagement - following along with prompts"
            });
        }
        
        // Extract Liam (Low Engagement)
        const liamMatch = summaryContent.match(/Student C \(Liam\):.*?Low Engagement\.(.*?)(?=\*|$)/s);
        if (liamMatch) {
            students.push({
                name: "Liam",
                engagementLevel: 1,
                transcriptSnippet: "A 5kg mass is at rest. I apply a force that does 100J of work. What is the final velocity?",
                description: "Low Engagement - needs basic review"
            });
        }
        
        // Generate polls for each student based on their engagement level
        const studentPolls = [];
        
        for (const student of students) {
            const poll = await quizPollAgent(
                topic,
                student.transcriptSnippet,
                student.engagementLevel
            );
            
            studentPolls.push({
                student: student.name,
                engagementLevel: student.engagementLevel,
                description: student.description,
                poll: poll
            });
        }
        
        res.json({
            success: true,
            topic: topic,
            studentPolls: studentPolls,
            source: 'summary.txt'
        });
    } catch (error) {
        console.error('Error generating poll:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate poll',
            message: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error("Server failed to start:", err);
});