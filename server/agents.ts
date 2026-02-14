// server/agents.ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });

async function callClaudeJSON(system: string, user: string) {
  const resp = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = resp.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }
  return JSON.parse(textBlock.text);
}

// agent #1: engagement summarizer
export async function engagementSummarizerAgent(meeting: any) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const events = (meeting.events || []).filter((e: any) => now - e.ts <= windowMs);

  const usersMap = new Map<string, any>();
  for (const e of events) {
    const u = usersMap.get(e.userId) || {
      userId: e.userId,
      displayName: e.displayName,
      signals: {
        polls_answered: 0,
        polls_missed: 0,
        chat_messages: 0,
        game_interactions: 0,
        avg_response_latency_ms: 0,
        cv_attention_score: e.cv_attention_score ?? null,
        video_on: e.video_on ?? true,
        _latencies: [] as number[],
      },
    };
    if (e.type === "QUIZ_ANSWER") {
      if (e.isCorrect || e.isCorrect === false) {
        u.signals.polls_answered += 1;
        u.signals._latencies.push(e.responseTimeMs);
      }
    }
    if (e.type === "CHAT_MESSAGE") {
      u.signals.chat_messages += 1;
    }
    // Add other event types as needed
    usersMap.set(e.userId, u);
  }

  const users = Array.from(usersMap.values()).map((u) => {
    const arr = u.signals._latencies;
    u.signals.avg_response_latency_ms = arr.length
      ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length
      : 0;
    delete u.signals._latencies;
    return u;
  });

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

// agent #2: meeting coordinator agent
export async function meetingCoordinatorAgent(summary: any, meeting: any) {
  const recentPolls = (meeting.events || [])
    .filter((e: any) => e.type === "QUIZ_ANSWER")
    .slice(-20); // simplistic

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
    recentTranscriptSnippets: meeting.recentTranscriptSnippets || [],
  });

  return await callClaudeJSON(system, user);
}

// agent 3: quiz/poll generation agent
export async function quizPollAgent(topic: string, transcriptSnippet: string, engagementLevel: number) {
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