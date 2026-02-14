// server/index.ts
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";

import { engagementSummarizerAgent, meetingCoordinatorAgent, quizPollAgent } from "./agents";
import { updateLeaderboard } from "./leaderboard";

async function runAgentsForMeeting(meetingId: string) {
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
const socketsByMeeting = new Map<string, Set<any>>();

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });

// Helper: broadcast to all clients in a meeting
function broadcast(meetingId: string, msg: any) {
  const set = socketsByMeeting.get(meetingId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

// In-memory meeting state (hackathon-safe)
const meetingState: Record<string, any> = {};

// HTTP endpoint to receive events from Zoom app
app.post("/api/events", async (req, res) => {
  const event = req.body;
  const { meetingId } = event;
  if (!meetingId) return res.status(400).send("missing meetingId");

  // Store event in meetingState
  meetingState[meetingId] = meetingState[meetingId] || { events: [] };
  meetingState[meetingId].events.push({ ...event, ts: Date.now() });

  // If it's a quiz answer, update leaderboard immediately
  if (event.type === "QUIZ_ANSWER") {
    const leaderboardUpdate = updateLeaderboard(meetingId, event);
    broadcast(meetingId, { type: "LEADERBOARD_UPDATE", payload: leaderboardUpdate });
  }

  res.json({ ok: true });
});

// Simple HTTP endpoint to trigger an "agent tick" from instructor UI
app.post("/api/tick", async (req, res) => {
  const { meetingId } = req.body;
  const result = await runAgentsForMeeting(meetingId);
  res.json(result);
});

// WebSocket upgrade for pushing updates to Zoom clients
const serverHttp = app.listen(3000, () => console.log("Server on 3000"));

serverHttp.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Read meetingId from query string ?meetingId=...
    const url = new URL(req.url!, "http://localhost");
    const meetingId = url.searchParams.get("meetingId")!;
    let set = socketsByMeeting.get(meetingId);
    if (!set) {
      set = new Set();
      socketsByMeeting.set(meetingId, set);
    }
    set.add(ws);
    ws.on("close", () => set!.delete(ws));
  });
});
