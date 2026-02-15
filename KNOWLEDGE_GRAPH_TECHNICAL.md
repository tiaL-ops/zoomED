# Knowledge Graph System - Technical Documentation

## Architecture Overview

The knowledge graph system integrates into the existing multi-agent orchestration pipeline as a new intermediate step between engagement analysis and intervention generation.

### System Flow

```
Transcripts Arrive
    |
    v
Meeting State Storage
    |
    v
Orchestration Triggered
    |
    +-- Step 1: engagementSummarizerAgent
    |       Analyzes all participants
    |       Returns per-participant contexts
    |
    +-- Step 2: notesExtractorAgent (NEW)
    |       Analyzes transcripts
    |       Builds knowledge graph
    |       Returns graph structure
    |
    +-- Step 3: Per-Participant Chains (ENHANCED)
    |       nudgeAgent -> quizPollAgent
    |       quizPollAgent now receives knowledge graph
    |       Questions linked to specific concepts
    |
    v
Results Aggregation
    |
    +-- Store knowledge graph in meeting state
    +-- Store per-participant progress
    +-- Return to client
```

### Data Structures

#### Meeting State
```javascript
meetingState[meetingId] = {
  meetingId: string,
  events: Array<Event>,
  recentTranscriptSnippets: Array<{
    userId: string,
    displayName: string,
    text: string,
    timestamp: number
  }>,
  currentTopic: string,
  
  // NEW: Class-level knowledge graph
  knowledgeGraph: {
    title: string,
    key_points: Array<{
      id: string,
      title: string,
      summary: string,
      details: Array<string>,
      importance: 'high' | 'medium' | 'low',
      timestamp: string | null
    }>,
    associations: Array<{
      from_id: string,
      to_id: string,
      relationship_type: 'prerequisite' | 'related' | 'contradicts' | 'example_of' | 'expands_on',
      description: string
    }>,
    tags: Array<string>,
    summary: string
  },
  
  // NEW: Per-participant knowledge progress
  participantKnowledgeProgress: {
    [userId: string]: {
      userId: string,
      displayName: string,
      masteredConcepts: Array<string>,      // Concept IDs
      strugglingConcepts: Array<string>,    // Concept IDs
      encounteredConcepts: Array<string>,   // All concept IDs seen
      quizHistory: Array<{
        timestamp: number,
        topic: string,
        difficulty: number,
        questions: Array<{
          id: string,
          linkedConcepts: Array<string>
        }>
      }>,
      lastUpdated: number
    }
  }
}
```

#### Knowledge Graph Schema
```typescript
interface KnowledgeGraph {
  title: string;
  key_points: KeyPoint[];
  associations: Association[];
  tags: string[];
  summary: string;
}

interface KeyPoint {
  id: string;              // e.g., "kp1", "kp2"
  title: string;           // e.g., "Newton's Second Law"
  summary: string;         // Brief description
  details: string[];       // Supporting information
  importance: 'high' | 'medium' | 'low';
  timestamp: string | null;
}

interface Association {
  from_id: string;
  to_id: string;
  relationship_type: 'prerequisite' | 'related' | 'contradicts' | 'example_of' | 'expands_on';
  description: string;
}
```

#### Participant Progress Schema
```typescript
interface ParticipantProgress {
  userId: string;
  displayName: string;
  masteredConcepts: string[];      // IDs of concepts they got right
  strugglingConcepts: string[];    // IDs of concepts they got wrong
  encounteredConcepts: string[];   // All concept IDs in their quizzes
  quizHistory: QuizRecord[];
  lastUpdated: number;
}

interface QuizRecord {
  timestamp: number;
  topic: string;
  difficulty: number;
  questions: {
    id: string;
    linkedConcepts: string[];
  }[];
}
```

## Implementation Details

### Agent Modifications

#### 1. orchestrateEngagementSystem (agents.js)

**Before:**
```javascript
export async function orchestrateEngagementSystem(meeting, options = {}) {
  const classContext = {
    recentTranscript: (meeting.recentTranscriptSnippets || []).join(' ')
  };
  
  const summary = await engagementSummarizerAgent(meeting);
  
  // Immediately run participant chains
  const participantResults = await Promise.all(
    participantsNeedingHelp.map(p => executeParticipantChain(p, classContext))
  );
  
  return { summary, interventions: participantResults };
}
```

