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

// agent #1: engagement summarizer
export async function engagementSummarizerAgent(meeting) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const events = (meeting.events || []).filter((e) => e.ts != null && now - e.ts <= windowMs);

  const usersMap = new Map();
  for (const e of events) {
    const uid = e.userId ?? "anonymous";
    const u = usersMap.get(uid) || {
      userId: uid,
      displayName: e.displayName ?? uid,
      signals: {
        polls_answered: 0,
        polls_missed: 0,
        chat_messages: 0,
        avg_response_latency_ms: 0,
        cv_attention_score: e.cv_attention_score ?? null,
        video_on: e.video_on ?? true,
        _latencies: [],
      },
    };
    if (e.type === "QUIZ_ANSWER" || e.type === "QUIZ_RESPONSE") {
      if (e.isCorrect === true || e.isCorrect === false) {
        u.signals.polls_answered += 1;
        if (e.responseTimeMs != null) u.signals._latencies.push(e.responseTimeMs);
      }
    }
    if (e.type === "CHAT_MESSAGE" || e.type === "CHAT") {
      u.signals.chat_messages += 1;
    }
    if (e.type === "ATTENTION_SCORE" || e.type === "GAZE") {
      const score = e.cv_attention_score ?? e.avgGaze ?? e.gazeScore;
      if (score != null) {
        u.signals.cv_attention_score = u.signals.cv_attention_score != null
          ? (u.signals.cv_attention_score + Number(score)) / 2
          : Number(score);
      }
    }
    usersMap.set(uid, u);
  }

  const users = Array.from(usersMap.values()).map((u) => {
    const arr = u.signals._latencies;
    u.signals.avg_response_latency_ms = arr.length
      ? arr.reduce((a, b) => a + b, 0) / arr.length
      : 0;
    delete u.signals._latencies;
    return u;
  });

  const system = `
You are an engagement summarizer for a live Zoom class.
You ONLY analyze engagement signals (polls, chat, attention scores).
An active chat user is someone who sends at least one message (chat_messages >= 1).
For each user, assign engagement 1 (low), 2 (medium), or 3 (high).
Return STRICT JSON:
{
  "class_engagement": 1|2|3,
  "per_user": [{"userId": "...", "engagement": 1|2|3, "reason": "short"}],
  "cold_students": ["userId", ...],
  "summary": "1-2 sentences",
  "needs_intervention": true|false
}
`;

  const user = JSON.stringify({ users });
  const summary = await callClaudeJSON(system, user);
  
  // Enrich with full participant contexts for chaining
  summary.participantContexts = users.map(u => {
    const engagement = summary.per_user.find(pu => pu.userId === u.userId);
    return {
      userId: u.userId,
      displayName: u.displayName,
      engagement: engagement?.engagement || 2,
      reason: engagement?.reason || '',
      signals: u.signals,
      needsAttention: summary.cold_students.includes(u.userId)
    };
  });
  
  return summary;
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

// agent #3: nudge agent – first line of defense: gentle nudge with leeway (away, restroom, parent, etc.)
// NOW WORKS ON SINGLE PARTICIPANT
export async function nudgeAgent(participantContext, classContext) {
  const meetingType = classContext.meetingType || 'education'; // 'education' | 'meeting'
  
  const system = `
You are a nudge agent for a live meeting. Your job is to create a short, supportive message to re-engage THIS SPECIFIC attendee who appears disengaged.
Give them leeway: they might be away briefly, in the restroom, or have a parent or someone else speaking to them. The nudge should be kind and assume good intent—not punishment or guilt. Frame as "when you're back, we'd love to have you with us" or "no rush—rejoin when you're ready."
For education: warm, encouraging, understanding.
For adult/professional meetings: neutral, professional (e.g. "When you're free, we'd love your input").
Keep the message to 1–2 short sentences.

Also decide if this participant needs follow-up (quiz/poll) based on their engagement pattern.

Return STRICT JSON only:
{
  "userId": "string",
  "displayName": "string",
  "message": "short supportive message",
  "reason": "why this nudge",
  "needsQuiz": true|false,
  "recommendedDifficulty": 1|2|3
}
`;

  const user = JSON.stringify({
    meetingType,
    participant: {
      userId: participantContext.userId,
      displayName: participantContext.displayName,
      engagement: participantContext.engagement,
      reason: participantContext.reason,
      signals: participantContext.signals
    },
    classContext: {
      overallEngagement: classContext.class_engagement,
      classSummary: classContext.summary,
      currentTopic: classContext.currentTopic || 'general'
    }
  });
  
  return await callClaudeJSON(system, user);
}

