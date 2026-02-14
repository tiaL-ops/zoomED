// server/agents.js
import Anthropic from "@anthropic-ai/sdk";

let anthropic = null;

function getAnthropicClient() {
  if (!anthropic) {
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY environment variable is not set");
    }
    anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    console.log("Claude API initialized successfully");
  }
  return anthropic;
}

async function callClaudeJSON(system, user) {
  const client = getAnthropicClient();
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
  return JSON.parse(textBlock.text);
}

// agent #1: engagement summarizer (accepts snapshot with pre-built users)
export async function engagementSummarizerAgent(snapshot) {
  const users = snapshot.users || [];

  const system = `
You are an engagement summarizer for a live Zoom class.
You ONLY analyze engagement signals (polls, chat, game interactions, attention scores).
For each user, assign engagement 1 (low), 2 (medium), or 3 (high).
Return STRICT JSON:
{
  "class_engagement": 1|2|3,
  "per_user": [{"userId": "...", "engagement": 1|2|3, "reason": "short"}],
  "cold_students": ["userId", ...],
  "summary": "1-2 sentences"
}
`;

  const user = JSON.stringify({ users });
  return await callClaudeJSON(system, user);
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

  return await callClaudeJSON(system, user);
}

// agent 3: quiz/poll generation agent
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

  return await callClaudeJSON(system, user);
}