**After:**
```javascript
export async function orchestrateEngagementSystem(meeting, options = {}) {
  const classContext = {
    recentTranscript: (meeting.recentTranscriptSnippets || [])
      .map(s => s.text || s)  // FIXED: Extract text property
      .join(' ')
  };
  
  const summary = await engagementSummarizerAgent(meeting);
  
  // NEW: Extract knowledge graph from transcript
  let knowledgeGraph = null;
  if (classContext.recentTranscript.trim().length > 0) {
    try {
      knowledgeGraph = await notesExtractorAgent(classContext.recentTranscript);
    } catch (error) {
      console.warn('[Orchestrator] Knowledge graph extraction failed:', error.message);
    }
  }
  
  // Run participant chains with knowledge graph
  const participantResults = await Promise.all(
    participantsNeedingHelp.map(p => 
      executeParticipantChain(p, classContext, knowledgeGraph)
    )
  );
  
  return {
    knowledgeGraph,  // NEW
    summary,
    interventions: participantResults
  };
}
```

**Key Changes:**
- Added knowledge graph extraction step
- Fixed transcript extraction bug (`.map(s => s.text || s)`)
- Pass knowledge graph to participant chains
- Return knowledge graph in results

#### 2. executeParticipantChain (agents.js)

**Before:**
```javascript
export async function executeParticipantChain(participantContext, classContext) {
  const nudgeResult = await nudgeAgent(participantContext, classContext);
  
  if (nudgeResult.needsQuiz) {
    const quizResult = await quizPollAgent(enrichedContext, classContext);
  }
}
```

**After:**
```javascript
export async function executeParticipantChain(
  participantContext, 
  classContext, 
  knowledgeGraph = null  // NEW parameter
) {
  const nudgeResult = await nudgeAgent(participantContext, classContext);
  
  if (nudgeResult.needsQuiz) {
    const quizResult = await quizPollAgent(
      enrichedContext, 
      classContext, 
      knowledgeGraph  // PASS to quiz agent
    );
  }
}
```

**Key Changes:**
- Accept `knowledgeGraph` parameter
- Pass it to `quizPollAgent`

#### 3. quizPollAgent (agents.js)

**Before:**
```javascript
export async function quizPollAgent(participantContext, classContext) {
  const system = `Generate quiz questions for this participant.`;
  
  return await callClaudeJSON(system, user);
}
```

**After:**
```javascript
export async function quizPollAgent(
  participantContext, 
  classContext, 
  knowledgeGraph = null  // NEW parameter
) {
  // Build knowledge context from graph
  const knowledgeContext = knowledgeGraph ? {
    key_points: knowledgeGraph.key_points?.map(kp => ({
      id: kp.id,
      title: kp.title,
      summary: kp.summary,
      importance: kp.importance
    })) || [],
    associations: knowledgeGraph.associations || []
  } : null;
  
  const system = `
Generate quiz questions for this participant.
${knowledgeContext ? 'Use the knowledge graph to ensure questions target key concepts.' : ''}

Return JSON with questions including linkedConcepts field:
{
  "questions": [
    { 
      "id": "q1", 
      "question": "...", 
      "linkedConcepts": ["kp1", "kp2"]  // NEW
    }
  ]
}
  `;
  
  const user = JSON.stringify({
    participant: participantContext,
    knowledgeGraph: knowledgeContext  // NEW
  });
  
  return await callClaudeJSON(system, user);
}
```

**Key Changes:**
- Accept `knowledgeGraph` parameter
- Extract relevant concepts from graph
- Pass to Claude in system prompt
- Questions now include `linkedConcepts` field

#### 4. notesExtractorAgent (agents.js)

**New Agent:**
```javascript
export async function notesExtractorAgent(transcript, userConversation = "") {
  const system = `
You are an intelligent notes extraction system for educational meetings.
Create a knowledge graph with key_points (concepts) and associations (relationships).

Return STRICT JSON format:
{
  "title": "Meeting Summary",
  "key_points": [
    {
      "id": "kp1",
      "title": "Concept Name",
      "summary": "Brief description",
      "details": ["detail1", "detail2"],
      "importance": "high" | "medium" | "low",
      "timestamp": null
    }
  ],
  "associations": [
    {
      "from_id": "kp1",
      "to_id": "kp2",
      "relationship_type": "prerequisite",
      "description": "How they connect"
    }
  ],
  "summary": "Overall summary",
  "tags": ["topic1", "topic2"]
}
  `;
  
  const user = JSON.stringify({ transcript, user_conversation: userConversation });
  
  return await callClaudeJSON(system, user, 2048);  // Higher max_tokens
}
```

