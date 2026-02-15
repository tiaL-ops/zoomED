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

async function callClaudeJSON(system, user, maxTokens = 1024) {
  const client = getAnthropicClient();
  if (!client) return null;
  const resp = await client.messages.create({
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
    return extractJSON(textBlock.text);
  } catch (e) {
    console.warn("Claude response was not valid JSON:", (textBlock.text || "").slice(0, 200));
    return null;
  }
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
Analyze engagement signals (polls, chat, attention scores).
When recentTranscriptSnippets is provided, use it to summarize what was covered in class in the "summary" field (1-2 sentences: topic/material covered + engagement).
An active chat user is someone who sends at least one message (chat_messages >= 1).
For each user, assign engagement 1 (low), 2 (medium), or 3 (high).
Return STRICT JSON:
{
  "class_engagement": 1|2|3,
  "per_user": [{"userId": "...", "engagement": 1|2|3, "reason": "short"}],
  "cold_students": ["userId", ...],
  "summary": "1-2 sentences (include what was covered if transcript provided)",
  "needs_intervention": true|false
}
`;

  const transcriptSnippets = meeting.recentTranscriptSnippets || [];
  const transcriptPreview = transcriptSnippets.length
    ? transcriptSnippets.slice(-5).map((s) => (s && s.text ? s.text : '')).join(' ').slice(0, 1500)
    : '';
  const user = JSON.stringify({
    users,
    ...(transcriptPreview ? { recentTranscriptSnippets: transcriptPreview } : {}),
  });
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

// agent 3b: transcribing agent – turns raw transcript + optional lecture into one clean "lecture content" for the poll agent
// Use this when live transcript is flaky or you want one place to normalize what was taught before generating questions.
export async function transcribingAgent(transcriptSnippets = [], uploadedLecture = '', summaryFallback = '') {
  const rawLines = (transcriptSnippets || [])
    .map((s) => (s && s.text ? String(s.text).trim() : ''))
    .filter(Boolean);
  const rawTranscript = rawLines.join(' ').trim().slice(0, 6000);
  const lecture = (uploadedLecture || '').trim().slice(0, 4000);
  const summary = (summaryFallback || '').trim().slice(0, 2000);

  const system = `
You are a lecture transcriber for a live class. You receive raw live caption snippets from Zoom (often fragmentary or repeated) and optional uploaded lecture notes.

Your job: produce ONE clean "lecture content" block that will be used to generate quiz questions. Merge fragments into coherent sentences, drop filler (um, uh), fix obvious repeats. If the host provided uploaded lecture notes, include those so the scope of the class is clear. If raw transcript is empty but lecture notes or a summary exist, use those as the lecture content.

Return JSON only:
{ "lectureContent": "one coherent paragraph or a few sentences of what was covered in class, or empty string if nothing usable" }
Do not add commentary. Just the JSON.
`;

  const user = JSON.stringify({
    rawTranscript: rawTranscript || '(no live transcript)',
    uploadedLecture: lecture || '(none)',
    summaryFallback: summary || '(none)',
  });

  const out = await callClaudeJSON(system, user);
  const content = (out && out.lectureContent != null) ? String(out.lectureContent).trim() : '';
  return { lectureContent: content };
}

// agent 4: quiz/poll generation agent – lecture/transcript-based questions only (fed by transcribing agent when used)
// Backward-compatible: supports both new signature (participantContext, classContext)
// and legacy calls (topic, snippet, engagement).
export async function quizPollAgent(participantContext, classContext, legacyEngagementOrKnowledgeGraph) {
  const isLegacy = typeof participantContext === 'string';
  const normalizedParticipant = isLegacy
    ? {
        userId: 'class',
        displayName: 'Class',
        engagement: Number(legacyEngagementOrKnowledgeGraph) || 2,
        recommendedDifficulty: Number(legacyEngagementOrKnowledgeGraph) || 2,
        signals: {},
      }
    : (participantContext || {});

  const normalizedClass = isLegacy
    ? {
        currentTopic: participantContext || 'current lesson',
        recentTranscript: (classContext || ''),
        uploadedLecture: '',
      }
    : (classContext || {});

  const difficulty = normalizedParticipant.recommendedDifficulty || normalizedParticipant.engagement || 2;
  const topic = normalizedClass.currentTopic || 'current lesson';
  const transcriptSnippet = (normalizedClass.recentTranscript || '').trim();
  const uploadedLecture = (normalizedClass.uploadedLecture || '').trim();
  const knowledgeGraph = !isLegacy && legacyEngagementOrKnowledgeGraph && typeof legacyEngagementOrKnowledgeGraph === 'object'
    ? legacyEngagementOrKnowledgeGraph
    : null;
  const knowledgeContext = knowledgeGraph ? {
    key_points: (knowledgeGraph.key_points || []).map((kp) => ({
      id: kp.id,
      title: kp.title,
      summary: kp.summary,
      importance: kp.importance
    })),
    associations: knowledgeGraph.associations || []
  } : null;

  // Combined "allowed" material: what was said (transcript) + optional uploaded lecture so we don't ask out-of-context questions
  const allowedMaterial = [transcriptSnippet, uploadedLecture].filter(Boolean).join('\n\n---\n\n') || '(no material provided)';

  const system = `
You are a quiz generator for a live class. Generate questions based ONLY on the material provided below.

Rules:
1. Use ONLY the material below (live transcript and/or uploaded lecture). Every question must be answerable from this material. Do not ask about topics not covered here.
2. Generate 1-3 multiple-choice questions that check understanding of specific facts or concepts in the material that was actually spoken/taught.
3. If the material is empty or too short to derive meaningful questions, return exactly: { "questions": [] }
4. Do not invent content. Base each question on something explicitly stated or clearly implied in the material.

Return JSON only:
{
  "topic": "brief topic from the material",
  "questions": [
    { "id": "q1", "type": "mcq", "question": "...", "options": ["...", "..."], "correctIndex": 0 },
    { "id": "q2", "type": "mcq", "question": "...", "options": ["...", "..."], "correctIndex": 0 }
  ]
}
Use "mcq" with "options" and "correctIndex" for multiple choice. No other text.
`;

  const user = JSON.stringify({
    allowedMaterial,
    hasUploadedLecture: !!uploadedLecture,
    difficulty,
    topic,
    transcriptSnippet,
    knowledgeGraph: knowledgeContext
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
export async function executeParticipantChain(participantContext, classContext, knowledgeGraph = null) {
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

    // Step 2: If nudge recommends quiz, generate personalized quiz (now with knowledge graph)
    if (nudgeResult.needsQuiz) {
      console.log(`[Chain] Running quizPollAgent for ${participantContext.displayName}`);
      const enrichedContext = {
        ...participantContext,
        recommendedDifficulty: nudgeResult.recommendedDifficulty
      };
      const quizResult = await quizPollAgent(enrichedContext, classContext, knowledgeGraph);
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
 * 2. notesExtractorAgent (builds knowledge graph from transcript)
 * 3. Fan out: executeParticipantChain for each low-engagement participant (now knowledge-aware)
 * 4. Aggregate and return results with knowledge graph
 */
export async function orchestrateEngagementSystem(meeting, options = {}) {
  console.log('[Orchestrator] Starting multi-agent engagement system...');
  
  const classContext = {
    meetingId: meeting.meetingId,
    meetingType: options.meetingType || 'education',
    currentTopic: meeting.currentTopic || null,
    recentTranscript: (meeting.recentTranscriptSnippets || []).map(s => s.text || s).join(' '),
    timestamp: Date.now()
  };

  // Step 1: Run engagement summarizer (orchestrator agent)
  console.log('[Orchestrator] Running engagementSummarizerAgent...');
  const summary = await engagementSummarizerAgent(meeting);
  classContext.class_engagement = summary.class_engagement;
  classContext.summary = summary.summary;

  // Step 2: Extract knowledge graph from transcript
  let knowledgeGraph = null;
  const transcript = classContext.recentTranscript;
  if (transcript && transcript.trim().length > 0) {
    console.log('[Orchestrator] Running notesExtractorAgent to build knowledge graph...');
    try {
      knowledgeGraph = await notesExtractorAgent(transcript);
      console.log(`[Orchestrator] Knowledge graph created with ${knowledgeGraph.key_points?.length || 0} key concepts`);
    } catch (error) {
      console.warn('[Orchestrator] Knowledge graph extraction failed:', error.message);
      knowledgeGraph = null;
    }
  } else {
    console.log('[Orchestrator] No transcript available for knowledge graph extraction');
  }

  // Step 3: Identify participants needing intervention
  const participantsNeedingHelp = summary.participantContexts.filter(
    p => p.needsAttention || p.engagement === 1
  );

  console.log(`[Orchestrator] Found ${participantsNeedingHelp.length} participants needing intervention`);

  // Step 4: Execute parallel chains for each participant (now with knowledge graph)
  const participantResults = await Promise.all(
    participantsNeedingHelp.map(participant => 
      executeParticipantChain(participant, classContext, knowledgeGraph)
    )
  );

  // Step 5: Aggregate results
  const aggregatedResults = {
    timestamp: classContext.timestamp,
    meetingId: meeting.meetingId,
    knowledgeGraph: knowledgeGraph || null,
    summary: {
      classEngagement: summary.class_engagement,
      totalParticipants: summary.participantContexts.length,
      participantsNeedingHelp: participantsNeedingHelp.length,
      classSummary: summary.summary,
      topicsCovered: knowledgeGraph?.key_points?.map(kp => kp.title) || []
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
  if (knowledgeGraph) {
    console.log(`[Orchestrator] Knowledge graph: ${knowledgeGraph.key_points?.length || 0} concepts, ${knowledgeGraph.associations?.length || 0} relationships`);
  }

  return aggregatedResults;
}

// Helper: Generate follow-up questions from knowledge graph (for additional practice/review)
export async function generateFollowUpQuestionsFromGraph(knowledgeGraph, topic = '', difficulty = 2) {
  if (!knowledgeGraph || !knowledgeGraph.key_points || knowledgeGraph.key_points.length === 0) {
    return null;
  }

  const system = `
You are a quiz generator creating follow-up questions based on a knowledge graph.
Generate 3-5 questions that:
1. Cover different key_points from the graph
2. Test understanding of the associations/relationships
3. Match the difficulty level (1=basic, 2=intermediate, 3=advanced)

Return JSON:
{
  "topic": "string",
  "difficulty": 1|2|3,
  "questions": [
    { "id": "q1", "type": "mcq", "question": "...", "options": ["..."], "correctIndex": 0, "relatedConcepts": ["kp1", "kp2"] },
    { "id": "q2", "type": "open", "question": "...", "expectedKeywords": ["keyword1", "keyword2"] }
  ],
  "summary": "What these questions assess"
}
`;

  const user = JSON.stringify({
    knowledgeGraph,
    topic,
    difficulty
  });

  return await callClaudeJSON(system, user);
}

// agent 4: notes extractor - converts transcripts into associated notes with key points
export async function notesExtractorAgent(transcript, userConversation = "") {
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
export async function agentNotesChatAgent(userQuery, currentNotes) {
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
