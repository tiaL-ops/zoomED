# API Reference: Complete Wiring

## Overview

All endpoints needed for caption → quiz generation pipeline:

```
Zoom Captions
    ↓
POST /api/transcript     ← Captions arrive here
    ↓
POST /api/topic          ← Optional: Set lesson topic
    ↓
POST /api/events         ← Student engagement events
    ↓
POST /api/orchestrate    ← MAIN: Generates nudges + quizzes
    ↓
GET /api/report          ← View meeting state
```

---

## Endpoints

### 1. POST /api/transcript
**Receives Zoom live captions (real-time)**

**Request:**
```bash
curl -X POST http://localhost:3000/api/transcript \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-123",
    "userId": "instructor-1",           (optional)
    "displayName": "Dr. Smith",         (optional)
    "text": "Newton'\''s first law states that...",
    "topic": "Newton'\''s Laws of Motion",
    "timestamp": 1707974400000          (optional, auto-added)
  }'
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| meetingId | string | ✓ | Unique meeting identifier |
| userId | string | | User ID of speaker (default: 'instructor') |
| displayName | string | | Display name (default: 'Instructor') |
| text | string | ✓ | The caption text |
| topic | string | | Current lesson topic |
| timestamp | number | | When caption occurred (default: now) |

**Response:**
```json
{
  "ok": true,
  "snippetCount": 42,
  "topic": "Newton's Laws of Motion"
}
```

**Usage in Zoom App:**
```javascript
// zoomapp/app.js
fetch('http://localhost:3000/api/transcript', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meetingId: context.meetingID,
    displayName: 'Instructor',
    text: payload.caption,
    topic: 'Current Lesson Topic'
  })
});
```

---

### 2. POST /api/topic
**Set or update the current lesson topic**

**Request:**
```bash
curl -X POST http://localhost:3000/api/topic \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-123",
    "topic": "Newton'\''s Laws of Motion"
  }'
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| meetingId | string | ✓ | Meeting ID |
| topic | string | ✓ | Lesson topic (used for quiz generation) |

**Response:**
```json
{
  "ok": true,
  "topic": "Newton's Laws of Motion",
  "meetingId": "meeting-123"
}
```

**When to Use:**
- Before class starts, set the topic
- When instructor switches topics mid-class
- To ensure quiz questions match the lesson

---

### 3. POST /api/events
**Ingest student engagement events**

**Request:**
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-123",
    "userId": "student-1",
    "displayName": "Alice",
    "type": "ATTENTION_SCORE",
    "cv_attention_score": 0.2
  }'
```

**Common Event Types:**

| Type | Payload | Description |
|------|---------|-------------|
| ATTENTION_SCORE | `cv_attention_score: 0-1` | Gaze attention (0=away, 1=focused) |
| QUIZ_ANSWER | `isCorrect: bool, responseTimeMs: number` | Student answered quiz |
| CHAT_MESSAGE | `message: string` | Student chat |
| VIDEO_STATE | `video_on: bool` | Video on/off |

**Response:**
```json
{
  "ok": true
}
```

---

### 4. POST /api/orchestrate
**MAIN: Run multi-agent system to generate nudges + quizzes**

**This is the key endpoint that ties everything together!**

**Request:**
```bash
curl -X POST http://localhost:3000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting-123"
  }'
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| meetingId | string | ✓ | Meeting ID |

**Response:**
```json
{
  "timestamp": 1707974400000,
  "meetingId": "meeting-123",
  "summary": {
    "classEngagement": 2,
    "totalParticipants": 25,
    "participantsNeedingHelp": 3,
    "classSummary": "Class showing moderate engagement..."
  },
  "interventions": [
    {
      "userId": "student-2",
      "displayName": "Bob",
      "engagement": 1,
      "success": true,
      "actions": [
        {
          "agent": "nudge",
          "output": { /* nudge object */ }
        },
        {
          "agent": "quiz",
          "output": { /* quiz object */ }
        }
      ]
    }
  ],
  "nudges": [
    {
      "userId": "student-2",
      "displayName": "Bob",
      "message": "When you're back, we'd love to have you with us!",
      "reason": "Low attention score",
      "needsQuiz": true,
      "recommendedDifficulty": 1
    }
  ],
  "quizzes": [
    {
      "userId": "student-2",
      "topic": "Newton's Laws of Motion",
      "difficulty": 1,
      "questions": [
        {
          "id": "q1",
          "type": "mcq",
          "question": "What does Newton's first law state?",
          "options": [
            "Acceleration increases",
            "Object at rest stays at rest unless acted upon",
            "Force equals mass times acceleration",
            "Action equals reaction"
          ],
          "correctIndex": 1
        }
      ],
      "encouragement": "Great effort! Let's check your understanding..."
    }
  ]
}
```

**What Happens Internally:**
1. Gets all captions stored in `meeting.recentTranscriptSnippets`
2. Gets current topic from `meeting.currentTopic`
3. Analyzes student engagement from `meeting.events`
4. Creates `classContext` with:
   - `recentTranscript`: Joined captions ("Newton's first law...")
   - `currentTopic`: "Newton's Laws of Motion"
   - `class_engagement`: 1-3 score