**Purpose:**
- Analyzes transcript text
- Identifies key concepts (key_points)
- Maps relationships between concepts (associations)
- Returns structured knowledge graph

#### 5. callClaudeJSON (agents.js)

**Before:**
```javascript
async function callClaudeJSON(system, user) {
  const resp = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }]
  });
  return extractJSON(resp.content[0].text);
}
```

**After:**
```javascript
async function callClaudeJSON(system, user, maxTokens = 1024) {
  const resp = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: maxTokens,  // Now configurable
    system,
    messages: [{ role: "user", content: user }]
  });
  return extractJSON(resp.content[0].text);
}
```

**Key Changes:**
- Added `maxTokens` parameter (default 1024)
- Allows knowledge graph extraction to use more tokens (2048)

### Endpoint Implementations

#### 1. GET /api/knowledge-graph/:meetingId (index.js)

```javascript
app.get('/api/knowledge-graph/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const meeting = meetingState[meetingId];
  
  if (!meeting) {
    return res.status(404).json({ error: 'meeting not found' });
  }
  
  if (!meeting.knowledgeGraph) {
    return res.status(404).json({ error: 'no knowledge graph for this meeting yet' });
  }
  
  res.json({
    meetingId,
    knowledgeGraph: meeting.knowledgeGraph,
    generatedAt: meeting.knowledgeGraph.timestamp || Date.now()
  });
});
```

**Purpose:** Retrieve class-level knowledge graph

#### 2. GET /api/knowledge-graph/:meetingId/:userId (index.js)

```javascript
app.get('/api/knowledge-graph/:meetingId/:userId', (req, res) => {
  const { meetingId, userId } = req.params;
  const meeting = meetingState[meetingId];
  
  if (!meeting) {
    return res.status(404).json({ error: 'meeting not found' });
  }
  
  const progress = meeting.participantKnowledgeProgress?.[userId];
  
  if (!progress) {
    return res.status(404).json({ error: 'no knowledge progress for this participant yet' });
  }
  
  // Enrich with class-level graph for context
  const enrichedProgress = {
    ...progress,
    classKnowledgeGraph: meeting.knowledgeGraph || null,
    conceptDetails: (meeting.knowledgeGraph?.key_points || [])
      .filter(kp => progress.encounteredConcepts.includes(kp.id))
      .map(kp => ({
        id: kp.id,
        title: kp.title,
        summary: kp.summary,
        importance: kp.importance,
        mastered: progress.masteredConcepts.includes(kp.id),
        struggling: progress.strugglingConcepts.includes(kp.id)
      }))
  };
  
  res.json(enrichedProgress);
});
```

**Purpose:** Retrieve per-participant progress with concept details

#### 3. POST /api/knowledge-graph/:meetingId/:userId/update-mastery (index.js)

```javascript
app.post('/api/knowledge-graph/:meetingId/:userId/update-mastery', (req, res) => {
  const { meetingId, userId } = req.params;
  const { conceptId, mastered } = req.body;
  
  const meeting = meetingState[meetingId];
  if (!meeting) {
    return res.status(404).json({ error: 'meeting not found' });
  }
  
  if (!meeting.participantKnowledgeProgress) {
    meeting.participantKnowledgeProgress = {};
  }
  
  if (!meeting.participantKnowledgeProgress[userId]) {
    meeting.participantKnowledgeProgress[userId] = {
      userId,
      displayName: 'Unknown',
      masteredConcepts: [],
      strugglingConcepts: [],
      encounteredConcepts: [],
      quizHistory: [],
      lastUpdated: Date.now()
    };
  }
  
  const progress = meeting.participantKnowledgeProgress[userId];
  
  if (mastered) {
    // Add to mastered, remove from struggling
    if (!progress.masteredConcepts.includes(conceptId)) {
      progress.masteredConcepts.push(conceptId);
    }
    progress.strugglingConcepts = progress.strugglingConcepts.filter(c => c !== conceptId);
  } else {
    // Add to struggling, remove from mastered
    if (!progress.strugglingConcepts.includes(conceptId)) {
      progress.strugglingConcepts.push(conceptId);
    }
    progress.masteredConcepts = progress.masteredConcepts.filter(c => c !== conceptId);
  }
  
  progress.lastUpdated = Date.now();
  
  res.json({
    success: true,
    userId,
    conceptId,
    mastered,
    progress: {
      masteredCount: progress.masteredConcepts.length,
      strugglingCount: progress.strugglingConcepts.length,
      encounteredCount: progress.encounteredConcepts.length
    }
  });
});
```