// agent 4: quiz/poll generation agent
// NOW PERSONALIZED TO PARTICIPANT CONTEXT
export async function quizPollAgent(participantContext, classContext) {
  const difficulty = participantContext.recommendedDifficulty || participantContext.engagement;
  const topic = classContext.currentTopic || 'current lesson';
  const transcriptSnippet = classContext.recentTranscript || '';
  
  const system = `
You are a quiz generator for a Zoom class.
Generate 2-3 personalized questions for THIS SPECIFIC participant based on their engagement level.
If difficulty=1 (low engagement), keep questions basic and encouraging.
If difficulty=2-3, make questions more challenging.
Focus on the recent topic/transcript provided.

Return JSON:
{
  "userId": "string",
  "topic": "...",
  "difficulty": 1|2|3,
  "questions": [
    { "id": "q1", "type": "mcq", "question": "...", "options": ["..."], "correctIndex": 0 },
    { "id": "q2", "type": "open", "question": "..." }
  ],
  "encouragement": "short encouraging message for this participant"
}
No additional explanations.
`;

  const user = JSON.stringify({
    participant: {
      userId: participantContext.userId,
      displayName: participantContext.displayName,
      engagement: participantContext.engagement,
      signals: participantContext.signals
    },
    difficulty,
    topic,
    transcriptSnippet,
  });

  return await callClaudeJSON(system, user);
}

// ============================================
// MULTI-AGENT ORCHESTRATION
// ============================================

/**
 * Execute the agent chain for a single participant:
 * nudgeAgent → quizPollAgent (if needed)
 */
export async function executeParticipantChain(participantContext, classContext) {
  const result = {
    userId: participantContext.userId,
    displayName: participantContext.displayName,
    engagement: participantContext.engagement,
    actions: []
  };

  try {
    // Step 1: Generate nudge for this participant
    console.log(`[Chain] Running nudgeAgent for ${participantContext.displayName}`);
    const nudgeResult = await nudgeAgent(participantContext, classContext);
    result.actions.push({
      agent: 'nudge',
      output: nudgeResult
    });

    // Step 2: If nudge recommends quiz, generate personalized quiz
    if (nudgeResult.needsQuiz) {
      console.log(`[Chain] Running quizPollAgent for ${participantContext.displayName}`);
      const enrichedContext = {
        ...participantContext,
        recommendedDifficulty: nudgeResult.recommendedDifficulty
      };
      const quizResult = await quizPollAgent(enrichedContext, classContext);
      result.actions.push({
        agent: 'quiz',
        output: quizResult
      });
    }

    result.success = true;
  } catch (error) {
    console.error(`[Chain] Error for ${participantContext.displayName}:`, error);
    result.success = false;
    result.error = error.message;
  }

  return result;
}

/**
 * Main orchestrator: Runs the entire multi-agent system
 * 1. engagementSummarizerAgent (analyzes all participants)
 * 2. Fan out: executeParticipantChain for each low-engagement participant
 * 3. Aggregate and return results
 */
export async function orchestrateEngagementSystem(meeting, options = {}) {
  console.log('[Orchestrator] Starting multi-agent engagement system...');
  
  const classContext = {
    meetingId: meeting.meetingId,
    meetingType: options.meetingType || 'education',
    currentTopic: meeting.currentTopic || null,
    recentTranscript: (meeting.recentTranscriptSnippets || []).join(' '),
    timestamp: Date.now()
  };

  // Step 1: Run engagement summarizer (orchestrator agent)
  console.log('[Orchestrator] Running engagementSummarizerAgent...');
  const summary = await engagementSummarizerAgent(meeting);
  classContext.class_engagement = summary.class_engagement;
  classContext.summary = summary.summary;

  // Step 2: Identify participants needing intervention
  const participantsNeedingHelp = summary.participantContexts.filter(
    p => p.needsAttention || p.engagement === 1
  );

  console.log(`[Orchestrator] Found ${participantsNeedingHelp.length} participants needing intervention`);

  // Step 3: Execute parallel chains for each participant
  const participantResults = await Promise.all(
    participantsNeedingHelp.map(participant => 
      executeParticipantChain(participant, classContext)
    )
  );

  // Step 4: Aggregate results
  const aggregatedResults = {
    timestamp: classContext.timestamp,
    meetingId: meeting.meetingId,
    summary: {
      classEngagement: summary.class_engagement,
      totalParticipants: summary.participantContexts.length,
      participantsNeedingHelp: participantsNeedingHelp.length,
      classSummary: summary.summary
    },
    interventions: participantResults,
    // Convenience accessors
    nudges: participantResults
      .filter(r => r.success)
      .map(r => r.actions.find(a => a.agent === 'nudge')?.output)
      .filter(Boolean),
    quizzes: participantResults
      .filter(r => r.success)
      .map(r => r.actions.find(a => a.agent === 'quiz')?.output)
      .filter(Boolean)
  };

  console.log('[Orchestrator] Multi-agent system complete');
  console.log(`[Orchestrator] Generated ${aggregatedResults.nudges.length} nudges, ${aggregatedResults.quizzes.length} quizzes`);

  return aggregatedResults;
}
