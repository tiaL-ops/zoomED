# Multi-Agent Orchestration System

## Overview

The system implements a **per-participant multi-agent architecture** where agents work together in chains to provide personalized engagement interventions for each participant in a Zoom meeting.

## Architecture

### Flow Diagram

```
engagementSummarizerAgent (Orchestrator)
    ↓
Analyzes ALL participants
    ↓
Identifies low-engagement participants
    ↓
Fan-out to parallel chains
    ↓
┌─────────────────────────────────┐
│ Per-Participant Chain (Parallel)│
│                                  │
│  1. nudgeAgent                   │
│     ↓                            │
│  2. quizPollAgent (if needed)    │
└─────────────────────────────────┘
    ↓
Aggregate Results
```

## Agents

### 1. engagementSummarizerAgent (Orchestrator)
- **Input**: Meeting object with all events
- **Output**: 
  - Class-level engagement summary
  - Per-participant contexts with engagement scores
  - List of participants needing intervention
- **Role**: Analyzes all participants and creates structured contexts for downstream agents

### 2. nudgeAgent (Per-Participant)
- **Input**: Single participant context + class context
- **Output**:
  - Personalized supportive message
  - Decision on whether participant needs quiz
  - Recommended difficulty level
- **Role**: Creates gentle, personalized nudge for individual participant

### 3. quizPollAgent (Per-Participant)
- **Input**: Participant context + class context
- **Output**:
  - Personalized quiz questions
  - Difficulty-adjusted content
  - Encouraging message
- **Role**: Generates targeted questions based on participant's engagement level

## Context Structure

### Class Context (Shared)
```javascript
{
  meetingId: "string",
  meetingType: "education" | "meeting",
  currentTopic: "string",
  recentTranscript: "string",
  class_engagement: 1|2|3,
  summary: "string",
  timestamp: number
}
```

### Participant Context (Individual)
```javascript
{
  userId: "string",
  displayName: "string",
  engagement: 1|2|3,
  reason: "string",
  signals: {
    polls_answered: number,
    polls_missed: number,
    chat_messages: number,
    avg_response_latency_ms: number,
    cv_attention_score: number,
    video_on: boolean
  },
  needsAttention: boolean,
  recommendedDifficulty: 1|2|3  // Added by nudgeAgent
}
```

## Usage

### Option 1: Use the Orchestrator (Recommended)

```javascript
import { orchestrateEngagementSystem } from './agents.js';

// meeting object must have:
// - meetingId
// - events array
// - recentTranscriptSnippets (optional)
// - currentTopic (optional)

const result = await orchestrateEngagementSystem(meeting, {
  meetingType: 'education'
});

// Result structure:
{
  timestamp: number,
  meetingId: "string",
  summary: {
    classEngagement: 1|2|3,
    totalParticipants: number,
    participantsNeedingHelp: number,
    classSummary: "string"
  },
  interventions: [
    {
      userId: "string",
      displayName: "string",
      engagement: 1|2|3,
      success: boolean,
      actions: [
        { agent: 'nudge', output: {...} },
        { agent: 'quiz', output: {...} }  // if needed
      ]
    }
  ],
  nudges: [...],    // All nudges (convenience accessor)
  quizzes: [...]    // All quizzes (convenience accessor)
}
```

### Option 2: Use Individual Agents

```javascript
import { 
  engagementSummarizerAgent,
  nudgeAgent,
  quizPollAgent
} from './agents.js';

// Step 1: Get engagement summary
const summary = await engagementSummarizerAgent(meeting);

// Step 2: For each low-engagement participant
const participant = summary.participantContexts.find(p => p.engagement === 1);

const classContext = {
  meetingId: meeting.meetingId,
  meetingType: 'education',
  class_engagement: summary.class_engagement,
  summary: summary.summary,
  currentTopic: 'Physics',
  recentTranscript: 'transcript...'
};

// Step 3: Generate nudge
const nudge = await nudgeAgent(participant, classContext);

// Step 4: If needed, generate quiz
if (nudge.needsQuiz) {
  const enrichedParticipant = {
    ...participant,
    recommendedDifficulty: nudge.recommendedDifficulty
  };
  const quiz = await quizPollAgent(enrichedParticipant, classContext);
}
```

## API Endpoints

### POST /api/orchestrate
Runs the complete multi-agent system for a meeting.

**Request:**
```json
{
  "meetingId": "meeting-123"
}
```

**Response:**
```json
{
  "timestamp": 1234567890,
  "meetingId": "meeting-123",
  "summary": {
    "classEngagement": 2,
    "totalParticipants": 25,
    "participantsNeedingHelp": 3,
    "classSummary": "Class showing moderate engagement..."
  },
  "interventions": [...],
  "nudges": [...],
  "quizzes": [...]
}
```

## Key Features

### 1. Parallel Processing
- Each low-engagement participant gets their own chain
- All chains run in parallel using `Promise.all()`
- Efficient for large classes

### 2. Context Isolation
- Each participant chain operates with isolated context
- No interference between participant interventions
- Class-level context shared for consistency

### 3. Conditional Chaining
- nudgeAgent decides if quizPollAgent should run
- Avoids unnecessary quiz generation
- Personalized intervention depth

### 4. Error Handling
- Per-participant error isolation
- Failed chains don't affect other participants
- Graceful degradation

### 5. History Tracking
- Can extend participant context with history
- Track previous nudges/interventions
- Adapt based on past responses

## Benefits Over Previous Design

1. **Personalization**: Each participant gets tailored nudges and quizzes
2. **Scalability**: Parallel processing handles large classes efficiently
3. **Modularity**: Easy to add new agents to the chain
4. **Context Preservation**: Full participant history flows through chain
5. **Observability**: Clear logging at each step
6. **Flexibility**: Can run orchestrator or individual agents as needed

## Future Enhancements

1. **History-Based Adaptation**
   - Track intervention effectiveness per participant
   - Adjust strategies based on response patterns

2. **Additional Agents**
   - Content recommendation agent
   - Peer collaboration suggester
   - Break reminder agent

3. **Dynamic Chaining**
   - Agents can dynamically route to different next agents
   - Conditional branching based on context

4. **Batch Interventions**
   - Group similar participants
   - Generate cohort-based interventions