**Purpose:** Update concept mastery status after quiz grading

#### 4. GET /api/knowledge-graph/:meetingId/participants/all (index.js)

```javascript
app.get('/api/knowledge-graph/:meetingId/participants/all', (req, res) => {
  const { meetingId } = req.params;
  const meeting = meetingState[meetingId];
  
  if (!meeting) {
    return res.status(404).json({ error: 'meeting not found' });
  }
  
  const allProgress = meeting.participantKnowledgeProgress || {};
  
  const summary = {
    meetingId,
    totalParticipants: Object.keys(allProgress).length,
    classKnowledgeGraph: meeting.knowledgeGraph || null,
    participants: Object.values(allProgress).map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      masteredConceptsCount: p.masteredConcepts.length,
      strugglingConceptsCount: p.strugglingConcepts.length,
      totalConceptsEncountered: p.encounteredConcepts.length,
      quizzesAttempted: p.quizHistory.length,
      lastUpdated: p.lastUpdated
    }))
  };
  
  res.json(summary);
});
```

**Purpose:** Get class-wide overview for teacher dashboard

#### 5. Enhanced POST /api/orchestrate (index.js)

```javascript
app.post('/api/orchestrate', async (req, res) => {
  const { meetingId } = req.body;
  const meeting = meetingState[meetingId];
  
  const result = await orchestrateEngagementSystem(meeting, { 
    meetingType: 'education' 
  });
  
  // Store results
  meeting.lastOrchestrationResult = result;
  meeting.lastSummary = result.summary;
  
  // NEW: Store knowledge graph
  if (result.knowledgeGraph) {
    meeting.knowledgeGraph = result.knowledgeGraph;
    console.log(`[Orchestrate] Knowledge graph stored with ${result.knowledgeGraph.key_points?.length || 0} concepts`);
  }
  
  // NEW: Store per-participant progress
  if (!meeting.participantKnowledgeProgress) {
    meeting.participantKnowledgeProgress = {};
  }
  
  for (const intervention of result.interventions) {
    const userId = intervention.userId;
    
    if (!meeting.participantKnowledgeProgress[userId]) {
      meeting.participantKnowledgeProgress[userId] = {
        userId,
        displayName: intervention.displayName,
        masteredConcepts: [],
        strugglingConcepts: [],
        encounteredConcepts: [],
        quizHistory: [],
        lastUpdated: Date.now()
      };
    }
    
    // Track which concepts were in their quiz
    const quizAction = intervention.actions?.find(a => a.agent === 'quiz');
    if (quizAction?.output) {
      const quiz = quizAction.output;
      const quizEntry = {
        timestamp: Date.now(),
        topic: quiz.topic,
        difficulty: quiz.difficulty,
        questions: quiz.questions?.map(q => ({
          id: q.id,
          linkedConcepts: q.linkedConcepts || []
        })) || []
      };
      
      meeting.participantKnowledgeProgress[userId].quizHistory.push(quizEntry);
      
      // Add to encountered concepts
      const conceptsInThisQuiz = quiz.questions?.flatMap(q => q.linkedConcepts || []) || [];
      meeting.participantKnowledgeProgress[userId].encounteredConcepts = [
        ...new Set([
          ...meeting.participantKnowledgeProgress[userId].encounteredConcepts,
          ...conceptsInThisQuiz
        ])
      ];
    }
    
    meeting.participantKnowledgeProgress[userId].lastUpdated = Date.now();
  }
  
  // Broadcast to clients...
  res.json(result);
});
```

**Key Changes:**
- Store knowledge graph in meeting state
- Initialize participant progress tracking
- Track concepts encountered in quizzes
- Store quiz history per participant

## Database Schema (for Production)

### MongoDB Collections

