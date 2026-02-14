// server/agents.ts
import dotenv from "dotenv";
dotenv.config();

import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY! });

async function callClaudeJSON(system: string, user: string, maxTokens: number = 800) {
  const resp = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = resp.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in response");
  }
  try {
    return JSON.parse(textBlock.text);
  } catch (e) {
    console.error("Failed to parse JSON response:", textBlock.text);
    throw e;
  }
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

// agent 4: notes extractor - converts transcripts into associated notes with key points
export async function notesExtractorAgent(transcript: string, userConversation: string = "") {
  const system = `
You are an intelligent notes extraction system for educational meetings.
Your task: Convert a meeting transcript and user conversation into structured notes with associated knowledge nodes.

Create a knowledge graph where:
1. "key_points" are main concepts/topics discussed (nodes)
2. "associations" show how different points connect to each other
3. "details" are supporting information for each key point

Return STRICT JSON format:
{
  "title": "Meeting Summary",
  "key_points": [
    {
      "id": "kp1",
      "title": "Concept Name",
      "summary": "Brief 1-2 sentence summary",
      "details": ["detail 1", "detail 2"],
      "importance": "high" | "medium" | "low",
      "timestamp": "HH:MM:SS or null"
    }
  ],
  "associations": [
    {
      "from_id": "kp1",
      "to_id": "kp2",
      "relationship_type": "prerequisite" | "related" | "contradicts" | "example_of" | "expands_on",
      "description": "How they connect"
    }
  ],
  "summary": "Overall meeting summary",
  "tags": ["topic1", "topic2"]
}

Guidelines:
- Limit to 5-8 key points per meeting
- Identify diverse relationships between concepts
- Mark important concepts as "high" importance
- Focus on educational value and knowledge retention
- Extract timestamp if available from transcript
`;

  const user = JSON.stringify({
    transcript,
    user_conversation: userConversation,
  });

  return await callClaudeJSON(system, user, 2048);
}

// agent 5: agent-to-notes conversation handler
export async function agentNotesChatAgent(userQuery: string, currentNotes: any) {
  const system = `
You are a note-taking assistant that helps users refine and expand meeting notes.
Given the current notes structure and a user query, provide updated notes or suggestions.
Keep the same JSON structure but update relevant fields.
If user asks to add a concept, create a new key_point.
If user asks to connect ideas, add new associations.

Return the updated notes JSON or a helpful response if clarifying is needed.
`;

  const user = JSON.stringify({
    query: userQuery,
    current_notes: currentNotes,
  });

  return await callClaudeJSON(system, user);
}