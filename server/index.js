// server/index.js
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";

import { engagementSummarizerAgent, meetingCoordinatorAgent, quizPollAgent, notesExtractorAgent, agentNotesChatAgent } from "./agents.js";
import { updateLeaderboard } from "./leaderboard.js";

async function runAgentsForMeeting(meetingId) {
  const meeting = meetingState[meetingId];
  if (!meeting) return { error: "no meeting" };

  const summary = await engagementSummarizerAgent(meeting);
  const decision = await meetingCoordinatorAgent(summary, meeting);

  if (decision.action === "GENERATE_POLL") {
    const snippet = (meeting.recentTranscriptSnippets || [])[0]?.text || "";
    const poll = await quizPollAgent(decision.target_topic || "current topic", snippet, summary.class_engagement);
    broadcast(meetingId, {
      type: "POLL_SUGGESTION",
      payload: { poll, reason: decision.reason, summary },
    });
  } else {
    broadcast(meetingId, {
      type: "COORDINATOR_UPDATE",
      payload: { decision, summary },
    });
  }

  return { summary, decision };
}

const app = express();
app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ noServer: true });
const socketsByMeeting = new Map();

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// Helper: broadcast to all clients in a meeting
function broadcast(meetingId, msg) {
  const set = socketsByMeeting.get(meetingId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

// In-memory meeting state (hackathon-safe)
const meetingState = {};

// In-memory notes storage
const notesStorage = {};

// HTTP endpoint to receive events from Zoom app
app.post("/api/events", async (req, res) => {
  const event = req.body;
  const { meetingId } = event;
  if (!meetingId) return res.status(400).send("missing meetingId");

  // Store event in meetingState
  meetingState[meetingId] = meetingState[meetingId] || { events: [], transcriptSnippets: [] };
  meetingState[meetingId].events.push({ ...event, ts: Date.now() });

  // If it's a transcript update, store it
  if (event.type === "TRANSCRIPT_UPDATE") {
    meetingState[meetingId].transcriptSnippets.push({
      text: event.text,
      speaker: event.speaker,
      timestamp: event.timestamp || new Date().toISOString(),
    });
  }

  // If it's a quiz answer, update leaderboard immediately
  if (event.type === "QUIZ_ANSWER") {
    const leaderboardUpdate = updateLeaderboard(meetingId, event);
    broadcast(meetingId, { type: "LEADERBOARD_UPDATE", payload: leaderboardUpdate });
  }

  res.json({ ok: true });
});

// Endpoint to generate notes from meeting transcript
app.post("/api/generate-notes", async (req, res) => {
  const { meetingId, userConversation } = req.body;
  if (!meetingId) return res.status(400).send("missing meetingId");

  try {
    const meeting = meetingState[meetingId];
    if (!meeting) return res.status(404).send("meeting not found");

    // Build full transcript from snippets
    const transcript = (meeting.transcriptSnippets || [])
      .map((s) => `[${s.speaker}]: ${s.text}`)
      .join("\n");

    if (!transcript.trim()) {
      return res.status(400).send("no transcript available");
    }

    // Generate notes using agent
    const notes = await notesExtractorAgent(transcript, userConversation || "");
    
    // Store notes
    notesStorage[meetingId] = {
      ...notes,
      generatedAt: new Date().toISOString(),
      transcriptLength: transcript.length,
    };

    // Broadcast notes to clients
    broadcast(meetingId, {
      type: "NOTES_GENERATED",
      payload: notesStorage[meetingId],
    });

    res.json({
      ok: true,
      notes: notesStorage[meetingId],
    });
  } catch (error) {
    console.error("Error generating notes:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint to retrieve generated notes
app.get("/api/notes/:meetingId", (req, res) => {
  const { meetingId } = req.params;
  const notes = notesStorage[meetingId];
  
  if (!notes) {
    return res.status(404).json({ error: "notes not found" });
  }

  res.json({ ok: true, notes });
});

// Endpoint to refine notes through agent conversation
app.post("/api/notes/:meetingId/chat", async (req, res) => {
  const { meetingId } = req.params;
  const { query } = req.body;

  if (!query) return res.status(400).send("missing query");

  try {
    const currentNotes = notesStorage[meetingId];
    if (!currentNotes) {
      return res.status(404).send("notes not found, generate them first");
    }

    const updatedNotes = await agentNotesChatAgent(query, currentNotes);
    
    // Merge updates
    notesStorage[meetingId] = {
      ...currentNotes,
      ...updatedNotes,
      updatedAt: new Date().toISOString(),
    };

    broadcast(meetingId, {
      type: "NOTES_UPDATED",
      payload: notesStorage[meetingId],
    });

    res.json({
      ok: true,
      notes: notesStorage[meetingId],
    });
  } catch (error) {
    console.error("Error updating notes:", error);
    res.status(500).json({ error: String(error) });
  }
});

// WebSocket upgrade for pushing updates to Zoom clients
const serverHttp = app.listen(3000, () => console.log("Server on 3000"));

serverHttp.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Read meetingId from query string ?meetingId=...
    const url = new URL(req.url, "http://localhost");
    const meetingId = url.searchParams.get("meetingId");
    let set = socketsByMeeting.get(meetingId);
    if (!set) {
      set = new Set();
      socketsByMeeting.set(meetingId, set);
    }
    set.add(ws);
    ws.on("close", () => set.delete(ws));
  });
});