```javascript
// knowledge_graphs collection
{
  _id: ObjectId,
  meetingId: String,
  graph: {
    title: String,
    key_points: Array,
    associations: Array,
    tags: Array,
    summary: String
  },
  createdAt: Date,
  updatedAt: Date
}

// participant_progress collection
{
  _id: ObjectId,
  meetingId: String,
  userId: String,
  displayName: String,
  masteredConcepts: [String],
  strugglingConcepts: [String],
  encounteredConcepts: [String],
  quizHistory: Array,
  lastUpdated: Date,
  
  // Indexes
  indexes: {
    meetingId_userId: { meetingId: 1, userId: 1, unique: true },
    meetingId: { meetingId: 1 },
    userId: { userId: 1 }
  }
}
```

### PostgreSQL Tables

```sql
-- knowledge_graphs table
CREATE TABLE knowledge_graphs (
  id SERIAL PRIMARY KEY,
  meeting_id VARCHAR(255) UNIQUE NOT NULL,
  graph_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_id ON knowledge_graphs(meeting_id);

-- participant_progress table
CREATE TABLE participant_progress (
  id SERIAL PRIMARY KEY,
  meeting_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  mastered_concepts JSONB DEFAULT '[]',
  struggling_concepts JSONB DEFAULT '[]',
  encountered_concepts JSONB DEFAULT '[]',
  quiz_history JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX idx_meeting_user ON participant_progress(meeting_id, user_id);
CREATE INDEX idx_meeting ON participant_progress(meeting_id);
```

## Performance Considerations

### Current Bottlenecks

1. **Knowledge Graph Extraction**
   - Claude API call: 2-5 seconds
   - Runs on every orchestration
   - Blocks participant chain execution

2. **Parallel Participant Chains**
   - Good: Uses Promise.all()
   - Issue: All chains wait for slowest one

3. **In-Memory Storage**
   - Fast reads/writes
   - No persistence
   - Memory usage grows with participants

### Optimizations

#### 1. Cache Knowledge Graphs
```javascript
// Only regenerate if transcript changed significantly
const transcriptHash = hashTranscript(classContext.recentTranscript);
if (meeting.lastTranscriptHash !== transcriptHash) {
  knowledgeGraph = await notesExtractorAgent(classContext.recentTranscript);
  meeting.lastTranscriptHash = transcriptHash;
  meeting.knowledgeGraph = knowledgeGraph;
} else {
  knowledgeGraph = meeting.knowledgeGraph;
}
```

#### 2. Debounce Orchestration
```javascript
// Don't run if last orchestration was < 5 seconds ago
const MIN_INTERVAL = 5000;
if (Date.now() - meeting.lastOrchestrationTime < MIN_INTERVAL) {
  return meeting.lastOrchestrationResult;
}
```

#### 3. Index Participant Progress
```javascript
// Use Map for faster lookups
meeting.participantProgressMap = new Map(
  Object.entries(meeting.participantKnowledgeProgress)
);
```

## Error Handling

### Knowledge Graph Extraction Failure

```javascript
let knowledgeGraph = null;
if (transcript && transcript.trim().length > 0) {
  try {
    knowledgeGraph = await notesExtractorAgent(transcript);
  } catch (error) {
    console.warn('[Orchestrator] Knowledge graph extraction failed:', error.message);
    // System continues without graph
    // Quizzes still generated, just without concept linking
  }
}
```

**Graceful Degradation:**
- Quiz generation still works without graph
- linkedConcepts field may be empty or generic
- System doesn't crash

### Invalid Concept IDs

```javascript
// When updating mastery, validate concept exists
const conceptExists = meeting.knowledgeGraph?.key_points
  ?.some(kp => kp.id === conceptId);

if (!conceptExists) {
  return res.status(400).json({ 
    error: 'Invalid concept ID',
    availableConcepts: meeting.knowledgeGraph?.key_points?.map(kp => kp.id) || []
  });
}
```

### Missing Participant Progress

```javascript
// Auto-initialize if not exists
if (!meeting.participantKnowledgeProgress[userId]) {
  meeting.participantKnowledgeProgress[userId] = {
    userId,
    displayName: 'Unknown',
    masteredConcepts: [],
    strugglingConcepts: [],
    encounteredConcepts: [],
    quizHistory: [],
    lastUpdated: Date.now()
  };
}
```

## Testing Strategy

