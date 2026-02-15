// server/agents.js
import Anthropic from "@anthropic-ai/sdk";

let anthropic = null;
let apiKeyWarned = false;

function getAnthropicClient() {
  if (!process.env.CLAUDE_API_KEY) {
    if (!apiKeyWarned) {
      apiKeyWarned = true;
      console.warn("CLAUDE_API_KEY not set. Create server/.env with CLAUDE_API_KEY=your_key. Get one at https://console.anthropic.com/settings/keys");
    }
    return null;
  }
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    console.log("Claude API initialized successfully");
  }
  return anthropic;
}

/** Extract a single JSON object from text (handles markdown, trailing content, extra newlines) */
function extractJSON(text) {
  if (!text || typeof text !== "string") throw new Error("No text to parse");
  const trimmed = text.trim();
  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch (_) {}
  // Try to find JSON object: first { to matching }
  const start = trimmed.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Unbalanced braces in response");
  const jsonStr = trimmed.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

async function callClaudeJSON(system, user) {
  const client = getAnthropicClient();
  if (!client) return null;
  const resp = await client.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = resp.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }
  return extractJSON(textBlock.text);
}

// agent #1: engagement summarizer (accepts snapshot with pre-built users)
export async function engagementSummarizerAgent(snapshot) {
  const users = snapshot.users || [];

  const system = `
You are an engagement summarizer for a live Zoom class.
You ONLY analyze engagement signals (polls, chat, attention scores).
For each user, assign engagement 1 (low), 2 (medium), or 3 (high).
Return STRICT JSON:
{
  "class_engagement": 1|2|3,
  "per_user": [{"userId": "...", "engagement": 1|2|3, "reason": "short"}],
  "cold_students": ["userId", ...],
  "summary": "1-2 sentences"
}
`;

  const result = await callClaudeJSON(system, JSON.stringify({ users }));
  if (result) return result;
  // Fallback when CLAUDE_API_KEY not set
  return {
    class_engagement: 2,
    per_user: users.map((u) => ({ userId: u.userId || u.displayName, engagement: 2, reason: "API not configured" })),
    cold_students: [],
    summary: "Claude API key not set—engagement features disabled. Add CLAUDE_API_KEY to server/.env",
  };
}

// agent #2: meeting coordinator agent (accepts snapshot with recentPolls, recentTranscriptSnippets, recentQuestions)
export async function meetingCoordinatorAgent(summary, snapshot) {
  const recentPolls = (snapshot.recentPolls || []).slice(-20);
  const recentTranscriptSnippets = snapshot.recentTranscriptSnippets || [];
  const recentQuestions = snapshot.recentQuestions || [];

  const system = `
You are the meeting coordinator for a Zoom class.
Decide an action based on engagement and recent polls.
Actions:
- "NONE"
- "GENERATE_POLL"
- "PROMPT_INSTRUCTOR"
- "HIGHLIGHT_COLD_STUDENTS"
Pick ONE.
Return JSON:
{
  "action": "NONE" | "GENERATE_POLL" | "PROMPT_INSTRUCTOR" | "HIGHLIGHT_COLD_STUDENTS",
  "target_topic": "string or null",
  "reason": "short",
  "priority": "low" | "medium" | "high"
}
Give GENERATE_POLL or PROMPT_INSTRUCTOR when class_engagement is 1 or many cold_students.
`;

  const user = JSON.stringify({
    summary,
    recentPolls,
    recentTranscriptSnippets,
    recentQuestions,
  });

  const result = await callClaudeJSON(system, user);
  if (result) return result;
  return { action: "NONE", target_topic: null, reason: "API not configured", priority: "low" };
}

// agent #3: nudge agent – first line of defense: gentle nudge with leeway (away, restroom, speaking to someone briefly, etc.)
export async function nudgeAgent(summary, options = {}) {
  const meetingType = options.meetingType || 'education'; // 'education' | 'meeting'
  const cold = summary.cold_students || [];
  const perUser = summary.per_user || [];
  const lowEngagement = perUser.filter((u) => u.engagement === 1).map((u) => ({ userId: u.userId, displayName: u.displayName, reason: u.reason }));

  const system = `
You are a nudge agent for a live meeting. Your job is to suggest short, supportive messages to re-engage attendees who appear disengaged.
Give them leeway: they might be away briefly, in the restroom, or have a parent or someone else speaking to them. The nudge should be kind and assume good intent—not punishment or guilt. Frame as "when you're back, we'd love to have you with us" or "no rush—rejoin when you're ready."
For education: warm, encouraging, understanding.
For adult/professional meetings: neutral, professional (e.g. "When you're free, we'd love your input").
Only suggest nudges for the low-engagement users provided. One nudge per user; keep each message to 1–2 short sentences.
Return STRICT JSON only, no other text:
{
  "nudges": [
    { "userId": "string", "displayName": "string", "message": "short supportive message", "reason": "short" }
  ]
}
If there are no low-engagement users to nudge, return: { "nudges": [] }.
`;

  const user = JSON.stringify({
    meetingType,
    lowEngagement,
    cold_students: cold,
    class_summary: summary.summary,
  });
  const result = await callClaudeJSON(system, user);
  if (result) return result;
  return { nudges: [] };
}

// agent 4: quiz/poll generation agent
export async function quizPollAgent(topic, transcriptSnippet, engagementLevel) {
  const system = `
You are a quiz generator for a Zoom class.
Input: topic, engagement_level (1-3), transcriptSnippet.
Generate 2-3 short questions that test THIS snippet only.
If engagement_level=1, keep questions basic.
Return JSON:
{
  "topic": "...",
  "questions": [
    { "id": "q1", "type": "mcq", "question": "...", "options": ["..."], "correctIndex": 0 },
    { "id": "q2", "type": "open", "question": "..." }
  ]
}
No explanations.
`;

  const user = JSON.stringify({
    topic,
    engagement_level: engagementLevel,
    transcriptSnippet,
  });

  const result = await callClaudeJSON(system, user);
  if (result) return result;
  return { topic, questions: [{ id: "q1", type: "mcq", question: "API not configured—add CLAUDE_API_KEY to server/.env", options: ["OK"], correctIndex: 0 }] };
}