5. Identifies low-engagement students
6. For each:
   - Runs nudgeAgent → generates supportive message
   - Runs quizPollAgent → generates questions **based on transcript**
7. Aggregates all results

---

### 5. GET /api/report
**View current meeting state and history**

**Request:**
```bash
curl http://localhost:3000/api/report?meetingId=meeting-123
```

**Response:**
```json
{
  "meetingId": "meeting-123",
  "lastSummary": {
    "class_engagement": 2,
    "per_user": [
      { "userId": "student-1", "engagement": 3, "reason": "High participation" },
      { "userId": "student-2", "engagement": 1, "reason": "Low attention" }
    ],
    "cold_students": ["student-2"],
    "summary": "Class showing moderate engagement..."
  },
  "lastDecision": {
    "action": "GENERATE_POLL",
    "priority": "medium"
  },
  "eventCount": 145,
  "engagementHistory": [
    { "at": "2025-02-15T10:00:00Z", "class_engagement": 2, "cold_students": [...] }
  ]
}
```

---

## Data Structures

### ClassContext (Passed to Agents)
```javascript
{
  meetingId: "meeting-123",
  meetingType: "education",
  currentTopic: "Newton's Laws of Motion",
  recentTranscript: "Newton's first law states that an object... The second law...",
  class_engagement: 2,            // 1=low, 2=medium, 3=high
  summary: "Class showing moderate engagement...",
  timestamp: 1707974400000
}
```

### ParticipantContext (Per-Student)
```javascript
{
  userId: "student-2",
  displayName: "Bob",
  engagement: 1,                  // 1=low, 2=medium, 3=high
  reason: "Low attention score",
  signals: {
    polls_answered: 0,
    polls_missed: 1,
    chat_messages: 0,
    avg_response_latency_ms: 15000,
    cv_attention_score: 0.2,
    video_on: true
  },
  needsAttention: true,
  recommendedDifficulty: 1        // Added by nudgeAgent
}
```

### Nudge Object
```javascript
{
  userId: "student-2",
  displayName: "Bob",
  message: "When you're back, we'd love to have you with us!",
  reason: "Low attention",
  needsQuiz: true,
  recommendedDifficulty: 1
}
```

### Quiz Object
```javascript
{
  userId: "student-2",
  topic: "Newton's Laws of Motion",
  difficulty: 1,
  questions: [
    {
      id: "q1",
      type: "mcq",
      question: "What does Newton's first law state?",
      options: [
        "Acceleration increases",
        "Object at rest stays at rest unless acted upon",
        "Force equals mass times acceleration",
        "Action equals reaction"
      ],
      correctIndex: 1
    }
  ],
  encouragement: "Great effort! Let's check your understanding..."
}
```

---

## Complete Flow Example

```bash
# 1. Set topic
curl -X POST http://localhost:3000/api/topic \
  -d '{"meetingId":"m1", "topic":"Newton'\''s Laws"}'

# 2. Send captions
curl -X POST http://localhost:3000/api/transcript \
  -d '{"meetingId":"m1", "text":"Newton'\''s first law..."}'

# 3. Send student attention event
curl -X POST http://localhost:3000/api/events \
  -d '{"meetingId":"m1", "userId":"s1", "type":"ATTENTION_SCORE", "cv_attention_score":0.2}'

# 4. Generate quizzes
curl -X POST http://localhost:3000/api/orchestrate \
  -d '{"meetingId":"m1"}'

# Response includes quizzes about Newton's Laws!
```

---

## Auto-Triggered Flow (Recommended)

```javascript
// zoomapp/app.js
import { startCompleteFlow } from './COMPLETE_INTEGRATION.js';

const context = ZoomIntl.getContext();
await startCompleteFlow(context.meetingID);

// Now:
// - Captions auto-sent to /api/transcript every ~1 second
// - /api/orchestrate called every 10 seconds
// - Nudges + quizzes generated automatically
// - Results broadcast to students
```

---

## Troubleshooting Endpoints

```bash
# Check if server running
curl http://localhost:3000/api/report?meetingId=test

# Check meeting state
curl http://localhost:3000/api/report?meetingId=meeting-123

# Manual test caption
curl -X POST http://localhost:3000/api/transcript \
  -d '{"meetingId":"test", "text":"Test caption", "topic":"Test"}'

# Manual test orchestrate
curl -X POST http://localhost:3000/api/orchestrate \
  -d '{"meetingId":"test"}'
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "missing meetingId or text"
}
```

### 404 Not Found
```json
{
  "error": "meeting not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Error message from server"
}
```

---

## Performance Notes

- **Transcript endpoint**: < 10ms per caption
- **Orchestrator endpoint**: 2-5s (depends on Claude API)
- **Memory**: Keeps last 100 captions per meeting
- **Parallel processing**: Multiple students handled simultaneously

---

## Integration Checklist

- [ ] `/api/topic` - Set lesson topic
- [ ] `/api/transcript` - Receives Zoom captions
- [ ] `/api/events` - Receives student engagement
- [ ] `/api/orchestrate` - Generates nudges + quizzes
- [ ] `/api/report` - Monitor meeting state
- [ ] Auto-timer - Every 10s runs `/api/orchestrate`
- [ ] WebSocket broadcast - Results sent to students
- [ ] Quiz content - Based on captions ✓

You're all set! 🚀