### Unit Tests
```javascript
describe('notesExtractorAgent', () => {
  it('should extract concepts from transcript', async () => {
    const transcript = "Newton's Second Law: F = ma";
    const graph = await notesExtractorAgent(transcript);
    
    expect(graph.key_points).toHaveLength(greaterThan(0));
    expect(graph.key_points[0]).toHaveProperty('id');
    expect(graph.key_points[0]).toHaveProperty('title');
  });
  
  it('should create associations between concepts', async () => {
    const transcript = "Force causes acceleration. Acceleration is the rate of change of velocity.";
    const graph = await notesExtractorAgent(transcript);
    
    expect(graph.associations).toHaveLength(greaterThan(0));
    expect(graph.associations[0]).toHaveProperty('from_id');
    expect(graph.associations[0]).toHaveProperty('to_id');
    expect(graph.associations[0]).toHaveProperty('relationship_type');
  });
});

describe('quizPollAgent with knowledge graph', () => {
  it('should include linkedConcepts in questions', async () => {
    const knowledgeGraph = {
      key_points: [{ id: 'kp1', title: 'Test Concept' }]
    };
    
    const quiz = await quizPollAgent(participantContext, classContext, knowledgeGraph);
    
    expect(quiz.questions[0]).toHaveProperty('linkedConcepts');
    expect(quiz.questions[0].linkedConcepts).toContain('kp1');
  });
});
```

### Integration Tests
```javascript
describe('Knowledge Graph API', () => {
  it('should store and retrieve knowledge graph', async () => {
    // Send transcript
    await request(app)
      .post('/api/transcript')
      .send({ meetingId: 'test', text: 'Newton law...' });
    
    // Trigger orchestration
    const orchRes = await request(app)
      .post('/api/orchestrate')
      .send({ meetingId: 'test' });
    
    expect(orchRes.body.knowledgeGraph).toBeDefined();
    
    // Retrieve graph
    const graphRes = await request(app)
      .get('/api/knowledge-graph/test');
    
    expect(graphRes.body.knowledgeGraph).toBeDefined();
  });
  
  it('should track participant progress', async () => {
    // Setup: orchestration with low-engagement student
    // ...
    
    // Update mastery
    await request(app)
      .post('/api/knowledge-graph/test/student1/update-mastery')
      .send({ conceptId: 'kp1', mastered: true });
    
    // Verify
    const progressRes = await request(app)
      .get('/api/knowledge-graph/test/student1');
    
    expect(progressRes.body.masteredConcepts).toContain('kp1');
  });
});
```

## Security Considerations

### Input Validation
```javascript
// Validate concept IDs match pattern
const conceptIdPattern = /^kp\d+$/;
if (!conceptIdPattern.test(conceptId)) {
  return res.status(400).json({ error: 'Invalid concept ID format' });
}

// Validate user IDs
if (!userId || userId.length > 255) {
  return res.status(400).json({ error: 'Invalid user ID' });
}

// Sanitize transcript input
const sanitizedTranscript = transcript.trim().slice(0, 10000);
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const orchestrationLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 requests per minute per meeting
  keyGenerator: (req) => req.body.meetingId
});

app.post('/api/orchestrate', orchestrationLimiter, async (req, res) => {
  // ...
});
```

### Authentication
```javascript
// Verify user can access meeting data
function canAccessMeeting(userId, meetingId) {
  // Check if user is participant or instructor
  const meeting = meetingState[meetingId];
  return meeting.participants.some(p => p.userId === userId) ||
         meeting.instructorId === userId;
}

app.get('/api/knowledge-graph/:meetingId/:userId', (req, res) => {
  if (!canAccessMeeting(req.session.userId, req.params.meetingId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  // ...
});
```

## Monitoring and Logging

### Key Metrics
```javascript
// Track knowledge graph generation time
console.time('knowledge-graph-extraction');
const graph = await notesExtractorAgent(transcript);
console.timeEnd('knowledge-graph-extraction');

// Track concept counts
console.log(`[Metrics] Concepts: ${graph.key_points.length}, Associations: ${graph.associations.length}`);

// Track participant progress updates
console.log(`[Metrics] Progress update for ${userId}: ${masteredCount} mastered, ${strugglingCount} struggling`);

// Track API response times
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;
console.log(`[Metrics] ${endpoint} took ${duration}ms`);
```

### Error Tracking
```javascript
try {
  const graph = await notesExtractorAgent(transcript);
} catch (error) {
  console.error('[Error] Knowledge graph extraction failed:', {
    error: error.message,
    stack: error.stack,
    transcriptLength: transcript.length,
    meetingId: meeting.meetingId
  });
  
  // Send to error tracking service
  errorTracker.captureException(error, {
    context: { meetingId, transcriptLength: transcript.length }
  });
}
```
